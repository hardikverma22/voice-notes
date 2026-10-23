import { useSyncExternalStore } from 'react';
import { LANGUAGE } from './config';
import type { Device, FromWorker, TranscribeKind } from './protocol';
import { getWhisperClient, type TranscribeResult } from './whisperClient';

/**
 * probing: checking device and cache. idle: not downloaded yet, fetched on first recording.
 * loading: downloading or warming up. ready: transcription available. error: load failed.
 */
export type ModelStatus = 'probing' | 'idle' | 'loading' | 'ready' | 'error';

export interface ModelState {
  status: ModelStatus;
  /** True when the model files were already in the browser cache at startup. */
  cached: boolean;
  loaded: number;
  total: number;
  percent: number;
  device: Device | null;
  approxDownloadMB: number;
  errorMessage: string | null;
}

let state: ModelState = {
  status: 'probing',
  cached: false,
  loaded: 0,
  total: 0,
  percent: 0,
  device: null,
  approxDownloadMB: 80,
  errorMessage: null,
};
const listeners = new Set<() => void>();
let started = false;
let readyWaiters: { resolve(): void; reject(error: Error): void }[] = [];

function set(patch: Partial<ModelState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

function onMessage(message: FromWorker): void {
  switch (message.type) {
    case 'probe-result':
      set({
        device: message.device,
        approxDownloadMB: message.approxDownloadMB,
        cached: message.cached,
      });
      if (message.cached) {
        loadModel();
      } else if (state.status === 'probing') {
        set({ status: 'idle' });
      }
      break;
    case 'progress':
      set({ loaded: message.loaded, total: message.total, percent: message.progress });
      break;
    case 'ready':
      set({ status: 'ready', device: message.device, errorMessage: null, percent: 100 });
      for (const waiter of readyWaiters) waiter.resolve();
      readyWaiters = [];
      break;
    case 'error':
      if (message.stage === 'probe' || message.stage === 'load') {
        set({ status: 'error', errorMessage: message.message });
        const error = new Error(message.message);
        for (const waiter of readyWaiters) waiter.reject(error);
        readyWaiters = [];
      }
      break;
  }
}

/** Starts the worker and checks the cache. Safe to call more than once. */
export function initModel(): void {
  if (started) return;
  started = true;
  const client = getWhisperClient();
  client.subscribe(onMessage);
  client.probe();
}

/** Starts the download (or cache load) if it is not running or done already. */
export function loadModel(): void {
  initModel();
  if (state.status === 'loading' || state.status === 'ready') return;
  set({ status: 'loading', errorMessage: null });
  getWhisperClient().load();
}

/** Resolves once the model is ready, starting the download if needed. */
export function whenModelReady(): Promise<void> {
  if (state.status === 'ready') return Promise.resolve();
  const promise = new Promise<void>((resolve, reject) => {
    readyWaiters.push({ resolve, reject });
  });
  loadModel();
  return promise;
}

export function getModelState(): ModelState {
  return state;
}

export function useModel(): ModelState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getModelState,
    getModelState,
  );
}

let inFlight = 0;
let lastActivityAt = 0;

/** Transcribes English speech. Other languages need a larger model (not offered yet). */
export function transcribe(kind: TranscribeKind, audio: Float32Array): Promise<TranscribeResult> {
  inFlight++;
  lastActivityAt = Date.now();
  return getWhisperClient()
    .transcribe(kind, audio, LANGUAGE)
    .finally(() => {
      inFlight--;
      lastActivityAt = Date.now();
    });
}

/**
 * True while Whisper is transcribing or did so in the last quietMs. Live transcription runs
 * every couple of seconds while recording, so this stays true for the whole recording.
 */
export function isWhisperBusy(quietMs = 4000): boolean {
  return inFlight > 0 || Date.now() - lastActivityAt < quietMs;
}
