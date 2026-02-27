import Link from 'next/link';
import { PropsWithChildren } from 'react';

import { ToggleTheme } from '@/components/ui/ToggleTheme';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/billing', label: 'Billing' },
];

export function AppShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen bg-[hsl(var(--color-bg))]">
      <header className="sticky top-0 z-50 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.8)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Link href="/" className="font-semibold tracking-tight text-[hsl(var(--color-text))]">VidyoBharat</Link>
          <nav className="flex w-full items-center gap-2 overflow-x-auto pb-1 sm:w-auto sm:justify-end sm:pb-0">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap rounded-[var(--radius-md)] px-2 py-1 text-sm text-[hsl(var(--color-muted))] hover:bg-[hsl(var(--color-surface))] hover:text-[hsl(var(--color-text))]"
              >
                {link.label}
              </Link>
            ))}
            <ToggleTheme />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
