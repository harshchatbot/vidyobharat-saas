'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_STORAGE_KEY = 'rangmanch-theme';

export function ToggleTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    const initialDark = saved ? saved === 'dark' : document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', initialDark);
    setDark(initialDark);
  }, []);

  const toggle = () => {
    setDark((value) => {
      const nextDark = !value;
      document.documentElement.classList.toggle('dark', nextDark);
      window.localStorage.setItem(THEME_STORAGE_KEY, nextDark ? 'dark' : 'light');
      window.dispatchEvent(new Event('rangmanch-theme-change'));
      return nextDark;
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-[hsl(var(--color-text))]"
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
