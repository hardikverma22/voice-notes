import { useState } from 'react';
import { getTheme, setTheme, type Theme } from './theme';

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const LABEL: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };

export function ThemeToggle() {
  const [theme, setCurrent] = useState<Theme>(() => getTheme());

  function cycle() {
    const next = NEXT[theme];
    setTheme(next);
    setCurrent(next);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`Theme: ${LABEL[theme]}. Change theme`}
      className="min-h-11 rounded-md border border-control px-3 text-sm text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      {LABEL[theme]}
    </button>
  );
}
