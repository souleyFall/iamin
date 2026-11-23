import { useCallback, useState } from 'react';
import { readPref, writePref } from './storage';

export type Theme = 'dark' | 'light';
const KEY = 'iamin-theme';

export function initialTheme(): Theme {
  const saved = readPref(KEY);
  if (saved === 'dark' || saved === 'light') return saved;
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#08111F' : '#EDF2FA');
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.dataset.theme === 'light' ? 'light' : 'dark',
  );
  const toggle = useCallback(() => {
    setTheme((current) => {
      const next: Theme = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      writePref(KEY, next);
      return next;
    });
  }, []);
  return [theme, toggle];
}
