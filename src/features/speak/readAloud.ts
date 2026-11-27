import { useSyncExternalStore } from 'react';
import type { FromTtsWorker, ToTtsWorker } from './protocol';
import { getSpeechSettings, setSpeechSettings, type SpeechSettings } from './settings';
import { concat, encodeWav, limit, prepareForSpeech, splitSentences } from './speechText';

/**
 * Reads a note aloud: one note at a time, app-wide. Sentences are made in the TTS worker a few
 * ahead of what is playing and scheduled back to back on one AudioContext, so playback is
 * gapless and starts after the first sentence instead of after the whole note. Pause suspends
 * the context; skipping, or changing the voice or speed, starts again from a sentence.
 */

export type ReadAloudStatus = 'idle' | 'loading' | 'playing' | 'paused' | 'error';

export interface ReadAloudState {
  status: ReadAloudStatus;
  noteId: string | null;
  /** The sentence being read, 0-based, and how many there are. */
  index: number;
  count: number;
  sentence: string;
  /** 0..1 while the model downloads, otherwise null. */
  download: number | null;
  /** True when playback has caught up with the sentences made so far. */
  waiting: boolean;
  error: string | null;
}

const IDLE: ReadAloudState = {
  status: 'idle',
  noteId: null,
  index: 0,
  count: 0,
  sentence: '',
  download: null,
  waiting: false,
  error: null,
};

/** Seconds of audio to keep made ahead of the playhead. */
const AHEAD_SEC = 12;
/** A short breath between sentences: tiny-voca trims its own silence. */
const GAP_SEC = 0.18;
export const ENGLISH_ONLY = 'Reading aloud works for English text only, for now.';

// ---- State -----------------------------------------------------------------------------------

let state: ReadAloudState = IDLE;
const listeners = new Set<() => void>();
function set(patch: Partial<ReadAloudState>): void {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}
export function getReadAloudState(): ReadAloudState {
  return state;
}
export function useReadAloud(): ReadAloudState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getReadAloudState,
    getReadAloudState,
  );
}

// ---- Worker ----------------------------------------------------------------------------------

let worker: Worker | null = null;
let sampleRate = 24_000;
let ready: Promise<void> | null = null;
let engineReady = false;
let nextId = 1;
/** Told the download fraction while the model downloads, besides the player state. */
const downloadListeners = new Set<(fraction: number) => void>();
const pending = new Map<
  number,
  { resolve: (audio: Float32Array | null) => void; reject: (error: Error) => void }
>();

function send(message: ToTtsWorker): void {
  worker!.postMessage(message);
}

function ensureWorker(): Promise<void> {
  if (ready) return ready;
  worker ??= new Worker(new URL('../../workers/tts.worker.ts', import.meta.url), {
    type: 'module',
    name: 'tts',
  });
  ready = new Promise<void>((resolve, reject) => {
    worker!.onmessage = (event: MessageEvent<FromTtsWorker>) => {
      const message = event.data;
      if (message.type === 'progress') {
        const fraction = message.loaded / message.total;
        if (state.status === 'loading') set({ download: fraction });
        for (const listener of downloadListeners) listener(fraction);
      } else if (message.type === 'ready') {
        sampleRate = message.sampleRate;
        engineReady = true;
        resolve();
      } else if (message.type === 'audio') {
        pending.get(message.id)?.resolve(message.audio);
        pending.delete(message.id);
      } else if (message.id === null) {
        ready = null;
        reject(new Error(message.message));
      } else {
        pending.get(message.id)?.reject(new Error(message.message));
        pending.delete(message.id);
      }
    };
    // The worker failed to start or crashed: settle everything waiting on it, so nothing shows
    // "Loading" forever, and start a fresh worker next time.
    worker!.onerror = (event: ErrorEvent) => {
      event.preventDefault();
      const error = new Error(event.message || 'The voice engine stopped.');
      for (const request of pending.values()) request.reject(error);
      pending.clear();
      worker?.terminate();
      worker = null;
      ready = null;
      engineReady = false;
      reject(error);
    };
  });
  ready.catch(() => undefined);
  send({ type: 'load' });
  return ready;
}

function synthesize(
  text: string,
  seed: number,
  voice: SpeechSettings,
): Promise<Float32Array | null> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    send({ type: 'speak', id, text, voice: voice.voice, speed: voice.speed, seed });
  });
}

// ---- Playback --------------------------------------------------------------------------------

