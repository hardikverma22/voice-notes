import { useSyncExternalStore } from 'react';

/** Whisper language names, or 'auto' to let the model detect the language. */
export const LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'auto', label: 'Detect automatically' },
  { value: 'hindi', label: 'Hindi' },
  { value: 'spanish', label: 'Spanish' },
  { value: 'french', label: 'French' },
  { value: 'german', label: 'German' },
  { value: 'portuguese', label: 'Portuguese' },
  { value: 'italian', label: 'Italian' },
  { value: 'japanese', label: 'Japanese' },
  { value: 'chinese', label: 'Chinese' },
] as const;

export type Language = (typeof LANGUAGES)[number]['value'];

const LANGUAGE_KEY = 'vn-language';
const listeners = new Set<() => void>();

function read(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_KEY);
    if (stored && LANGUAGES.some((item) => item.value === stored)) return stored as Language;
  } catch {
    // Storage unavailable: use the default.
  }
  return 'english';
}

let language: Language = read();

export function getLanguage(): Language {
  return language;
}

export function setLanguage(next: Language): void {
  language = next;
  try {
    localStorage.setItem(LANGUAGE_KEY, next);
  } catch {
    // Applies for this page view only.
  }
  for (const listener of listeners) listener();
}

export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getLanguage,
    getLanguage,
  );
}
