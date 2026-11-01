import type { Segment } from '../transcribe/protocol';
import { frameDuring, segmentAt, type Timed } from './timeline';

/**
 * What the exported video shows over time. The picture only changes when the frame on screen
 * or the caption changes, so the video is a list of scenes, each drawn once and held. Scenes
 * are capped in length so players seek well.
 */

export interface Scene {
  start: number;
  end: number;
  /** Index of the frame shown. */
  frame: number;
  /** Index of the caption segment shown, or -1 for none. */
  caption: number;
  /** Whether the title banner is shown (the opening seconds). */
  title: boolean;
}

export const TITLE_SEC = 3;
/** A caption stays up this long after its segment ends, unless the next one starts first. */
const CAPTION_HOLD_SEC = 1.5;
const MAX_SCENE_SEC = 1;

export function planScenes<F extends Timed>(
  frames: F[],
  segments: Segment[],
  durationSec: number,
): Scene[] {
  if (frames.length === 0 || durationSec <= 0) return [];
  const spoken = segments.filter((segment) => segment.text.trim());
  // Every moment where something on screen may change.
  const cuts = new Set<number>([0, durationSec, Math.min(TITLE_SEC, durationSec)]);
  frames.forEach((frame, index) => {
    if (index > 0) cuts.add(Math.max(0, frame.t - 1.5)); // frameDuring's lead
  });
  for (const segment of spoken) {
    cuts.add(segment.start);
    cuts.add((segment.end ?? segment.start) + CAPTION_HOLD_SEC);
  }
  const times = [...cuts].filter((t) => t >= 0 && t <= durationSec).sort((a, b) => a - b);

  const scenes: Scene[] = [];
  for (let i = 0; i < times.length - 1; i++) {
    const start = times[i]!;
    const end = times[i + 1]!;
    if (end - start < 1e-3) continue;
    const mid = (start + end) / 2;
    const at = segmentAt(spoken, mid);
    const segment = spoken[at];
    const showing = segment && mid < (segment.end ?? segment.start) + CAPTION_HOLD_SEC ? at : -1;
    const look = { frame: frameDuring(frames, mid), caption: showing, title: mid < TITLE_SEC };
    // Merge with the previous scene when nothing changes, then split long holds.
    const last = scenes[scenes.length - 1];
    if (
      last &&
      last.frame === look.frame &&
      last.caption === look.caption &&
      last.title === look.title
    ) {
      last.end = end;
    } else {
      scenes.push({ start, end, ...look });
    }
  }
  return scenes.flatMap((scene) => {
    const parts: Scene[] = [];
    for (let t = scene.start; t < scene.end - 1e-3; t += MAX_SCENE_SEC) {
      parts.push({ ...scene, start: t, end: Math.min(scene.end, t + MAX_SCENE_SEC) });
    }
    return parts;
  });
}

/** Wraps text into at most maxLines lines no wider than maxWidth; the end is kept if it overflows. */
export function wrapLines(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines = 2,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && measure(next) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  // Keep the latest words: they match what is being heard.
  const kept = lines.slice(-maxLines);
  kept[0] = `…${kept[0]}`;
  return kept;
}
