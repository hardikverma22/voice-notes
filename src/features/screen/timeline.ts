import type { Segment } from '../transcribe/protocol';

/**
 * People usually start talking about a screen just before it appears (they say "now open
 * settings", then click). Speech this many seconds before a frame belongs to it.
 */
export const LEAD_SEC = 1.5;

export interface Timed {
  t: number;
}

export interface FrameSpeech<F extends Timed> {
  frame: F;
  /** What was said while this frame was the one on screen. */
  segments: Segment[];
  text: string;
}

/**
 * Splits the transcript between frames: each frame gets the speech from just before it until
 * just before the next frame. Speech before the first frame goes to the first frame, so
 * nothing said is dropped. Frames must be in time order.
 */
export function pairSpeech<F extends Timed>(frames: F[], segments: Segment[]): FrameSpeech<F>[] {
  const spoken = segments.filter((segment) => segment.text.trim());
  return frames.map((frame, index) => {
    const from = index === 0 ? -Infinity : frame.t - LEAD_SEC;
    const next = frames[index + 1];
    const to = next ? next.t - LEAD_SEC : Infinity;
    const mine = spoken.filter((segment) => segment.start >= from && segment.start < to);
    return {
      frame,
      segments: mine,
      text: mine
        .map((segment) => segment.text.trim())
        .join(' ')
        .replace(/\s+/g, ' '),
    };
  });
}

/** Index of the frame on screen at time t (the last one at or before it), or -1. */
export function frameAt<F extends Timed>(frames: F[], t: number): number {
  let found = -1;
  for (let i = 0; i < frames.length; i++) {
    if (frames[i]!.t <= t + 0.05) found = i;
    else break;
  }
  return found;
}

/**
 * The frame to show while the audio plays at time t. Uses the same lead as pairSpeech, so the
 * frame changes as the speech about it begins. Before the first frame, the first frame.
 */
export function frameDuring<F extends Timed>(frames: F[], t: number): number {
  if (frames.length === 0) return -1;
  return Math.max(0, frameAt(frames, t + LEAD_SEC));
}

/** Where to start playing so a frame's speech is heard from its beginning. */
export function playFrom<F extends Timed>(frame: F): number {
  return Math.max(0, frame.t - LEAD_SEC);
}

/** Index of the segment being spoken at t (the last that started at or before t), or -1. */
export function segmentAt(segments: Segment[], t: number): number {
  let found = -1;
  for (let i = 0; i < segments.length; i++) {
    if (segments[i]!.start <= t) found = i;
    else break;
  }
  return found;
}
