import { useSyncExternalStore } from 'react';
import { APPROX_ACCURATE_MB } from './config';
import { getTranscriptionSettings, whisperLanguage } from './settings';
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

/**
 * The optional Accurate model (whisper-small). checking: asking the worker whether this device
 * can run it. unsupported: no WebGPU with fp16. idle: supported, not downloaded or not loaded.
 */
export type AccurateStatus = 'checking' | 'unsupported' | 'idle' | 'loading' | 'ready' | 'error';
export interface AccurateState {
  status: AccurateStatus;
  percent: number;
  cached: boolean;
  approxDownloadMB: number;
}
let accurate: AccurateState = {
  status: 'checking',
  percent: 0,
  cached: false,
  approxDownloadMB: APPROX_ACCURATE_MB,
};
const accurateListeners = new Set<() => void>();
let accurateWaiters: { resolve(): void; reject(error: Error): void }[] = [];
function setAccurate(patch: Partial<AccurateState>): void {
  accurate = { ...accurate, ...patch };
  for (const listener of accurateListeners) listener();
}

function onAccurateMessage(message: FromWorker): void {
  switch (message.type) {
    case 'accurate-probe-result':
      setAccurate({
        status: message.supported ? 'idle' : 'unsupported',
        cached: message.cached,
      });
      // Chosen in an earlier visit and already downloaded: load it in the background once the
      // fast model is up, never at the same time (two large loads at once can run out of memory).
      if (message.supported && message.cached && getTranscriptionSettings().quality === 'accurate')
        void whenModelReady()
          .then(loadAccurateModel)
          .catch(() => undefined);
      break;
    case 'accurate-progress':
      setAccurate({ percent: message.progress });
      break;
    case 'accurate-ready':
      setAccurate({ status: 'ready', percent: 100, cached: true });
      for (const waiter of accurateWaiters) waiter.resolve();
      accurateWaiters = [];
      break;
    case 'error':
      if (message.stage === 'load-accurate') {
        console.error('Accurate model failed to load:', message.message);
        setAccurate({ status: 'error' });
        const error = new Error(message.message);
        for (const waiter of accurateWaiters) waiter.reject(error);
        accurateWaiters = [];
      }
      break;
    default:
      break;
  }
}

/** Downloads (first time) and loads the Accurate model. */
export function loadAccurateModel(): void {
  initModel();
  if (accurate.status === 'loading' || accurate.status === 'ready') return;
  if (accurate.status === 'unsupported') return;
  setAccurate({ status: 'loading', percent: 0 });
  getWhisperClient().loadAccurate();
}

/** Resolves when the Accurate model is ready; rejects if it cannot run here or fails to load. */
export function whenAccurateReady(): Promise<void> {
  if (accurate.status === 'ready') return Promise.resolve();
  if (accurate.status === 'unsupported') {
    return Promise.reject(new Error('Accurate is not available on this device'));
  }
  const promise = new Promise<void>((resolve, reject) => accurateWaiters.push({ resolve, reject }));
  loadAccurateModel();
  return promise;
}

/** After its files are deleted: it downloads again if chosen (a loaded copy still works now). */
export function forgetAccurateDownload(): void {
  if (accurate.status !== 'unsupported') setAccurate({ cached: false, status: 'idle', percent: 0 });
}

export function getAccurateState(): AccurateState {
  return accurate;
}

/**
 * True when Accurate can be used without starting a new download: it is loaded, or already
 * loading (a download the person started). Nothing is downloaded from here.
 */
export function accurateUsableWithoutDownload(): boolean {
  return accurate.status === 'ready' || accurate.status === 'loading';
}

export function useAccurateModel(): AccurateState {
  return useSyncExternalStore(
    (listener) => {
      accurateListeners.add(listener);
      return () => accurateListeners.delete(listener);
    },
    getAccurateState,
    getAccurateState,
  );
}

function onMessage(message: FromWorker): void {
  onAccurateMessage(message);
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
  client.probeAccurate();
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

/**
 * Transcribes in the language chosen in Settings (or detects it). With accurate, the final pass
 * runs on the Accurate model, which the caller must have loaded (whenAccurateReady).
 */
export function transcribe(
  kind: TranscribeKind,
  audio: Float32Array,
  options: { accurate?: boolean } = {},
): Promise<TranscribeResult> {
  inFlight++;
  lastActivityAt = Date.now();
  return getWhisperClient()
    .transcribe(kind, audio, whisperLanguage(), options.accurate === true)
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