interface Run {
  token: number;
  sentences: string[];
  title: string;
  /** Next sentence to ask the worker for. */
  requested: number;
  inFlight: number;
  /** When each scheduled sentence starts, in AudioContext time. */
  starts: number[];
  /** End of the last scheduled sentence. */
  end: number;
  sources: AudioBufferSourceNode[];
  /** Sentences that produced sound, to tell "English only" from "nothing yet". */
  voiced: number;
}

let context: AudioContext | null = null;
let run: Run | null = null;
let token = 0;
let ticker: number | null = null;

function audioContext(): AudioContext {
  context ??= new AudioContext();
  return context;
}

/**
 * Starts reading a note from a sentence. Call it from a click: the AudioContext must be created
 * or resumed inside a user gesture.
 */
export function readAloud(noteId: string, title: string, body: string, from = 0): void {
  const sentences = splitSentences(prepareForSpeech(title, body));
  begin(noteId, sentences, title, from);
}

interface BeginOptions {
  /** Start paused: used when the voice changes while paused, so no sound slips out. */
  paused?: boolean;
  /** Sentences already voiced in this reading, carried across skips and voice changes. */
  voiced?: number;
}

function begin(
  noteId: string,
  sentences: string[],
  title: string,
  from: number,
  { paused = false, voiced = 0 }: BeginOptions = {},
): void {
  halt();
  const ctx = audioContext();
  if (paused) void ctx.suspend();
  else void ctx.resume();
  if (!sentences.length) {
    set({ ...IDLE, status: 'error', noteId, error: 'This note has nothing to read yet.' });
    return;
  }
  const start = Math.max(0, Math.min(from, sentences.length - 1));
  const mine: Run = {
    token: ++token,
    sentences,
    title,
    requested: start,
    inFlight: 0,
    starts: [],
    end: 0,
    sources: [],
    voiced,
  };
  run = mine;
  set({
    ...IDLE,
    status: paused ? 'paused' : engineReady ? 'playing' : 'loading',
    noteId,
    index: start,
    count: sentences.length,
    sentence: sentences[start]!,
    waiting: true,
  });
  setMediaSession(title, paused);
  ensureWorker().then(
    () => {
      if (run !== mine) return;
      set({ status: state.status === 'paused' ? 'paused' : 'playing', download: null });
      pump(mine);
      ticker ??= window.setInterval(tick, 100);
    },
    (error: Error) => {
      if (run !== mine) return;
      fail(
        `Could not load the voice model. ${navigator.onLine ? error.message : 'You are offline.'}`,
      );
    },
  );
}

/** Keeps AHEAD_SEC of audio made ahead of the playhead, one request at a time. */
function pump(mine: Run): void {
  const ctx = audioContext();
  while (
    run === mine &&
    mine.inFlight === 0 &&
    mine.requested < mine.sentences.length &&
    mine.end - ctx.currentTime < AHEAD_SEC
  ) {
    const index = mine.requested++;
    mine.inFlight++;
    synthesize(mine.sentences[index]!, index, getSpeechSettings()).then(
      (audio) => {
        mine.inFlight--;
        if (run !== mine) return;
        schedule(mine, index, audio);
        pump(mine);
      },
      (error: Error) => {
        mine.inFlight--;
        if (run === mine) fail(`Could not read this note. ${error.message}`);
      },
    );
  }
}

