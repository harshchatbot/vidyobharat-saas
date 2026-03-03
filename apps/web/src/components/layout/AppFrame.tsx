'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Home, Image as ImageIcon, Mail, Menu, Settings, Sparkles, User, Video, Wand2, X } from 'lucide-react';

import { logoutAction } from '@/app/auth-actions';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { CreditChip } from '@/components/credits/CreditChip';
import { CreditProvider } from '@/components/credits/CreditContext';
import { TopNav } from '@/components/layout/TopNav';
import { ToggleTheme } from '@/components/ui/ToggleTheme';
import { API_URL } from '@/lib/env';

type Props = {
  userId: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accountAvatar?: string | null;
  children: React.ReactNode;
};

const appRoutePrefixes = ['/dashboard', '/images', '/influencer', '/create', '/videos', '/projects', '/editor', '/billing', '/pricing', '/credits', '/profile', '/settings'];

function isAppRoute(pathname: string) {
  return appRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/images')) return 'Image Studio';
  if (pathname.startsWith('/influencer')) return 'Influencer Studio';
  if (pathname.startsWith('/create')) return 'Create Video';
  if (pathname.startsWith('/videos/')) return 'Video Details';
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/billing')) return 'Billing';
  if (pathname.startsWith('/pricing')) return 'Pricing';
  if (pathname.startsWith('/credits/history')) return 'Credit History';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'RangManch AI';
}

export function AppFrame({ userId, accountLabel, accountEmail, accountAvatar, children }: Props) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const inApp = Boolean(userId) && isAppRoute(pathname);
  const pageTitle = getPageTitle(pathname);
  const displayName = accountLabel ?? 'User';
  const resolvedAvatar = accountAvatar
    ? (accountAvatar.startsWith('http://') || accountAvatar.startsWith('https://') ? accountAvatar : `${API_URL}${accountAvatar}`)
    : null;

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        setMobileNavOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  if (inApp) {
    const navItems = [
      {
        href: '/dashboard',
        label: 'Creator Home',
        hint: 'Recent outputs',
        icon: Home,
        glow: 'from-[hsl(var(--color-accent)/0.2)] to-transparent',
      },
      {
        href: '/images',
        label: 'Create Image',
        hint: 'Prompt to image',
        icon: ImageIcon,
        glow: 'from-sky-500/15 to-transparent',
      },
      {
        href: '/create',
        label: 'Video Studio',
        hint: 'Text / frame to video',
        icon: Video,
        glow: 'from-emerald-500/15 to-transparent',
      },
      {
        href: '/influencer',
        label: 'Influencer Studio',
        hint: 'Character consistency',
        icon: Wand2,
        glow: 'from-rose-500/15 to-transparent',
      },
    ];

    return (
      <CreditProvider userId={userId}>
      <div className="grid min-h-screen grid-cols-1 bg-[hsl(var(--color-bg))] md:grid-cols-[240px_1fr]">
        <aside className="hidden border-r border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)),hsl(var(--color-bg)))] p-4 md:block">
          <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-bg)),hsl(var(--color-surface)))] p-3 shadow-soft">
            <BrandLogo href="/dashboard" variant="full" size="lg" className="max-w-[255px]" priority="sidebar" />
          </div>
          <div className="mt-6 px-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-muted">Workspace</div>
          <nav className="mt-3 grid gap-2">
            {navItems.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`inline-flex items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-3 text-sm transition ${
                    active
                      ? 'border-[hsl(var(--color-accent)/0.45)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.06))] text-text shadow-soft'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:bg-[hsl(var(--color-surface))]'
                  }`}
                >
                  <span
                    className={`relative inline-flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
                      active
                        ? 'border-[hsl(var(--color-accent)/0.3)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]'
                        : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
                    }`}
                  >
                    <span className={`absolute inset-0 bg-gradient-to-br ${item.glow} opacity-100`} />
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-text">{item.label}</span>
                    <span className="block text-xs text-muted">{item.hint}</span>
                  </span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.94)] backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  onClick={() => setMobileNavOpen((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text md:hidden"
                >
                  {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div className="md:hidden">
                  <BrandLogo href="/dashboard" variant="mark" size="sm" />
                </div>
                <span className="font-heading text-xl font-bold tracking-tight text-text">{pageTitle}</span>
              </div>

              <div className="flex items-center gap-2">
                <CreditChip />
                <ToggleTheme />
                <div ref={accountMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((current) => !current)}
                    className="flex list-none cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-1.5 text-sm text-text"
                    aria-expanded={accountMenuOpen}
                    aria-label="Open account menu"
                  >
                    {resolvedAvatar ? (
                      <img src={resolvedAvatar} alt={displayName} className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
                        {displayName.slice(0, 1)}
                      </span>
                    )}
                    <span className="hidden sm:inline">{displayName}</span>
                    <ChevronDown className="h-4 w-4 text-muted" />
                  </button>
                  {accountMenuOpen ? (
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
                    <Link href="/profile" onClick={() => setAccountMenuOpen(false)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                      <User className="h-4 w-4" /> Profile
                    </Link>
                    <Link href="/settings" onClick={() => setAccountMenuOpen(false)} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                    <form action={logoutAction}>
                      <button type="submit" className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                        Logout
                      </button>
                    </form>
                  </div>
                  ) : null}
                </div>
              </div>
            </div>
          </header>
          {mobileNavOpen ? (
            <div className="border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-4 md:hidden">
                <div className="space-y-3">
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                  <BrandLogo href="/dashboard" variant="full" size="md" className="max-w-[250px]" priority="nav" />
                </div>
                <nav className="grid gap-2">
                  {navItems.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setMobileNavOpen(false)}
                        className={`inline-flex items-center gap-3 rounded-[var(--radius-lg)] border px-3 py-3 text-sm font-medium ${
                          active
                            ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.14)] text-text'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] text-muted'
                        }`}
                      >
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-text">{item.label}</span>
                          <span className="block text-xs text-muted">{item.hint}</span>
                        </span>
                      </Link>
                    );
                  })}
                </nav>
              </div>
            </div>
          ) : null}
          <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
      </CreditProvider>
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
