'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight } from 'lucide-react';

import { logoutAction } from '@/app/auth-actions';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

const navLinks = [
  { href: '/platform', label: 'Platform' },
  { href: '/business', label: 'Business' },
  { href: '/use-cases', label: 'Use cases' },
  { href: '/learning', label: 'Learning' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/company', label: 'Company' },
];

type TopNavProps = {
  userId: string | null;
  accountLabel: string | null;
};

export function TopNav({ userId, accountLabel }: TopNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.8)] px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/" className="font-semibold tracking-tight text-[hsl(var(--color-text))]">VidyoBharat</Link>
          <span className="hidden h-6 w-px bg-[hsl(var(--color-border))] lg:block" />
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="whitespace-nowrap rounded-full px-3 py-1 text-sm text-[hsl(var(--color-muted))] hover:text-[hsl(var(--color-text))]"
            >
              {link.label}
            </Link>
          ))}

          {!userId && (
            <>
              <Link href="/login" className="ml-2 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--color-text))] px-3 py-1 text-sm font-semibold text-[hsl(var(--color-bg))]">
                Sign in
                <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          )}

          {userId && (
            <>
              <Link
                href="/dashboard"
                className="ml-2 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1 text-sm font-medium text-[hsl(var(--color-text))]"
                title={userId}
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
                  {accountLabel}
                </span>
                Account
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-sm font-medium text-[hsl(var(--color-text))]">
                  Logout
                </button>
              </form>
            </>
          )}

          <ToggleTheme />
        </nav>

        <div className="flex items-center gap-2 lg:hidden">
          <ToggleTheme />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]"
            aria-expanded={open}
            aria-label="Toggle menu"
          >
            Menu
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3 lg:hidden">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-[var(--radius-md)] px-2 py-1 text-sm text-[hsl(var(--color-text))]" onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}

          {!userId && (
            <div className="mt-1 flex gap-2">
              <Link href="/login" className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]" onClick={() => setOpen(false)}>
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}

          {userId && (
            <div className="mt-1 flex gap-2">
              <Link href="/dashboard" className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]" onClick={() => setOpen(false)}>
                Account
              </Link>
              <form action={logoutAction}>
                <button type="submit" className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]">
                  Logout
                </button>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