function schedule(mine: Run, index: number, audio: Float32Array | null): void {
  const ctx = audioContext();
  const at = Math.max(mine.end, ctx.currentTime + 0.05);
  mine.starts[index] = at;
  if (!audio) {
    mine.end = at;
    return;
  }
  mine.voiced++;
  limit(audio);
  const buffer = ctx.createBuffer(1, audio.length, sampleRate);
  buffer.copyToChannel(audio as Float32Array<ArrayBuffer>, 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start(at);
  mine.sources.push(source);
  source.onended = () => {
    mine.sources = mine.sources.filter((s) => s !== source);
  };
  mine.end = at + buffer.duration + GAP_SEC;
}

function tick(): void {
  const mine = run;
  if (!mine || !context) return;
  const now = context.currentTime;
  let index = state.index;
  for (let i = mine.starts.length - 1; i >= 0; i--) {
    const start = mine.starts[i];
    if (start !== undefined && start <= now) {
      index = i;
      break;
    }
  }
  const allMade = mine.requested >= mine.sentences.length && mine.inFlight === 0;
  if (allMade && now >= mine.end) {
    if (mine.voiced === 0) fail(ENGLISH_ONLY);
    else stopReading();
    return;
  }
  // The playhead has caught up with what is made: show it rather than look frozen.
  const waiting = !allMade && now >= mine.end - GAP_SEC;
  if (index !== state.index || waiting !== state.waiting) {
    set({ index, sentence: mine.sentences[index] ?? '', waiting });
  }
  pump(mine);
}

/** Stops sound and forgets the run, without changing the shown state. */
function halt(): void {
  if (run) for (const source of run.sources) source.stop();
  run = null;
  if (ticker !== null) window.clearInterval(ticker);
  ticker = null;
}

function fail(error: string): void {
  const noteId = state.noteId;
  halt();
  set({ ...IDLE, status: 'error', noteId, error });
  clearMediaSession();
}

export function stopReading(): void {
  halt();
  set(IDLE);
  clearMediaSession();
}

export function pauseReading(): void {
  if (state.status !== 'playing' || !context) return;
  void context.suspend();
  set({ status: 'paused' });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
}

export function resumeReading(): void {
  if (state.status !== 'paused' || !context) return;
  void context.resume();
  set({ status: run && engineReady ? 'playing' : 'loading' });
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
}

/** Jumps back or forward by whole sentences. */
export function skipSentences(delta: number): void {
  const mine = run;
  if (!mine || !state.noteId) return;
  const target = Math.max(0, Math.min(state.index + delta, mine.sentences.length - 1));
  begin(state.noteId, mine.sentences, mine.title, target, { voiced: mine.voiced });
}

/** Changes the voice or speed; while reading, the current sentence starts again with it. */
export function changeVoice(patch: Partial<SpeechSettings>): void {
  setSpeechSettings(patch);
  const mine = run;
  if (mine && state.noteId && state.status !== 'error') {
    begin(state.noteId, mine.sentences, mine.title, state.index, {
      paused: state.status === 'paused',
      voiced: mine.voiced,
    });
  }
}

// ---- Media Session: lock screen, headset buttons and media keys -------------------------------

const MEDIA_ACTIONS: MediaSessionAction[] = ['play', 'pause', 'stop', 'previoustrack', 'nexttrack'];

function setMediaSession(title: string, paused: boolean): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: title || 'Untitled note',
    artist: 'Voice Notes · read aloud',
  });
  navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['play', resumeReading],
    ['pause', pauseReading],
    ['stop', stopReading],
    ['previoustrack', () => skipSentences(-1)],
    ['nexttrack', () => skipSentences(1)],
  ];
  for (const [action, handler] of handlers) {
    try {
      navigator.mediaSession.setActionHandler(action, handler);
    } catch {
      // Not supported by this browser.
    }
  }
}

function clearMediaSession(): void {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = null;
  navigator.mediaSession.playbackState = 'none';
  // Hand media keys back to the page's own audio (the recording player).
  for (const action of MEDIA_ACTIONS) {
    try {
      navigator.mediaSession.setActionHandler(action, null);
    } catch {
      // Not supported by this browser.
    }
  }
}

// ---- Export ----------------------------------------------------------------------------------

/**
 * The whole note as one WAV file, in the current voice and speed. Shares the worker with
 * playback, so it can run while a note is being read.
 */
export async function renderNoteAudio(
  title: string,
  body: string,
  onProgress: (fraction: number, stage: 'download' | 'speech') => void,
): Promise<Blob> {
  const sentences = splitSentences(prepareForSpeech(title, body));
  if (!sentences.length) throw new Error('This note has nothing to read yet.');
  const onDownload = (fraction: number) => onProgress(fraction, 'download');
  downloadListeners.add(onDownload);
  try {
    await ensureWorker();
  } finally {
    downloadListeners.delete(onDownload);
  }
  const voice = getSpeechSettings();
  const gap = new Float32Array(Math.round(GAP_SEC * sampleRate));
  const chunks: Float32Array[] = [];
  for (const [i, sentence] of sentences.entries()) {
    const audio = await synthesize(sentence, i, voice);
    if (audio) chunks.push(audio, gap);
    onProgress((i + 1) / sentences.length, 'speech');
  }
  if (!chunks.length) throw new Error(ENGLISH_ONLY);
  return encodeWav(limit(concat(chunks.slice(0, -1))), sampleRate);
}
