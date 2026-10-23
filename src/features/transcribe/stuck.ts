/**
 * Whisper can get stuck repeating a token ("आप आप आप…", "दादादा…"), mostly on non-English
 * speech and smaller models; broken characters (U+FFFD) appear when a loop repeats part of a
 * multi-byte letter. These checks spot that so the worker can decode again with a guard.
 */

/** Decoding options that stop loops. Used for non-English, and as a retry for English. */
export const REPEAT_GUARD = { no_repeat_ngram_size: 3, repetition_penalty: 1.2 } as const;

export function looksStuck(text: string): boolean {
  if (text.includes('�')) return true;
  const words = text.trim().split(/\s+/).filter(Boolean);
  let run = 1;
  for (let i = 1; i < words.length; i++) {
    run = words[i] === words[i - 1] ? run + 1 : 1;
    if (run >= 6) return true;
  }
  // A long stretch of letters with one short pattern repeated, without spaces ("दादादादा…").
  if (/(.{1,4})\1{9,}/u.test(text)) return true;
  if (words.length >= 30 && new Set(words).size / words.length < 0.2) return true;
  return false;
}
