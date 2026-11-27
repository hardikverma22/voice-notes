import type { Voice } from './config';

/** Messages to src/workers/tts.worker.ts. */
export type ToTtsWorker =
  | { type: 'load' }
  | { type: 'speak'; id: number; text: string; voice: Voice; speed: number; seed: number };

/** Messages from the worker. */
export type FromTtsWorker =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; sampleRate: number }
  /** audio is null when the sentence has nothing the model can read (another script, symbols). */
  | { type: 'audio'; id: number; audio: Float32Array | null }
  | { type: 'error'; id: number | null; message: string };
