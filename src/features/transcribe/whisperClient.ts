import type { FromWorker, Segment, ToWorker, TranscribeKind } from './protocol';

export interface TranscribeResult {
  id: number;
  kind: TranscribeKind;
  text: string;
  chunks: Segment[];
  ms: number;
}

type Listener = (message: FromWorker) => void;
interface Pending {
  kind: TranscribeKind;
  resolve(result: TranscribeResult): void;
  reject(error: Error): void;
}

class WhisperClient {
  private readonly worker: Worker;
  private readonly listeners = new Set<Listener>();
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;

  constructor() {
    // This is the only Worker in the app. Keep this literal form: Vite detects it at build time.
    this.worker = new Worker(new URL('../../workers/whisper.worker.ts', import.meta.url), {
      type: 'module',
    });
    this.worker.onmessage = (event: MessageEvent<FromWorker>) => this.handle(event.data);
    this.worker.onerror = (event) => {
      console.error('Whisper worker error', event.message);
    };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  probe(): void {
    this.post({ type: 'probe' });
  }

  load(): void {
    this.post({ type: 'load' });
  }

  transcribe(kind: TranscribeKind, audio: Float32Array): Promise<TranscribeResult> {
    const id = this.nextId++;
    // Send a copy so the caller's buffer is never detached.
    const copy = audio.slice();
    return new Promise<TranscribeResult>((resolve, reject) => {
      this.pending.set(id, { kind, resolve, reject });
      this.post({ type: 'transcribe', id, kind, audio: copy }, [copy.buffer]);
    });
  }

  private post(message: ToWorker, transfer: Transferable[] = []): void {
    this.worker.postMessage(message, transfer);
  }

  private handle(message: FromWorker): void {
    if (message.type === 'result') {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      pending?.resolve({
        id: message.id,
        kind: message.kind,
        text: message.text,
        chunks: message.chunks,
        ms: message.ms,
      });
    } else if (message.type === 'error' && message.id !== undefined) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      pending?.reject(new Error(message.message));
    }
    for (const listener of this.listeners) listener(message);
  }
}

let instance: WhisperClient | null = null;

/** Returns the single app-wide client. The worker is never terminated by React effects. */
export function getWhisperClient(): WhisperClient {
  if (!instance) instance = new WhisperClient();
  return instance;
}

export type { WhisperClient };
