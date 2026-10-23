import type { Segment } from '../transcribe/protocol';
import { CHUNK_MAX_WORDS, CHUNK_TARGET_WORDS } from './config';

export interface Chunk {
  text: string;
  /** Seconds into the recording where this passage starts, when it can be matched. */
  start: number | null;
}

function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

/** Sentences, keeping line breaks (headings, list items) as boundaries too. */
function sentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Splits a note's current text (with the person's edits) into passages of about
 * CHUNK_TARGET_WORDS words. The title leads the first passage so a search for the topic finds
 * it. Each passage gets the start time of the transcript segment it best matches.
 */
export function chunkNote(note: {
  title: string;
  plainText: string;
  segments: Segment[];
}): Chunk[] {
  const parts: string[] = [];
  let current: string[] = [];
  let count = 0;
  const flush = () => {
    if (current.length) parts.push(current.join(' '));
    current = [];
    count = 0;
  };
  for (const sentence of sentences(note.plainText)) {
    const size = words(sentence).length;
    if (size > CHUNK_MAX_WORDS) {
      flush();
      const tokens = sentence.split(/\s+/);
      for (let i = 0; i < tokens.length; i += CHUNK_TARGET_WORDS) {
        parts.push(tokens.slice(i, i + CHUNK_TARGET_WORDS).join(' '));
      }
      continue;
    }
    if (count + size > CHUNK_MAX_WORDS) flush();
    current.push(sentence);
    count += size;
    if (count >= CHUNK_TARGET_WORDS) flush();
  }
  flush();

  const title = note.title.trim();
  if (parts.length === 0) return title ? [{ text: title, start: null }] : [];
  return parts.map((text, index) => ({
    text: index === 0 && title ? `${title}. ${text}` : text,
    start: matchStart(text, note.segments),
  }));
}

/** Start of the segment sharing the most of the passage's opening words (at least three). */
export function matchStart(text: string, segments: Segment[]): number | null {
  const opening = new Set(words(text).slice(0, 12));
  let best: Segment | null = null;
  let bestShared = 2;
  for (const segment of segments) {
    let shared = 0;
    for (const word of new Set(words(segment.text))) if (opening.has(word)) shared++;
    if (shared > bestShared) {
      best = segment;
      bestShared = shared;
    }
  }
  return best ? best.start : null;
}

/** FNV-1a: cheap change detection for re-indexing. Not for security. */
export function contentHash(...parts: string[]): string {
  let hash = 0x811c9dc5;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      hash ^= part.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0x1f; // separator, so ("ab", "c") and ("a", "bc") differ
  }
  return (hash >>> 0).toString(36);
}
