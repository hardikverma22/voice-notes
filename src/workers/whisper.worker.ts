import { ModelRegistry, env, pipeline, type ProgressInfo } from '@huggingface/transformers';
import {
  ASR_TASK,
  DTYPE_WASM,
  DTYPE_WEBGPU,
  FINAL_CHUNK_LENGTH_S,
  FINAL_STRIDE_LENGTH_S,
  LANGUAGE,
  MODEL_ID,
  SAMPLE_RATE,
} from '../features/transcribe/config';
import type {
  Device,
  FromWorker,
  Segment,
  ToWorker,
  TranscribeKind,
} from '../features/transcribe/protocol';

// This file is the only importer of @huggingface/transformers (see PLAN.md, Do NOT #4).
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
  requestAdapter(): Promise<unknown | null>;
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

// Transcription queue: at most one job runs at a time. A new live request replaces a queued
// live request. Final requests are never dropped and run before queued live requests.
let busy = false;
let queuedLive: { id: number; audio: Float32Array } | null = null;
const queuedFinal: { id: number; audio: Float32Array }[] = [];

async function runJob(id: number, kind: TranscribeKind, audio: Float32Array): Promise<void> {
  const started = performance.now();
  try {
    const asr = await ensureLoaded();
    const output = (await asr(audio, {
      language: LANGUAGE,
      task: 'transcribe',
      return_timestamps: true,
      ...(kind === 'final'
        ? { chunk_length_s: FINAL_CHUNK_LENGTH_S, stride_length_s: FINAL_STRIDE_LENGTH_S }
        : {}),
    })) as AsrOutput;
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
  let job: { id: number; kind: TranscribeKind; audio: Float32Array } | undefined;
  const final = queuedFinal.shift();
  if (final) {
    job = { ...final, kind: 'final' };
  } else if (queuedLive) {
    job = { ...queuedLive, kind: 'live' };
    queuedLive = null;
  }
  if (!job) return;
  busy = true;
  try {
    await runJob(job.id, job.kind, job.audio);
  } finally {
    busy = false;
    void pump();
  }
}

function enqueue(kind: TranscribeKind, id: number, audio: Float32Array): void {
  if (kind === 'final') {
    queuedFinal.push({ id, audio });
  } else {
    if (queuedLive) {
      post({ type: 'error', id: queuedLive.id, stage: 'transcribe', message: 'superseded' });
    }
    queuedLive = { id, audio };
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
      enqueue(message.kind, message.id, message.audio);
      break;
  }
};
