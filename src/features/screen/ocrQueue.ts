import { liveQuery } from 'dexie';
import { db } from '../../storage/db';
import { listUnreadFrames, setFrameText } from '../../storage/frames';
import { isWhisperBusy } from '../transcribe/modelStore';

/**
 * Reads the text of every saved screen frame, one at a time, in the background. Waits while
 * Whisper works, so it never slows recording or transcription. Resumes after a reload: a
 * frame without text is a frame still to read.
 */

const KEY = 'vn-screen-ocr';
const RETRY_MS = 30_000;
const SETTLE_MS = 1200;

export function isOcrEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setOcrEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    // Blocked storage: the default (on) applies.
  }
  if (enabled) startOcrQueue();
  else stopOcrQueue();
}

let subscription: { unsubscribe(): void } | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
/** Failures per frame; a frame that fails twice is stored as having no text. */
const failures = new Map<string, number>();

export function startOcrQueue(): void {
  if (subscription || !isOcrEnabled()) return;
  // Counts unread saved frames, so it fires when a recording's frames are adopted too.
  subscription = liveQuery(() =>
    db.frames.filter((frame) => frame.noteId !== null && frame.text === undefined).count(),
  ).subscribe({
    next: () => schedule(SETTLE_MS),
    error: (error: unknown) => console.error('Screen text reader could not read frames', error),
  });
}

export function stopOcrQueue(): void {
  subscription?.unsubscribe();
  subscription = null;
  clearTimeout(timer);
}

function schedule(delay: number): void {
  clearTimeout(timer);
  timer = setTimeout(() => void run(), delay);
}

async function run(): Promise<void> {
  if (running || !subscription) return;
  if (isWhisperBusy()) return schedule(3000);
  running = true;
  try {
    const { readText } = await import('./ocr');
    for (;;) {
      if (!subscription) return;
      if (isWhisperBusy()) return schedule(3000);
      const [frame] = await listUnreadFrames();
      if (!frame) return;
      try {
        await setFrameText(frame.id, await readText(frame.blob));
      } catch (error) {
        const count = (failures.get(frame.id) ?? 0) + 1;
        failures.set(frame.id, count);
        if (count < 2) throw error;
        // Twice: likely this image, not the reader. Do not block the frames after it.
        console.warn('Could not read text from a screen frame; skipping it', error);
        await setFrameText(frame.id, '');
      }
    }
  } catch (error) {
    // Offline before the model was ever downloaded, most likely. Try again later.
    console.warn('Could not read text from a screen frame; will retry', error);
    schedule(RETRY_MS);
  } finally {
    running = false;
  }
}
