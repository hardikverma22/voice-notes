/**
 * Read aloud: tiny-voca, a 4.5M-parameter English text-to-speech model, run on this device in
 * src/workers/tts.worker.ts. One 8 MB file holds the model and its phonemizer.
 */

export const TTS_MODEL_ID = 'n4ze3m/tiny-voca';
/** Pinned so an upstream change to the file can't change, or break, the app's voice. */
export const TTS_REVISION = '5fe06641d0afecb3c04bc9faca2cf64d9b2b1600';
export const TTS_MODEL_URL = `https://huggingface.co/${TTS_MODEL_ID}/resolve/${TTS_REVISION}/gguf/tiny-voca-js.gguf`;
export const TTS_MODEL_BYTES = 7_988_384;
/**
 * Stored next to the transformers.js models, so Settings → Downloaded models lists it (by the
 * model id in its URL) and can delete it like the others.
 */
export const TTS_CACHE = 'transformers-cache';

export type Voice = 'F2' | 'M2';
export const VOICES: { value: Voice; label: string }[] = [
  { value: 'F2', label: 'Female' },
  { value: 'M2', label: 'Male' },
];

export const SPEEDS = [0.8, 1, 1.25, 1.5] as const;
export type Speed = (typeof SPEEDS)[number];
