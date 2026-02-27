'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';

export function ToggleTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const initialDark = document.documentElement.classList.contains('dark');
    setDark(initialDark);
  }, []);

  const toggle = () => {
    document.documentElement.classList.toggle('dark');
    setDark((value) => !value);
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
