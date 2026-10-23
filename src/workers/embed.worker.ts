import { ModelRegistry, env, pipeline, type ProgressInfo } from '@huggingface/transformers';
import { EMBED_DTYPE, EMBED_MODEL_ID, EMBED_TASK, QUERY_PREFIX } from '../features/search/config';
import type { FromEmbedWorker, ToEmbedWorker } from '../features/search/protocol';

// Text embeddings for semantic search. Like the Whisper worker, this is the only other importer
// of @huggingface/transformers. It runs on the CPU (WASM): the model is small, and keeping the
// GPU for Whisper avoids the two competing for memory.
env.allowLocalModels = false;

interface Tensor {
  dims: number[];
  data: Float32Array;
}
type Extractor = (texts: string[], options: Record<string, unknown>) => Promise<Tensor>;

function post(message: FromEmbedWorker, transfer: Transferable[] = []): void {
  self.postMessage(message, { transfer });
}

let loadPromise: Promise<Extractor> | null = null;
let lastProgressAt = 0;

function ensureLoaded(): Promise<Extractor> {
  if (!loadPromise) {
    loadPromise = (async () => {
      const progress_callback = (info: ProgressInfo) => {
        if (info.status !== 'progress_total') return;
        const now = Date.now();
        if (now - lastProgressAt < 100 && info.progress < 100) return;
        lastProgressAt = now;
        post({ type: 'progress', progress: info.progress });
      };
      return (await pipeline(EMBED_TASK, EMBED_MODEL_ID, {
        device: 'wasm',
        dtype: EMBED_DTYPE,
        progress_callback,
      })) as unknown as Extractor;
    })();
    loadPromise.catch(() => {
      loadPromise = null;
    });
  }
  return loadPromise;
}

async function embed(id: number, texts: string[], query: boolean): Promise<void> {
  try {
    const extract = await ensureLoaded();
    const input = query ? texts.map((text) => QUERY_PREFIX + text) : texts;
    const output = await extract(input, { pooling: 'cls', normalize: true });
    const size = output.dims[output.dims.length - 1] ?? 0;
    const vectors = texts.map((_, i) => output.data.slice(i * size, (i + 1) * size));
    post(
      { type: 'result', id, vectors },
      vectors.map((v) => v.buffer),
    );
  } catch (error) {
    post({ type: 'error', id, stage: 'embed', message: String(error) });
  }
}

self.onmessage = (event: MessageEvent<ToEmbedWorker>) => {
  const message = event.data;
  switch (message.type) {
    case 'probe':
      void ModelRegistry.is_pipeline_cached(EMBED_TASK, EMBED_MODEL_ID, { dtype: EMBED_DTYPE })
        .then((cached) => post({ type: 'probe-result', cached: Boolean(cached) }))
        .catch((error: unknown) => post({ type: 'error', stage: 'probe', message: String(error) }));
      break;
    case 'load':
      ensureLoaded()
        .then(() => post({ type: 'ready' }))
        .catch((error: unknown) => post({ type: 'error', stage: 'load', message: String(error) }));
      break;
    case 'embed':
      void embed(message.id, message.texts, message.query);
      break;
  }
};
