import { describe, expect, it } from 'vitest';
import { chunkNote, contentHash, matchStart } from '../../src/features/search/chunk';
import { MIN_SCORE } from '../../src/features/search/config';
import { noteVectors, rankChunks, relatedNotes } from '../../src/features/search/rank';
import { parseRoute, noteHref } from '../../src/app/router';

function unit(...values: number[]): Float32Array {
  const length = Math.hypot(...values);
  return Float32Array.from(values.map((v) => v / length));
}

describe('chunkNote', () => {
  it('leads with the title and groups sentences into passages', () => {
    const sentence = 'One two three four five six seven eight nine ten.';
    const text = Array.from({ length: 20 }, () => sentence).join(' ');
    const chunks = chunkNote({ title: 'Plan', plainText: text, segments: [] });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]!.text.startsWith('Plan. One two')).toBe(true);
    for (const chunk of chunks) expect(chunk.text.split(/\s+/).length).toBeLessThanOrEqual(121);
  });

  it('splits one very long sentence by words', () => {
    const text = Array.from({ length: 300 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkNote({ title: '', plainText: text, segments: [] });
    expect(chunks.length).toBe(4);
  });

  it('indexes a title-only note and skips an empty one', () => {
    expect(chunkNote({ title: 'Just a title', plainText: '', segments: [] })).toEqual([
      { text: 'Just a title', start: null },
    ]);
    expect(chunkNote({ title: ' ', plainText: '', segments: [] })).toEqual([]);
  });

  it('takes the start time of the best matching segment', () => {
    const segments = [
      { text: 'We talked about the garden and tomatoes.', start: 0, end: 4 },
      { text: 'Then the car insurance renewal came up next month.', start: 12.5, end: 18 },
    ];
    expect(matchStart('The car insurance renewal is next month, compare quotes.', segments)).toBe(
      12.5,
    );
    expect(matchStart('Something unrelated entirely.', segments)).toBeNull();
  });
});

describe('contentHash', () => {
  it('changes with content and separates parts', () => {
    expect(contentHash('a', 'b')).toBe(contentHash('a', 'b'));
    expect(contentHash('a', 'b')).not.toBe(contentHash('a', 'c'));
    expect(contentHash('ab', 'c')).not.toBe(contentHash('a', 'bc'));
  });
});

describe('rankChunks', () => {
  const query = unit(1, 0, 0);
  const chunks = [
    { noteId: 'a', text: 'a1', start: 1, vector: unit(0.9, 0.44, 0) }, // ~0.9
    { noteId: 'a', text: 'a2', start: 5, vector: unit(0.5, 0.87, 0) }, // ~0.5
    { noteId: 'b', text: 'b1', start: null, vector: unit(0.86, 0, 0.51) }, // ~0.86
    { noteId: 'c', text: 'c1', start: null, vector: unit(0.3, 0.95, 0) }, // ~0.3
  ];

  it('keeps the best passage per note and drops weak matches', () => {
    const ranked = rankChunks(chunks, query);
    expect(ranked.map((r) => [r.noteId, r.text])).toEqual([
      ['a', 'a1'],
      ['b', 'b1'],
    ]);
    expect(ranked.every((r) => r.score >= MIN_SCORE)).toBe(true);
  });

  it('skips excluded notes (already shown as exact matches)', () => {
    expect(rankChunks(chunks, query, { exclude: new Set(['a']) }).map((r) => r.noteId)).toEqual([
      'b',
    ]);
  });

  it('returns nothing when even the best match is weak', () => {
    expect(rankChunks(chunks, unit(0, 0, 1))).toEqual([]);
  });
});

describe('relatedNotes', () => {
  // Eight notes along different axes, plus one pair (a, b) sharing a direction.
  const chunk = (noteId: string, ...values: number[]) => ({
    noteId,
    text: '',
    start: null,
    vector: unit(...values),
  });
  const axis = (i: number) => Array.from({ length: 8 }, (_, k) => (k === i ? 1 : 0.3));
  const library = [
    chunk('a', ...axis(0)),
    chunk('b', ...axis(0).map((v, k) => (k === 1 ? 0.5 : v))),
    ...[1, 2, 3, 4, 5, 6, 7].map((i) => chunk(`n${i}`, ...axis(i))),
  ];

  it('averages passages per note into one unit vector', () => {
    const vectors = noteVectors([chunk('x', 1, 0.1, 0), chunk('x', 1, -0.1, 0)]);
    expect(Math.hypot(...vectors.get('x')!)).toBeCloseTo(1);
  });

  it('suggests only notes that stand out from the library average', () => {
    const vectors = noteVectors(library);
    expect(relatedNotes('a', vectors).map((r) => r.noteId)).toEqual(['b']);
    expect(relatedNotes('n3', vectors)).toEqual([]);
    expect(relatedNotes('missing', vectors)).toEqual([]);
  });

  it('suggests nothing in a small library', () => {
    expect(relatedNotes('a', noteVectors(library.slice(0, 4)))).toEqual([]);
  });
});

describe('routes', () => {
  it('parses a play-from time and builds note links', () => {
    expect(parseRoute('#/note/abc?t=12.5')).toEqual({ name: 'note', id: 'abc', t: 12.5 });
    expect(parseRoute('#/note/abc')).toEqual({ name: 'note', id: 'abc', t: null });
    expect(parseRoute('#/')).toEqual({ name: 'home' });
    expect(noteHref('a b', 3)).toBe('#/note/a%20b?t=3.0');
    expect(noteHref('x')).toBe('#/note/x');
  });
});
