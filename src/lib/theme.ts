import { useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

// Only an explicit choice is stored; without one every visit starts in light mode (public/theme.js).
const STORAGE_KEY = 'rango-theme';
const EVENT = 'rango:theme';

function read(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  // public/theme.js updates the document when another tab changes the theme.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function setTheme(theme: Theme) {
  const root = document.documentElement;
  const animate = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
  if (animate) {
    root.classList.add('theme-transition');
    window.setTimeout(() => root.classList.remove('theme-transition'), 450);
  }
  root.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#080808' : '#f8f7f3');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* storage unavailable: theme still applies for this visit */
  }
  window.dispatchEvent(new Event(EVENT));
}

export function useTheme(): [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, read, () => 'light' as Theme);
  return [theme, setTheme];
}
