export interface Segment {
  text: string;
  start: number; // seconds, relative to the audio that was sent
  end: number | null;
}

export type Device = 'webgpu' | 'wasm';
export type TranscribeKind = 'live' | 'final';

/** Main thread -> worker. */
export type ToWorker =
  | { type: 'probe' }
  | { type: 'load' }
  | {
      type: 'transcribe';
      id: number;
      kind: TranscribeKind;
      audio: Float32Array;
      /** Whisper language name, or null to auto-detect. */
      language: string | null;
    };

/** Worker -> main thread. */
export type FromWorker =
  | { type: 'probe-result'; device: Device; cached: boolean; approxDownloadMB: number }
  | { type: 'progress'; loaded: number; total: number; progress: number }
  | { type: 'ready'; device: Device; modelId: string }
  | {
      type: 'result';
      id: number;
      kind: TranscribeKind;
      text: string;
      chunks: Segment[];
      ms: number;
    }
  | { type: 'error'; id?: number; stage: 'probe' | 'load' | 'transcribe'; message: string };
