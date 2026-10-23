import { ModelRegistry, env, pipeline, type ProgressInfo } from '@huggingface/transformers';
import {
  ACCURATE_MODEL_ID,
  ASR_TASK,
  DTYPE_ACCURATE,
  DTYPE_WASM,
  DTYPE_WEBGPU,
  FINAL_CHUNK_LENGTH_S,
  FINAL_STRIDE_LENGTH_S,
  LANGUAGE,
  MODEL_ID,
  SAMPLE_RATE,
} from '../features/transcribe/config';
import { looksStuck, REPEAT_GUARD } from '../features/transcribe/stuck';
import type {
  Device,
  FromWorker,
  Segment,
  ToWorker,
  TranscribeKind,
} from '../features/transcribe/protocol';

// This file is the only importer of @huggingface/transformers; keep it out of the main bundle.
env.allowLocalModels = false;

interface AsrChunk {
  text: string;
  timestamp: [number, number | null];
}
interface AsrOutput {
  text: string;
  chunks?: AsrChunk[];
}
type Asr = (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;

interface GpuLike {
  requestAdapter(): Promise<{ features: Set<string> } | null>;
}

function post(message: FromWorker): void {
  self.postMessage(message);
}

async function pickDevice(): Promise<Device> {
  try {
    if (!('gpu' in navigator)) return 'wasm';
    const gpu = (navigator as unknown as { gpu: GpuLike }).gpu;
    const adapter = await gpu.requestAdapter();
    return adapter !== null ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

let activeDevice: Device | null = null;
let loadPromise: Promise<Asr> | null = null;

// Progress is throttled to one message per 100 ms; the last value is always sent.
let lastProgressAt = 0;
let pendingProgress: FromWorker | null = null;
let progressTimer: ReturnType<typeof setTimeout> | undefined;

function emitProgress(message: FromWorker): void {
  pendingProgress = message;
  const elapsed = Date.now() - lastProgressAt;
  if (elapsed >= 100) {
    flushProgress();
  } else if (progressTimer === undefined) {
    progressTimer = setTimeout(() => {
      progressTimer = undefined;
      flushProgress();
    }, 100 - elapsed);
  }
}

function flushProgress(): void {
  if (!pendingProgress) return;
  lastProgressAt = Date.now();
  post(pendingProgress);
  pendingProgress = null;
}

async function createPipeline(device: Device): Promise<Asr> {
  const dtype = device === 'webgpu' ? DTYPE_WEBGPU : DTYPE_WASM;
  const progress_callback = (info: ProgressInfo) => {
    if (info.status === 'progress_total') {
      emitProgress({
        type: 'progress',
        loaded: info.loaded,
        total: info.total,
        progress: info.progress,
      });
    }
  };
  const asr = (await pipeline(ASR_TASK, MODEL_ID, {
    device,
    dtype,
    progress_callback,
  })) as unknown as Asr;
  // Warm-up: the first real call is slow otherwise. Output is ignored.
  await asr(new Float32Array(SAMPLE_RATE), { language: LANGUAGE, task: 'transcribe' });
  return asr;
}

function ensureLoaded(): Promise<Asr> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const device = activeDevice ?? (await pickDevice());
      activeDevice = device;
      try {
        return await createPipeline(device);
      } catch (error) {
        if (device !== 'webgpu') throw error;
        console.warn('WebGPU load failed, retrying on WASM', error);
        activeDevice = 'wasm';
        return createPipeline('wasm');
      }
    })();
    // Allow a retry after a failed load.
    loadPromise.catch(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

// Accurate model: whisper-small, WebGPU with fp16 only. Loaded on request, used for final passes.
let accuratePromise: Promise<Asr> | null = null;
let lastAccurateProgressAt = 0;

async function accurateSupported(): Promise<boolean> {
  try {
    if (!('gpu' in navigator)) return false;
    const adapter = await (navigator as unknown as { gpu: GpuLike }).gpu.requestAdapter();
    return adapter?.features.has('shader-f16') ?? false;
  } catch {
    return false;
  }
}

/**
 * Whether the Accurate model's two weight files are in the browser cache. Checked directly:
 * the library's own check does not recognise this mixed-precision setup.
 */
async function accurateFilesCached(): Promise<boolean> {
  try {
    if (typeof caches === 'undefined' || !(await caches.has('transformers-cache'))) return false;
    const urls = (await (await caches.open('transformers-cache')).keys()).map((r) => r.url);
    const files = [
      `encoder_model_${DTYPE_ACCURATE.encoder_model}.onnx`,
      `decoder_model_merged_${DTYPE_ACCURATE.decoder_model_merged}.onnx`,
    ];
    return files.every((file) =>
      urls.some((url) => url.includes(`/${ACCURATE_MODEL_ID}/`) && url.endsWith(file)),
    );
  } catch {
    return false;
  }
}

function ensureAccurate(): Promise<Asr> {
  if (!accuratePromise) {
    accuratePromise = (async () => {
      if (!(await accurateSupported()))
        throw new Error('This device cannot run the Accurate model.');
      // One model loads at a time: two large loads at once can exhaust memory.
      if (loadPromise) await loadPromise.catch(() => undefined);
      const progress_callback = (info: ProgressInfo) => {
        if (info.status !== 'progress_total') return;
        const now = Date.now();
        if (now - lastAccurateProgressAt < 100 && info.progress < 100) return;
        lastAccurateProgressAt = now;
        post({ type: 'accurate-progress', progress: info.progress });
      };
      const asr = (await pipeline(ASR_TASK, ACCURATE_MODEL_ID, {
        device: 'webgpu',
        dtype: DTYPE_ACCURATE,
        progress_callback,
      })) as unknown as Asr;
      await asr(new Float32Array(SAMPLE_RATE), { language: LANGUAGE, task: 'transcribe' });
      return asr;
    })();
    accuratePromise.catch(() => {
      accuratePromise = null;
    });
  }
  return accuratePromise;
}

// Transcription queue: at most one job runs at a time. A new live request replaces a queued
// live request. Final requests are never dropped and run before queued live requests.
let busy = false;
let queuedLive: Job | null = null;
const queuedFinal: Job[] = [];

interface Job {
  id: number;
  kind: TranscribeKind;
  audio: Float32Array;
  language: string | null;
  accurate: boolean;
}

async function runJob({ id, kind, audio, language, accurate }: Job): Promise<void> {
  const started = performance.now();
  try {
    const asr = accurate && kind === 'final' ? await ensureAccurate() : await ensureLoaded();
    const decode = async (guard: boolean) =>
      (await asr(audio, {
        ...(language ? { language } : {}),
        task: 'transcribe',
        return_timestamps: true,
        ...(guard ? REPEAT_GUARD : {}),
        ...(kind === 'final'
          ? { chunk_length_s: FINAL_CHUNK_LENGTH_S, stride_length_s: FINAL_STRIDE_LENGTH_S }
          : {}),
      })) as AsrOutput;
    // Non-English always decodes with the loop guard. English decodes plainly (the guard can
    // alter real repeated phrases) and retries with it only if the result looks stuck.
    const guardFirst = language !== null && language !== 'english';
    let output = await decode(guardFirst);
    if (!guardFirst && looksStuck(output.text)) output = await decode(true);
    const chunks: Segment[] = (output.chunks ?? []).map((chunk) => ({
      text: chunk.text,
      start: chunk.timestamp[0],
      end: chunk.timestamp[1],
    }));
    post({ type: 'result', id, kind, text: output.text, chunks, ms: performance.now() - started });
  } catch (error) {
    post({
      type: 'error',
      id,
      stage: 'transcribe',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function pump(): Promise<void> {
  if (busy) return;
  let job: Job | undefined = queuedFinal.shift();
  if (!job && queuedLive) {
    job = queuedLive;
    queuedLive = null;
  }
  if (!job) return;
  busy = true;
  try {
    await runJob(job);
  } finally {
    busy = false;
    void pump();
  }
}

function enqueue(job: Job): void {
  if (job.kind === 'final') {
    queuedFinal.push(job);
  } else {
    if (queuedLive) {
      post({ type: 'error', id: queuedLive.id, stage: 'transcribe', message: 'superseded' });
    }
    queuedLive = job;
  }
  void pump();
}

async function handleProbe(): Promise<void> {
  try {
    const device = await pickDevice();
    activeDevice = device;
    const dtype = device === 'webgpu' ? DTYPE_WEBGPU : DTYPE_WASM;
    const cached = await ModelRegistry.is_pipeline_cached(ASR_TASK, MODEL_ID, {
      device,
      dtype,
    }).catch(() => false);
    post({
      type: 'probe-result',
      device,
      cached: Boolean(cached),
      approxDownloadMB: device === 'webgpu' ? 202 : 80,
    });
  } catch (error) {
    post({
      type: 'error',
      stage: 'probe',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

self.onmessage = (event: MessageEvent<ToWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'probe':
      void handleProbe();
      break;
    case 'load':
      ensureLoaded()
        .then(() => post({ type: 'ready', device: activeDevice ?? 'wasm', modelId: MODEL_ID }))
        .catch((error: unknown) =>
          post({
            type: 'error',
            stage: 'load',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      break;
    case 'transcribe':
      enqueue({
        id: message.id,
        kind: message.kind,
        audio: message.audio,
        language: message.language,
        accurate: message.accurate,
      });
      break;
    case 'probe-accurate':
      void (async () => {
        const supported = await accurateSupported();
        const cached = supported ? await accurateFilesCached() : false;
        post({ type: 'accurate-probe-result', supported, cached: Boolean(cached) });
      })();
      break;
    case 'load-accurate':
      ensureAccurate()
        .then(() => post({ type: 'accurate-ready', modelId: ACCURATE_MODEL_ID }))
        .catch((error: unknown) =>
          post({
            type: 'error',
            stage: 'load-accurate',
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      break;
  }
};
