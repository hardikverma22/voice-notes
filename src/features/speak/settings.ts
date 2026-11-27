import { useSyncExternalStore } from 'react';
import { SPEEDS, VOICES, type Speed, type Voice } from './config';

/** Read-aloud choices, kept on this device. */
export interface SpeechSettings {
  voice: Voice;
  speed: Speed;
}

const KEY = 'vn-speech';
const DEFAULTS: SpeechSettings = { voice: 'F2', speed: 1 };

function read(): SpeechSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<SpeechSettings>;
    return {
      voice: VOICES.some((v) => v.value === stored.voice) ? stored.voice! : DEFAULTS.voice,
      speed: SPEEDS.includes(stored.speed as Speed) ? stored.speed! : DEFAULTS.speed,
    };
  } catch {
    return DEFAULTS;
  }
}

let settings = read();
const listeners = new Set<() => void>();

export function getSpeechSettings(): SpeechSettings {
  return settings;
}

export function setSpeechSettings(patch: Partial<SpeechSettings>): void {
  settings = { ...settings, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode: the choice lasts for this visit.
  }
  for (const listener of listeners) listener();
}

export function useSpeechSettings(): SpeechSettings {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSpeechSettings,
    getSpeechSettings,
  );
}
