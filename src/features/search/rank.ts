import {
  MAX_RELATED,
  MAX_RESULTS,
  MIN_NOTES_FOR_RELATED,
  MIN_RELATED_SCORE,
  MIN_SCORE,
  RELATIVE_WINDOW,
} from './config';

export interface Scored {
  noteId: string;
  text: string;
  start: number | null;
  score: number;
}

interface ChunkLike {
  noteId: string;
  text: string;
  start: number | null;
  vector: Float32Array;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/**
 * Best passage per note, strongest first. Weak matches are dropped: below MIN_SCORE, or more
 * than RELATIVE_WINDOW below the best match, since loose neighbours of a good hit are noise.
 */
export function rankChunks(
  chunks: ChunkLike[],
  query: Float32Array,
  options: { exclude?: Set<string>; limit?: number } = {},
): Scored[] {
  const best = new Map<string, Scored>();
  for (const chunk of chunks) {
    if (options.exclude?.has(chunk.noteId)) continue;
    const score = dot(chunk.vector, query);
    const current = best.get(chunk.noteId);
    if (!current || score > current.score) {
      best.set(chunk.noteId, { noteId: chunk.noteId, text: chunk.text, start: chunk.start, score });
    }
  }
  const ranked = [...best.values()].sort((a, b) => b.score - a.score);
  const top = ranked[0]?.score ?? 0;
  return ranked
    .filter((r) => r.score >= MIN_SCORE && r.score >= top - RELATIVE_WINDOW)
    .slice(0, options.limit ?? MAX_RESULTS);
}

/** Normalised mean of a note's passage vectors: one vector standing for the whole note. */
export function noteVectors(chunks: ChunkLike[]): Map<string, Float32Array> {
  const sums = new Map<string, Float32Array>();
  for (const chunk of chunks) {
    const sum = sums.get(chunk.noteId);
    if (sum) for (let i = 0; i < sum.length; i++) sum[i]! += chunk.vector[i] ?? 0;
    else sums.set(chunk.noteId, Float32Array.from(chunk.vector));
  }
  for (const sum of sums.values()) {
    const length = Math.hypot(...sum) || 1;
    for (let i = 0; i < sum.length; i++) sum[i]! /= length;
  }
  return sums;
}

function normalise(vector: Float32Array): Float32Array {
  const length = Math.hypot(...vector) || 1;
  return vector.map((v) => v / length);
}

/**
 * Notes clearly close in meaning to one note. Each note vector has the library's average
 * subtracted first, so what every note shares (short, personal, spoken) does not count as
 * relatedness. Needs MIN_NOTES_FOR_RELATED notes for the average to mean anything.
 */
export function relatedNotes(
  noteId: string,
  vectors: Map<string, Float32Array>,
  limit = MAX_RELATED,
): { noteId: string; score: number }[] {
  const own = vectors.get(noteId);
  if (!own || vectors.size < MIN_NOTES_FOR_RELATED) return [];
  const mean = new Float32Array(own.length);
  for (const vector of vectors.values()) {
    for (let i = 0; i < mean.length; i++) mean[i]! += (vector[i] ?? 0) / vectors.size;
  }
  const centre = (vector: Float32Array) => normalise(vector.map((v, i) => v - (mean[i] ?? 0)));
  const self = centre(own);
  return [...vectors]
    .filter(([id]) => id !== noteId)
    .map(([id, vector]) => ({ noteId: id, score: dot(self, centre(vector)) }))
    .filter((r) => r.score >= MIN_RELATED_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
