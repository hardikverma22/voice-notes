/** Main thread -> embedding worker. */
export type ToEmbedWorker =
  | { type: 'probe' }
  | { type: 'load' }
  | { type: 'embed'; id: number; texts: string[]; query: boolean };

/** Embedding worker -> main thread. Vectors are normalised, so a dot product is the cosine. */
export type FromEmbedWorker =
  | { type: 'probe-result'; cached: boolean }
  | { type: 'progress'; progress: number }
  | { type: 'ready' }
  | { type: 'result'; id: number; vectors: Float32Array[] }
  | { type: 'error'; id?: number; stage: 'probe' | 'load' | 'embed'; message: string };
