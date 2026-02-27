import Link from 'next/link';
import { PropsWithChildren } from 'react';

import { logoutAction } from '@/app/auth-actions';
import { ToggleTheme } from '@/components/ui/ToggleTheme';
import { getUserIdFromCookie } from '@/lib/session';

const links = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/projects', label: 'Projects' },
  { href: '/billing', label: 'Billing' },
];

export async function AppShell({ children }: PropsWithChildren) {
  const userId = await getUserIdFromCookie();
  const accountLabel = userId ? `U${userId.slice(0, 4).toUpperCase()}` : null;

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
            {!userId && (
              <>
                <Link
                  href="/login"
                  className="whitespace-nowrap rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm font-medium text-[hsl(var(--color-text))]"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="whitespace-nowrap rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-3 py-1 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]"
                >
                  Sign Up
                </Link>
              </>
            )}
            {userId && (
              <>
                <Link
                  href="/projects"
                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1 text-sm font-medium text-[hsl(var(--color-text))]"
                  title={userId}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
                    {accountLabel}
                  </span>
                  Account
                </Link>
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="whitespace-nowrap rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm font-medium text-[hsl(var(--color-text))]"
                  >
                    Logout
                  </button>
                </form>
              </>
            )}
            <ToggleTheme />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
