export type Theme = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'vn-theme';

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable (private mode, blocked): fall back to the system theme.
  }
  return 'system';
}

export function setTheme(theme: Theme): void {
  try {
    if (theme === 'system') {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  } catch {
    // Ignore: the theme still applies for this page view.
  }
  if (theme === 'system') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}
