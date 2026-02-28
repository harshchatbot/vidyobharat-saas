'use client';

import { useEffect } from 'react';

const THEME_STORAGE_KEY = 'rangmanch-theme';

function resolveInitialTheme() {
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const favicon = document.querySelector<HTMLLinkElement>('link[data-rangmanch-favicon]');
  if (favicon) {
    favicon.href = theme === 'dark' ? '/brand/logo-mark-dark.svg' : '/brand/logo-mark-light.svg';
  }
}

export function ThemeBoot() {
  useEffect(() => {
    const initialTheme = resolveInitialTheme();
    applyTheme(initialTheme);

    const onStorage = () => applyTheme(resolveInitialTheme());
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onMedia = () => {
      if (!window.localStorage.getItem(THEME_STORAGE_KEY)) {
        applyTheme(resolveInitialTheme());
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('rangmanch-theme-change', onStorage as EventListener);
    media.addEventListener('change', onMedia);

    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('rangmanch-theme-change', onStorage as EventListener);
      media.removeEventListener('change', onMedia);
    };
  }, []);

  return null;
}
