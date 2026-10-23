import { useSyncExternalStore } from 'react';

/** Transcription choices, kept on this device. */
export type Quality = 'fast' | 'accurate';
/**
 * A Whisper language name. There is no "detect" option: the transformers.js pipeline does not
 * detect the language, it silently falls back to English.
 */
export type LanguageChoice = string;

export interface TranscriptionSettings {
  language: LanguageChoice;
  quality: Quality;
}

/** Whisper language names, most widely spoken first after English. */
export const LANGUAGES: { value: LanguageChoice; label: string }[] = [
  { value: 'english', label: 'English' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'italian', label: 'Italian' },
  { value: 'dutch', label: 'Dutch' },
  { value: 'russian', label: 'Russian' },
  { value: 'arabic', label: 'Arabic' },
  { value: 'turkish', label: 'Turkish' },
  { value: 'chinese', label: 'Chinese' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'korean', label: 'Korean' },
  { value: 'bengali', label: 'Bengali' },
  { value: 'urdu', label: 'Urdu' },
  { value: 'tamil', label: 'Tamil' },
  { value: 'telugu', label: 'Telugu' },
  { value: 'marathi', label: 'Marathi' },
  { value: 'gujarati', label: 'Gujarati' },
  { value: 'punjabi', label: 'Punjabi' },
];

const KEY = 'vn-transcription';
const DEFAULTS: TranscriptionSettings = { language: 'english', quality: 'fast' };

function read(): TranscriptionSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<TranscriptionSettings>;
    return {
      language: LANGUAGES.some((l) => l.value === stored.language)
        ? stored.language!
        : DEFAULTS.language,
      quality: stored.quality === 'accurate' ? 'accurate' : 'fast',
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export function getTranscriptionSettings(): TranscriptionSettings {
  return settings;
}

export function setTranscriptionSettings(patch: Partial<TranscriptionSettings>): void {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode: the choice lasts for this visit.
  }
  for (const listener of listeners) listener();
}

/** The language to pass to Whisper. */
export function whisperLanguage(): string {
  return settings.language;
}

/**
 * Languages other than English need the Accurate model: on the Hindi test recording the fast
 * model produced almost no correct words even with the loop guard.
 */
export function needsAccurate(language: LanguageChoice): boolean {
  return language !== 'english';
}

export function useTranscriptionSettings(): TranscriptionSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getTranscriptionSettings,
    getTranscriptionSettings,
  );
}
