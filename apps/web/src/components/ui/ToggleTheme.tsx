'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';

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
    <Button variant="ghost" onClick={toggle}>
      {dark ? 'Light' : 'Dark'}
    </Button>
  );
}
