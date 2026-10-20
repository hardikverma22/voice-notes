import { COMMIT_GUARD_SEC, WINDOW_COMMIT_SEC, WINDOW_MAX_SEC } from './config';
import type { Segment } from './protocol';

export interface LiveState {
  committed: Segment[]; // absolute seconds from recording start
  committedUntilSec: number; // next window starts here
  tentative: string; // shown dimmed
}

export function initialLiveState(): LiveState {
  return { committed: [], committedUntilSec: 0, tentative: '' };
}

const SILENCE_OUTPUTS = new Set([
  '[blank_audio]',
  '(silence)',
  '[silence]',
  '[ silence ]',
  '[music]',
]);

export function joinSegments(segments: Segment[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function displayText(state: LiveState): { committed: string; tentative: string } {
  return { committed: joinSegments(state.committed), tentative: state.tentative };
}

function isSilence(segment: Segment): boolean {
  const text = segment.text.trim().toLowerCase();
  return text.length === 0 || SILENCE_OUTPUTS.has(text);
}

/**
 * Folds one live-window result into the state. Never mutates the input.
 * Chunks that end before the guard band are committed; the rest stay tentative.
 */
export function applyLiveResult(
  state: LiveState,
  result: { chunks: Segment[]; windowStartSec: number; windowEndSec: number },
): LiveState {
  const { chunks, windowStartSec, windowEndSec } = result;
  const len = windowEndSec - windowStartSec;

  if (len < WINDOW_COMMIT_SEC) {
    return { ...state, tentative: joinSegments(chunks) };
  }

  const boundary = len - COMMIT_GUARD_SEC;

  // Rule 3: commit in order, stop at the first chunk that fails.
  let cut = 0;
  while (cut < chunks.length) {
    const chunk = chunks[cut];
    if (!chunk || chunk.end === null || chunk.end > boundary) break;
    cut++;
  }
  let committedChunks = chunks.slice(0, cut);
  let rest = chunks.slice(cut);

  // Rule 4: a long window with nothing committed is force-committed.
  if (committedChunks.length === 0 && len >= WINDOW_MAX_SEC) {
    const timed = chunks.filter((chunk) => chunk.end !== null);
    if (timed.length > 0) {
      committedChunks = timed;
      rest = chunks.filter((chunk) => chunk.end === null);
    } else {
      committedChunks = [{ text: joinSegments(chunks), start: 0, end: len }];
      rest = [];
    }
  }

  // Rule 6: the next window starts after the last committed chunk.
  const lastCommitted = committedChunks[committedChunks.length - 1];
  const committedUntilSec =
    lastCommitted && lastCommitted.end !== null
      ? windowStartSec + lastCommitted.end
      : state.committedUntilSec;

  // Rule 5: shift to absolute time. Rule 8: drop silence and empty text.
  const newCommitted = committedChunks
    .filter((chunk) => !isSilence(chunk))
    .map((chunk) => ({
      text: chunk.text,
      start: chunk.start + windowStartSec,
      end: chunk.end === null ? null : chunk.end + windowStartSec,
    }));

  return {
    committed: [...state.committed, ...newCommitted],
    committedUntilSec,
    // Rule 7: everything not committed is tentative.
    tentative: joinSegments(rest),
  };
}
