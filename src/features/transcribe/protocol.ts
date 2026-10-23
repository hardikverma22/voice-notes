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
  | { type: 'probe-accurate' }
  | { type: 'load-accurate' }
  | {
      type: 'transcribe';
      id: number;
      kind: TranscribeKind;
      audio: Float32Array;
      /** Whisper language name, or null to auto-detect. */
      language: string | null;
      /** Use the Accurate model (final pass only; must be loaded). */
      accurate: boolean;
    };

/** Worker -> main thread. */
export type FromWorker =
  | { type: 'probe-result'; device: Device; cached: boolean; approxDownloadMB: number }
  | { type: 'progress'; loaded: number; total: number; progress: number }
  | { type: 'ready'; device: Device; modelId: string }
  | { type: 'accurate-probe-result'; supported: boolean; cached: boolean }
  | { type: 'accurate-progress'; progress: number }
  | { type: 'accurate-ready'; modelId: string }
  | {
      type: 'result';
      id: number;
      kind: TranscribeKind;
      text: string;
      chunks: Segment[];
      ms: number;
    }
  | {
      type: 'error';
      id?: number;
      stage: 'probe' | 'load' | 'transcribe' | 'probe-accurate' | 'load-accurate';
      message: string;
    };
