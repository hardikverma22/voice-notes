import { describe, expect, it } from 'vitest';
import { titleFromTranscript } from '../../src/features/notes/title';
import { transcriptToDoc } from '../../src/features/notes/transcriptToDoc';

describe('titleFromTranscript', () => {
  it('uses the first sentence', () => {
    expect(titleFromTranscript('Buy milk. Then call Sam.', 0)).toBe('Buy milk');
  });

  it('truncates long sentences at a word boundary with an ellipsis', () => {
    const long =
      'This is a very long first sentence that keeps going and going well past the sixty character limit';
    const title = titleFromTranscript(long, 0);
    expect(title.endsWith('…')).toBe(true);
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.slice(0, -1)).toBe(title.slice(0, -1).trimEnd());
    expect(long.startsWith(title.slice(0, -1))).toBe(true);
  });

  it('falls back to a dated title for empty text', () => {
    const title = titleFromTranscript('   ', Date.UTC(2026, 9, 20, 12));
    expect(title.startsWith('Note, ')).toBe(true);
  });
});

describe('transcriptToDoc', () => {
  it('makes one empty paragraph for empty text', () => {
    expect(transcriptToDoc('')).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });

  it('starts a new paragraph about every three sentences', () => {
    const text = 'One. Two. Three. Four. Five. Six. Seven.';
    const doc = transcriptToDoc(text);
    expect(doc.content).toHaveLength(3);
    expect(doc.content[0]?.content?.[0]?.text).toBe('One. Two. Three.');
    expect(doc.content[2]?.content?.[0]?.text).toBe('Seven.');
  });
});
