import { describe, expect, it } from 'vitest';
import {
  concat,
  encodeWav,
  finished,
  limit,
  prepareForSpeech,
  splitSentences,
  utterancesOf,
  type Phonemize,
} from '../../src/features/speak/speechText';

describe('prepareForSpeech', () => {
  it('reads the title first and ends each line as a sentence', () => {
    expect(prepareForSpeech('Groceries', 'Things to buy\nMilk\nEggs')).toBe(
      'Groceries. Things to buy. Milk. Eggs.',
    );
  });

  it('keeps a closing mark and turns a trailing comma or colon into a full stop', () => {
    expect(prepareForSpeech('', 'Is it done?\nNext steps:\nWow!')).toBe(
      'Is it done? Next steps. Wow!',
    );
  });

  it('drops list, check-item, quote and heading marks', () => {
    expect(
      prepareForSpeech('', '- one\n* two\n1. three\n[ ] four\n[x] five\n> six\n## seven'),
    ).toBe('one. two. three. four. five. six. seven.');
  });

  it('reads links as "link" and drops emoji and markdown emphasis', () => {
    expect(
      prepareForSpeech('', 'See https://example.com/a?b=1 now 🎉\nThis is **bold** and `code`'),
    ).toBe('See link now. This is bold and code.');
  });

  it('leaves lone marks inside words and numbers alone', () => {
    expect(prepareForSpeech('', 'rename user_id to 2*3 in ~5 min, _really_')).toBe(
      'rename user_id to 2*3 in ~5 min, really.',
    );
  });

  it('skips empty and symbol-only lines and an empty title', () => {
    expect(prepareForSpeech('', '\n---\n\n   \nHello')).toBe('Hello.');
  });
});

describe('splitSentences', () => {
  it('cuts at sentence ends', () => {
    expect(splitSentences('One. Two! Three? Four')).toEqual(['One.', 'Two!', 'Three?', 'Four']);
  });

  it('keeps titles, initials and abbreviations with their sentence', () => {
    expect(splitSentences('I met Dr. Smith and J. Doe today. It went well.')).toEqual([
      'I met Dr. Smith and J. Doe today.',
      'It went well.',
    ]);
  });

  it('does not cut inside a decimal or before a lowercase word', () => {
    expect(splitSentences('It costs 3.50 dollars. ok then. Next.')).toEqual([
      'It costs 3.50 dollars. ok then.',
      'Next.',
    ]);
  });

  it('drops pieces with no letters or digits', () => {
    expect(splitSentences('Hi. ... !!')).toEqual(['Hi. ... !!']);
    expect(splitSentences('   ')).toEqual([]);
  });
});

describe('finished', () => {
  it('adds a full stop only when the text has no closing mark', () => {
    expect(finished('Hello')).toBe('Hello.');
    expect(finished('Hello.')).toBe('Hello.');
    expect(finished('He said "hi."')).toBe('He said "hi."');
    expect(finished('Wait,')).toBe('Wait,');
  });
});

describe('utterancesOf', () => {
  // One id per letter, so the length limit is easy to reason about.
  const phonemize: Phonemize = (text) => {
    const letters = text.replace(/[^a-z]/gi, '');
    if (!letters) throw new Error('the text has nothing to pronounce');
    return { ids: [...letters].map((c) => c.charCodeAt(0)), stress: [...letters].map(() => 0) };
  };
  const lengths = (text: string, max: number) =>
    utterancesOf(text, phonemize, max).map((u) => u.ids.length);

  it('keeps a sentence that fits in one piece', () => {
    expect(lengths('Short one', 20)).toEqual([8]);
  });

  it('cuts a long sentence at commas first', () => {
    expect(lengths('aaaaa bbbbb, ccccc ddddd', 12)).toEqual([10, 10]);
  });

  it('then halves by words until every piece fits', () => {
    const pieces = utterancesOf('aaaa bbbb cccc dddd eeee ffff gggg hhhh', phonemize, 9);
    expect(pieces.length).toBeGreaterThan(2);
    for (const piece of pieces) expect(piece.ids.length).toBeLessThanOrEqual(9);
    expect(pieces.reduce((sum, p) => sum + p.ids.length, 0)).toBe(32);
  });

  it('gives nothing for text the phonemizer cannot read', () => {
    expect(utterancesOf('नमस्ते', phonemize, 50)).toEqual([]);
  });

  it('gives nothing for a single word longer than the limit', () => {
    expect(utterancesOf('supercalifragilistic', phonemize, 5)).toEqual([]);
  });

  it('passes other errors through', () => {
    const broken: Phonemize = () => {
      throw new Error('model exploded');
    };
    expect(() => utterancesOf('Hello', broken, 10)).toThrow('model exploded');
  });
});

describe('audio helpers', () => {
  it('concatenates chunks in order', () => {
    expect([
      ...concat([new Float32Array([1, 2]), new Float32Array([]), new Float32Array([3])]),
    ]).toEqual([1, 2, 3]);
  });

  it('scales loud audio down to 0.99 and leaves quiet audio alone', () => {
    const loud = limit(new Float32Array([0.5, -2, 1]));
    expect(Math.max(...[...loud].map(Math.abs))).toBeCloseTo(0.99, 5);
    expect(loud[0]).toBeCloseTo(0.2475, 5);
    expect([...limit(new Float32Array([0.5, -0.25]))]).toEqual([0.5, -0.25]);
  });

  it('writes a mono 16-bit WAV header and samples', async () => {
    const blob = encodeWav(new Float32Array([0, 1, -1, 0.5]), 24_000);
    expect(blob.type).toBe('audio/wav');
    const view = new DataView(await blob.arrayBuffer());
    const text = (at: number) =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(at + i)));
    expect(view.byteLength).toBe(44 + 8);
    expect(text(0)).toBe('RIFF');
    expect(text(8)).toBe('WAVE');
    expect(text(36)).toBe('data');
    expect(view.getUint16(22, true)).toBe(1); // channels
    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(view.getUint32(40, true)).toBe(8);
    expect([0, 1, 2, 3].map((i) => view.getInt16(44 + 2 * i, true))).toEqual([
      0, 32767, -32767, 16384,
    ]);
  });
});
