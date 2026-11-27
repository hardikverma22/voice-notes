// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  prepareForSpeech,
  splitSentences,
  utterancesOf,
} from '../../src/features/speak/speechText';
import { fromGGUF, type Phonemizer } from '../../src/vendor/tiny-voca/dizione/engine.js';
import { readGGUF, TinyVoca } from '../../src/vendor/tiny-voca/tiny-voca.js';

/**
 * Runs the vendored tiny-voca model on real note text. Needs the 8 MB model file, which unit
 * tests don't download: put it at .cache/tiny-voca-js.gguf (or set TINY_VOCA_GGUF). The e2e
 * read-aloud spec runs the same model in the browser without this.
 *
 *   curl -L -o .cache/tiny-voca-js.gguf \
 *     https://huggingface.co/n4ze3m/tiny-voca/resolve/main/gguf/tiny-voca-js.gguf
 */
const MODEL = process.env.TINY_VOCA_GGUF ?? '.cache/tiny-voca-js.gguf';

describe.skipIf(!existsSync(MODEL))('tiny-voca engine', () => {
  // Loaded in beforeAll, not in the suite body: Vitest still runs the body of a skipped suite to
  // collect its tests, and without the file that would fail the whole run.
  let voca: TinyVoca;
  let phonemizer: Phonemizer;
  let limit = 0;
  beforeAll(async () => {
    const file = readGGUF(new Uint8Array(readFileSync(MODEL)).buffer);
    voca = new TinyVoca(file);
    phonemizer = await fromGGUF(file);
    limit = voca.config.max_tokens - 12;
  });
  const speak = (sentence: string, voice = 'F2', speed = 1) =>
    utterancesOf(sentence, (text) => phonemizer.phonemize(text), limit).map(
      ({ ids, stress }) => voca.synthesize(ids, stress, { voice, speed }).audio,
    );
  const seconds = (chunks: Float32Array[]) =>
    chunks.reduce((sum, chunk) => sum + chunk.length, 0) / voca.config.sample_rate;

  it('has the two voices at 24 kHz', () => {
    expect(voca.voices).toEqual(expect.arrayContaining(['F2', 'M2']));
    expect(voca.config.sample_rate).toBe(24_000);
  });

  it('reads every sentence of a structured note', () => {
    const text = prepareForSpeech(
      'Standup notes',
      'Yesterday\n- Fixed the login bug, see https://example.com/123\n[ ] Ship on Nov. 28 at 3:30 p.m. ✅\nBudget is $12.50',
    );
    const sentences = splitSentences(text);
    expect(sentences.length).toBe(5);
    for (const sentence of sentences) {
      const audio = speak(sentence);
      expect(audio.length, sentence).toBeGreaterThan(0);
      expect(seconds(audio), sentence).toBeGreaterThan(0.3);
      for (const chunk of audio) expect(chunk.every(Number.isFinite)).toBe(true);
    }
  });

  it('reads a sentence longer than the model limit in pieces', () => {
    // Grow one comma-free sentence until it is just over the model's limit.
    let long = 'item 1 is ready';
    for (let i = 2; phonemizer.phonemize(long).ids.length <= limit; i++)
      long += ` and item ${i} is ready`;
    const pieces = utterancesOf(long, (text) => phonemizer.phonemize(text), limit);
    expect(pieces.length).toBeGreaterThan(1);
    expect(seconds(speak(long))).toBeGreaterThan(10);
  }, 60_000);

  it('reads faster at a higher speed, in both voices', () => {
    const sentence = 'The quick brown fox jumps over the lazy dog.';
    for (const voice of ['F2', 'M2']) {
      const normal = seconds(speak(sentence, voice, 1));
      const fast = seconds(speak(sentence, voice, 1.5));
      expect(fast).toBeLessThan(normal * 0.8);
    }
  });

  it('skips text in another script instead of failing', () => {
    expect(speak('नमस्ते दुनिया')).toEqual([]);
  });
});
