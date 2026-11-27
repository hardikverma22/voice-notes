/**
 * Turning a note into something tiny-voca can read, and its audio into a file. Pure functions,
 * shared by the read-aloud controller (main thread) and the TTS worker.
 *
 * Based on upstream's js/text.js, with changes for notes: a note's lines are its structure
 * (headings, list items, check items), so each line ends a sentence instead of being run into
 * the next one; links, emoji and list marks are not read out; and each sentence keeps its text,
 * so the player can show what is being read.
 */

// No lookbehind anywhere in this file: Safari before 16.4 can't parse it, and this module is
// loaded with the note page.
const ABBREVIATIONS = /\b(?:mr|mrs|ms|dr|prof|sr|jr|st|vs|etc|inc|ltd|co|e\.g|i\.e|a\.m|p\.m)\.$/i;
/** An initial, as in "J. Doe". Capital only, so "plan a." still ends a sentence. */
const INITIAL = /(?:^|\s)[A-Z]\.$/;
const HAS_WORD = /[\p{L}\p{N}]/u;
const ENDS_SENTENCE = /[.!?…]["'”’)\]»]*$/;
const ENDS_CLAUSE = /[,;:]["'”’)\]»]*$/;

/** One line of a note, made readable: list marks, links, emoji and markdown marks removed. */
function cleanLine(line: string): string {
  return (
    line
      // List and check-item marks, quote marks and heading hashes at the start.
      .replace(/^\s*(?:[-*+•▪◦]|\d+[.)]|>|#{1,6})\s+/, '')
      .replace(/^\s*\[[ xX]?\]\s+/, '')
      // Links are read as "link" rather than letter by letter.
      .replace(/\bhttps?:\/\/\S+/gi, 'link')
      .replace(/\bwww\.\S+/gi, 'link')
      // Markdown emphasis and code marks.
      // Only paired marks outside a word, so snake_case, 2*3 and ~5 are left alone.
      .replace(/(^|[^\p{L}\p{N}])(\*\*|__|~~|\*|_|`)(\S|\S.*?\S)\2(?![\p{L}\p{N}])/gu, '$1$3')
      // Emoji and pictographs, with their joiners and variation selectors.
      .replace(/\p{Extended_Pictographic}|\u200d|\ufe0f/gu, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/**
 * A note as one text to read: the title first, then each line of the body. A line without a
 * closing mark (a heading, a list item) gets a full stop, so it is read as its own sentence
 * with a fall at its end.
 */
export function prepareForSpeech(title: string, body: string): string {
  const lines = [title, ...body.split(/\n+/)].map(cleanLine).filter((line) => HAS_WORD.test(line));
  return lines
    .map((line) => (ENDS_SENTENCE.test(line) ? line : line.replace(ENDS_CLAUSE, '') + '.'))
    .join(' ');
}

/** Cuts a text into sentences, keeping "Dr. Smith" and "e.g. this" together. */
export function splitSentences(text: string): string[] {
  const parts: string[] = [];
  let current = '';
  for (const piece of text
    .replace(/\s+/g, ' ')
    .trim()
    // Spaces were collapsed above, so a line break is free to mark the cuts.
    .replace(/([.!?…]["')\]”’]?)\s+(?=["'(“‘[]?[A-Z0-9])/g, '$1\n')
    .split('\n')) {
    current = current ? `${current} ${piece}` : piece;
    if (!ABBREVIATIONS.test(current) && !INITIAL.test(current)) {
      parts.push(current);
      current = '';
    }
  }
  if (current) parts.push(current);
  return parts.filter((part) => HAS_WORD.test(part));
}

/** A text that ends without a mark gets a full stop, so the last word does not break off. */
export function finished(text: string): string {
  const body = text.replace(/\s+$/, '');
  if (!body) return text;
  const last = body.split(/\s+/).pop() ?? '';
  const marked = HAS_WORD.test(last)
    ? /[.!?…,;:]["'”’)\]»]*$/.test(last)
    : /[.!?…]/.test(last) || /^[,;:]$/.test(last);
  return marked ? text : body + '.';
}

export interface Phonemized {
  ids: number[];
  stress: number[];
}
export type Phonemize = (text: string) => Phonemized;
export const NOTHING_TO_PRONOUNCE = 'the text has nothing to pronounce';

/**
 * Phonemes for one sentence, in pieces the model accepts (at most `limit` ids each): a long
 * sentence is cut at commas and dashes, then in half by words. Text the phonemizer can't read
 * (another script, only symbols) gives no pieces rather than an error.
 */
export function utterancesOf(sentence: string, phonemize: Phonemize, limit: number): Phonemized[] {
  const fit = (text: string): Phonemized[] => {
    let result: Phonemized;
    try {
      result = phonemize(text);
    } catch (error) {
      if (error instanceof Error && /nothing to pronounce|must not be empty/.test(error.message))
        return [];
      throw error;
    }
    if (result.ids.length <= limit) return [result];
    const pieces = text.replace(/([,;:—])\s+/g, '$1\n').split('\n');
    if (pieces.length > 1) return pieces.flatMap(fit);
    const words = text.split(' ');
    if (words.length < 2) return [];
    const half = Math.ceil(words.length / 2);
    return [...fit(words.slice(0, half).join(' ')), ...fit(words.slice(half).join(' '))];
  };
  return fit(finished(sentence));
}

/** Joins audio pieces into one array. */
export function concat(chunks: Float32Array[]): Float32Array {
  const whole = new Float32Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    whole.set(chunk, at);
    at += chunk.length;
  }
  return whole;
}

/** Scales the audio down if it peaks above 0.99, so it never clips. Returns the same array. */
export function limit(audio: Float32Array): Float32Array {
  let loudest = 0;
  for (const sample of audio) loudest = Math.max(loudest, Math.abs(sample));
  if (loudest > 0.99) {
    const gain = 0.99 / loudest;
    for (let i = 0; i < audio.length; i++) audio[i]! *= gain;
  }
  return audio;
}

/** A mono 16-bit PCM WAV file. */
export function encodeWav(audio: Float32Array, rate: number): Blob {
  const view = new DataView(new ArrayBuffer(44 + 2 * audio.length));
  const text = (at: number, letters: string) => {
    for (let i = 0; i < letters.length; i++) view.setUint8(at + i, letters.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + 2 * audio.length, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, 2 * rate, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, 2 * audio.length, true);
  for (let i = 0; i < audio.length; i++) {
    const sample = Math.max(-1, Math.min(1, audio[i]!));
    view.setInt16(44 + 2 * i, Math.round(sample * 32767), true);
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}
