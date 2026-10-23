import { useSyncExternalStore } from 'react';
import { APPROX_EMBED_MB } from './config';
import type { FromEmbedWorker, ToEmbedWorker } from './protocol';

/**
 * State of the search model and the single embedding worker. Search by meaning is opt-in: the
 * first time someone turns it on, the model downloads (about 24 MB); after that it loads from
 * the browser cache on every visit and the library is indexed in the background.
 */

export type EmbedStatus = 'off' | 'probing' | 'loading' | 'ready' | 'error';

export interface EmbedState {
  status: EmbedStatus;
  /** 0–100 while loading. */
  percent: number;
  /** True when the model files were already cached when probed. */
  cached: boolean;
  approxDownloadMB: number;
  errorMessage: string | null;
}

const ENABLED_KEY = 'vn-search-by-meaning';

let state: EmbedState = {
  status: 'off',
  percent: 0,
  cached: false,
  approxDownloadMB: APPROX_EMBED_MB,
  errorMessage: null,
};
const listeners = new Set<() => void>();
let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
  number,
  { resolve(vectors: Float32Array[]): void; reject(error: Error): void }
>();
let readyWaiters: { resolve(): void; reject(error: Error): void }[] = [];

function set(next: Partial<EmbedState>): void {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
}

function post(message: ToEmbedWorker): void {
  getWorker().postMessage(message);
}

function getWorker(): Worker {
  if (!worker) {
    // Keep this literal form: Vite detects it at build time.
    worker = new Worker(new URL('../../workers/embed.worker.ts', import.meta.url), {
      type: 'module',
    });
    worker.onmessage = (event: MessageEvent<FromEmbedWorker>) => onMessage(event.data);
    worker.onerror = (event) => console.error('Embedding worker error', event.message);
  }
  return worker;
}

function onMessage(message: FromEmbedWorker): void {
  switch (message.type) {
    case 'probe-result':
      set({ cached: message.cached });
      break;
    case 'progress':
      if (state.status === 'loading') set({ percent: message.progress });
      break;
    case 'ready':
      set({ status: 'ready', percent: 100, errorMessage: null });
      for (const waiter of readyWaiters) waiter.resolve();
      readyWaiters = [];
      break;
    case 'result': {
      const job = pending.get(message.id);
      pending.delete(message.id);
      job?.resolve(message.vectors);
      break;
    }
    case 'error': {
      if (message.id !== undefined) {
        const job = pending.get(message.id);
        pending.delete(message.id);
        job?.reject(new Error(message.message));
      }
      if (message.stage === 'load') {
        set({ status: 'error', errorMessage: message.message });
        const error = new Error(message.message);
        for (const waiter of readyWaiters) waiter.reject(error);
        readyWaiters = [];
      }
      break;
    }
  }
}

export function isSearchEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}

/** Turns search by meaning on (downloading the model if needed) and remembers the choice. */
export function enableSearch(): void {
  try {
    localStorage.setItem(ENABLED_KEY, '1');
  } catch {
    // Private mode: it still works for this visit.
  }
  loadEmbedModel();
}

export function disableSearch(): void {
  try {
    localStorage.removeItem(ENABLED_KEY);
  } catch {
    // Nothing stored.
  }
  worker?.terminate();
  worker = null;
  for (const job of pending.values()) job.reject(new Error('Search by meaning was turned off'));
  pending.clear();
  set({ status: 'off', percent: 0 });
}

/** On app start: load the model if the person turned search on in an earlier visit. */
export function initSearchModel(): void {
  if (isSearchEnabled()) loadEmbedModel();
}

function loadEmbedModel(): void {
  if (state.status === 'loading' || state.status === 'ready' || state.status === 'probing') return;
  set({ status: 'loading', percent: 0, errorMessage: null });
  post({ type: 'probe' });
  post({ type: 'load' });
}

export function whenEmbedReady(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve();
  if (state.status === 'off') return Promise.reject(new Error('Search by meaning is off'));
  return new Promise((resolve, reject) => readyWaiters.push({ resolve, reject }));
}

/** Embeds texts as passages, or as search queries (which get the model's query prefix). */
export async function embed(texts: string[], query = false): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  await whenEmbedReady();
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    post({ type: 'embed', id, texts, query });
  });
}

export function getEmbedState(): EmbedState {
  return state;
}

export function useEmbedModel(): EmbedState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getEmbedState,
    getEmbedState,
  );
}
