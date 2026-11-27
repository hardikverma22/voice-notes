import type { GGUFFile } from '../tiny-voca.js';

export interface Phonemes {
  ids: number[];
  stress: number[];
  symbols: string[];
}

export class Phonemizer {
  /** Throws an Error with message "the text has nothing to pronounce" for text it cannot read. */
  phonemize(text: string): Phonemes;
}

export function fromGGUF(file: GGUFFile): Promise<Phonemizer>;
