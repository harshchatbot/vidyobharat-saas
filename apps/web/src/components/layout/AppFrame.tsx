'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderKanban, FolderPlus, Home, Image as ImageIcon, LayoutTemplate, Mail, Menu, Settings, Sparkles, User, Video, Wand2, X } from 'lucide-react';

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

  useEffect(() => {
    setMobileNavOpen(false);
    setAccountMenuOpen(false);
  }, [pathname]);

  if (inApp) {
    const navItems = [
      {
        href: '/dashboard',
        label: 'Home',
        hint: 'Workspace home',
        icon: Home,
        glow: 'from-[hsl(var(--color-accent)/0.2)] to-transparent',
      },
      {
        href: '/images',
        label: 'Tools',
        hint: pathname.startsWith('/create') ? 'Create video' : pathname.startsWith('/templates') ? 'Template browser' : 'Generate images',
        icon: Sparkles,
        glow: 'from-sky-500/15 to-transparent',
      },
      {
        href: '/influencer',
        label: 'Create Avatar',
        hint: 'AI influencer',
        icon: Wand2,
        glow: 'from-rose-500/15 to-transparent',
      },
      {
        href: '/pricing',
        label: 'More',
        hint: 'Billing & settings',
        icon: Settings,
        glow: 'from-[hsl(var(--color-accent)/0.16)] to-transparent',
      },
    ];

    const navGroups = {
      home: [
        { href: '/dashboard', label: 'Dashboard', icon: Home },
        { href: '/projects', label: 'Projects', icon: FolderKanban },
      ],
      tools: [
        { href: '/images', label: 'Generate images', icon: ImageIcon },
        { href: '/create', label: 'Create video', icon: Video },
        { href: '/templates', label: 'Template browser', icon: LayoutTemplate },
      ],
      avatar: [
        { href: '/influencer', label: 'AI Influencer', icon: Wand2 },
        { href: '/projects', label: 'Projects', icon: FolderKanban },
      ],
      more: [
        { href: '/billing', label: 'Billing', icon: Sparkles },
        { href: '/settings', label: 'Settings', icon: Settings },
      ],
    } as const;

    const activeNavGroup = pathname.startsWith('/influencer')
      ? 'avatar'
      : pathname.startsWith('/images') || pathname.startsWith('/create') || pathname.startsWith('/templates')
        ? 'tools'
        : pathname.startsWith('/billing') || pathname.startsWith('/settings') || pathname.startsWith('/pricing')
          ? 'more'
          : 'home';

    return (
      <CreditProvider userId={userId}>
      <div className="grid min-h-screen grid-cols-1 bg-[hsl(var(--color-bg))] xl:grid-cols-[112px_1fr]">
        <aside className="rangmanch-app-rail hidden px-2 py-4 xl:block">
          <div className="flex items-center justify-center">
            <BrandLogo href="/dashboard" variant="mark" size="sm" priority="sidebar" />
          </div>
          <div className="mt-5 grid gap-2">
            {navItems.map((item) => {
              const active = item.label === 'Tools'
              ? pathname.startsWith('/images') || pathname.startsWith('/create') || pathname.startsWith('/templates')
              : item.label === 'Create Avatar'
                ? pathname.startsWith('/influencer')
                : item.label === 'More'
                  ? pathname.startsWith('/billing') || pathname.startsWith('/settings') || pathname.startsWith('/pricing')
                  : pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
              const Icon = item.icon;
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className={`group inline-flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-lg)] border px-2 py-3 text-center transition ${
                    active
                      ? 'border-[hsl(var(--color-accent)/0.45)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.06))] text-text shadow-soft'
                      : 'border-transparent bg-transparent text-muted hover:border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-bg)/0.72)] hover:text-text'
                  }`}
                >
                  <span
                    className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
                      active
                        ? 'border-[hsl(var(--color-accent)/0.3)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]'
                        : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
                    }`}
                  >
                    <span className={`absolute inset-0 bg-gradient-to-br ${item.glow} opacity-100`} />
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="block text-xs font-medium leading-none text-inherit">{item.label}</span>
                </Link>
              );
            })}
          </div>
          <div className="mt-4 rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] p-2">
            <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">{activeNavGroup === 'tools' ? 'Tools' : activeNavGroup === 'avatar' ? 'Create Avatar' : activeNavGroup === 'more' ? 'More' : 'Workspace'}</p>
            <div className="grid gap-1.5">
              {navGroups[activeNavGroup].map((groupItem) => {
                const GroupIcon = groupItem.icon;
                const activeChild = pathname === groupItem.href || pathname.startsWith(`${groupItem.href}/`);
                return (
                  <Link
                    key={groupItem.href}
                    href={groupItem.href}
                    className={`inline-flex items-center gap-2 rounded-[14px] border px-2.5 py-2 text-xs font-medium transition ${activeChild ? 'border-[hsl(var(--color-accent)/0.55)] bg-[hsl(var(--color-accent)/0.12)] text-text' : 'border-transparent bg-transparent text-muted hover:border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-bg)/0.72)] hover:text-text'}`}
                  >
                    <GroupIcon className={`h-3.5 w-3.5 ${activeChild ? 'text-[hsl(var(--color-accent))]' : ''}`} />
                    {groupItem.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4 xl:px-8">
            <div className="rangmanch-app-header mx-auto flex max-w-[1500px] items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
                  onClick={() => setMobileNavOpen((current) => !current)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface-glass)/0.72)] text-text xl:hidden"
                >
                  {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <div className="xl:hidden">
                  <BrandLogo href="/dashboard" variant="mark" size="sm" />
                </div>
                <span className="hidden truncate font-heading text-xl font-extrabold tracking-tight text-text md:inline-block xl:text-2xl">{pageTitle}</span>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2">
                <Link
                  href="/projects#new-project"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text xl:hidden"
                  aria-label="Create project"
                  title="Create project"
                >
                  <FolderPlus className="h-4.5 w-4.5" />
                </Link>
                <div className="hidden md:block">
                  <CreditChip />
                </div>
                <div className="hidden md:block">
                  <ToggleTheme />
                </div>
                <div ref={accountMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setAccountMenuOpen((current) => !current)}
                    className="flex list-none cursor-pointer items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-2.5 py-1.5 text-sm text-text sm:px-3"
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
                    <span className="hidden lg:inline">{displayName}</span>
                    <ChevronDown className="hidden h-4 w-4 text-muted md:block" />
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
                    <div className="mt-1 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-2 md:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <CreditChip />
                        <ToggleTheme />
                      </div>
                    </div>
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
            <div className="fixed inset-x-0 bottom-0 top-[76px] z-40 xl:hidden">
              <button
                type="button"
                aria-label="Close navigation menu"
                onClick={() => setMobileNavOpen(false)}
                className="absolute inset-0 bg-[hsl(var(--color-bg)/0.78)] backdrop-blur-sm"
              />
              <div className="absolute inset-x-4 top-3 max-h-[calc(100vh-88px)] overflow-y-auto rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.96)] p-4 shadow-soft">
                <div className="space-y-4">
                  <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                    <div className="flex items-center justify-between gap-3">
                      <BrandLogo href="/dashboard" variant="full" size="md" className="max-w-[250px]" priority="nav" />
                      <button
                        type="button"
                        aria-label="Close navigation menu"
                        onClick={() => setMobileNavOpen(false)}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-3">
                    <div className="min-w-0">
                      <CreditChip />
                    </div>
                    <div className="flex items-center justify-end">
                      <ToggleTheme />
                    </div>
                  </div>

                  <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-2">
                    <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Workspace</p>
                    <nav className="grid gap-1.5">
                      {navItems.map((item) => {
                        const active = item.label === 'Tools'
              ? pathname.startsWith('/images') || pathname.startsWith('/create') || pathname.startsWith('/templates')
              : item.label === 'Create Avatar'
                ? pathname.startsWith('/influencer')
                : item.label === 'More'
                  ? pathname.startsWith('/billing') || pathname.startsWith('/settings') || pathname.startsWith('/pricing')
                  : pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
                        const Icon = item.icon;
                        return (
                          <Link
                            key={item.label}
                            href={item.href}
                            onClick={() => setMobileNavOpen(false)}
                            className={`inline-flex items-center gap-3 rounded-[var(--radius-md)] px-2.5 py-2.5 text-sm font-medium transition ${
                              active
                                ? 'bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.06))] text-text'
                                : 'text-muted hover:bg-[hsl(var(--color-surface))] hover:text-text'
                            }`}
                          >
                            <span
                              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${
                                active
                                  ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                                  : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
                              }`}
                            >
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-text">{item.label}</span>
                              <span className="block text-xs text-muted">{item.hint}</span>
                            </span>
                          </Link>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <main className="mx-auto max-w-[1500px] px-4 pb-8 pt-5 sm:px-6 sm:pb-10 sm:pt-6 xl:px-8">{children}</main>
        </div>
      </div>
      </CreditProvider>
    );
  }

  if (pathname === '/') {
    return <CreditProvider userId={userId}>{children}</CreditProvider>;
  }

  return (
    <CreditProvider userId={userId}>
      <div className="min-h-screen bg-[hsl(var(--color-bg))]">
        <header className="sticky top-0 z-50 px-4 pt-3 sm:px-6 sm:pt-4">
          <div className="mx-auto max-w-[1500px]">
            <TopNav userId={userId} accountLabel={accountLabel} />
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </CreditProvider>
  );
}
