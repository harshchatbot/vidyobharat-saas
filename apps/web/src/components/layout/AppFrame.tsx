'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Image as ImageIcon, LayoutDashboard, Mail, PlusCircle, Settings, User } from 'lucide-react';

import { logoutAction } from '@/app/auth-actions';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { TopNav } from '@/components/layout/TopNav';
import { API_URL } from '@/lib/env';

type Props = {
  userId: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accountAvatar?: string | null;
  children: React.ReactNode;
};

const appRoutePrefixes = ['/dashboard', '/images', '/create-ai-video', '/create', '/create-template', '/videos', '/projects', '/editor', '/billing', '/profile', '/settings'];

function isAppRoute(pathname: string) {
  return appRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/images')) return 'Image Studio';
  if (pathname.startsWith('/create-ai-video')) return 'AI Video';
  if (pathname.startsWith('/create-template')) return 'AI Reel Script';
  if (pathname.startsWith('/create')) return 'Create Video';
  if (pathname.startsWith('/videos/')) return 'Video Details';
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/billing')) return 'Billing';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'RangManch AI';
}

export function AppFrame({ userId, accountLabel, accountEmail, accountAvatar, children }: Props) {
  const pathname = usePathname();
  const inApp = Boolean(userId) && isAppRoute(pathname);
  const pageTitle = getPageTitle(pathname);
  const displayName = accountLabel ?? 'User';
  const resolvedAvatar = accountAvatar
    ? (accountAvatar.startsWith('http://') || accountAvatar.startsWith('https://') ? accountAvatar : `${API_URL}${accountAvatar}`)
    : null;

  if (inApp) {
    const navItems = [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/images', label: 'Images', icon: ImageIcon },
      { href: '/create', label: 'Create', icon: PlusCircle },
    ];

    return (
      <div className="grid min-h-screen grid-cols-1 bg-[hsl(var(--color-bg))] md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-4 md:block">
          <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
            <BrandLogo href="/dashboard" variant="full" size="md" className="max-w-[180px]" priority="sidebar" />
          </div>
          <nav className="mt-6 grid gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.14)] text-text'
                      : 'border-[hsl(var(--color-border))] text-muted'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.94)] backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="md:hidden">
                  <BrandLogo href="/dashboard" variant="mark" size="sm" />
                </div>
                <span className="font-heading text-xl font-bold tracking-tight text-text">{pageTitle}</span>
              </div>

              <details className="relative">
                <summary className="flex list-none cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-text">
                  {resolvedAvatar ? (
                    <img src={resolvedAvatar} alt={displayName} className="h-7 w-7 rounded-full object-cover" />
                  ) : (
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
                      {displayName.slice(0, 1)}
                    </span>
                  )}
                  <span className="hidden sm:inline">{displayName}</span>
                  <ChevronDown className="h-4 w-4 text-muted" />
                </summary>
                <div className="absolute right-0 mt-2 w-64 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-1 shadow-soft">
                  <div className="mb-1 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-2 py-2">
                    <div className="flex items-center gap-2">
                      {resolvedAvatar ? (
                        <img src={resolvedAvatar} alt={displayName} className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
                          {displayName.slice(0, 1)}
                        </span>
                      )}
                      <p className="truncate text-sm font-semibold text-text">{displayName}</p>
                    </div>
                    <div className="mt-1 inline-flex max-w-full items-center gap-1 rounded-full border border-[hsl(var(--color-border))] px-2 py-0.5 text-[10px] text-muted">
                      <Mail className="h-3 w-3 shrink-0" />
                      <span className="truncate">{accountEmail ?? 'No email set'}</span>
                    </div>
                  </div>
                  <Link href="/profile" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                    <User className="h-4 w-4" /> Profile
                  </Link>
                  <Link href="/settings" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                    <Settings className="h-4 w-4" /> Settings
                  </Link>
                  <form action={logoutAction}>
                    <button type="submit" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                      Logout
                    </button>
                  </form>
                </div>
              </details>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(var(--color-bg))]">
      <header className="sticky top-0 z-50 bg-[hsl(var(--color-bg)/0.92)] backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 sm:pt-4">
          <TopNav userId={userId} accountLabel={accountLabel} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
