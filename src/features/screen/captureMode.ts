import { useCallback, useState } from 'react';

export type CaptureMode = 'voice' | 'screen';

const KEY = 'vn-capture-mode';

function read(): CaptureMode {
  try {
    return localStorage.getItem(KEY) === 'screen' ? 'screen' : 'voice';
  } catch {
    return 'voice';
  }
}

/** Voice only, or voice with the screen. Remembered on this device. */
export function useCaptureMode(): [CaptureMode, (mode: CaptureMode) => void] {
  const [mode, setMode] = useState<CaptureMode>(read);
  const update = useCallback((next: CaptureMode) => {
    setMode(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Private mode or blocked storage: the choice lasts for this visit.
    }
  }, []);
  return [mode, update];
}
