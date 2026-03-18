'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, FolderKanban, FolderPlus, Home, Image as ImageIcon, LayoutTemplate, LoaderCircle, Mail, Menu, Settings, Sparkles, User, Video, Wand2, X } from 'lucide-react';

import { LogoutButton } from '@/components/auth/LogoutButton';
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

const appRoutePrefixes = ['/dashboard', '/images', '/templates', '/influencer', '/create', '/videos', '/projects', '/editor', '/billing', '/pricing', '/credits', '/profile', '/settings'];

function isAppRoute(pathname: string) {
  return appRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/images')) return 'Image Studio';
  if (pathname.startsWith('/templates')) return 'Template Browser';
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
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavOpen, setDesktopNavOpen] = useState<null | 'home' | 'tools' | 'avatar' | 'more'>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectsNavPending, setProjectsNavPending] = useState(false);
  const [routeTransitionLabel, setRouteTransitionLabel] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopNavRef = useRef<HTMLDivElement | null>(null);
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
      if (!desktopNavRef.current?.contains(event.target as Node)) {
        setDesktopNavOpen(null);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
        setMobileNavOpen(false);
        setDesktopNavOpen(null);
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
    setDesktopNavOpen(null);
    setAccountMenuOpen(false);
    setProjectsNavPending(false);
    setRouteTransitionLabel(null);
  }, [pathname]);

  useEffect(() => {
    if (!inApp) return;
    [
      '/dashboard',
      '/images',
      '/create',
      '/templates',
      '/influencer',
      '/projects',
      '/billing',
      '/settings',
      '/pricing',
      '/profile',
    ].forEach((href) => router.prefetch(href));
  }, [inApp, router]);

  const navigateWithinApp = (href: string, label?: string) => {
    const isAlreadyOnTarget = pathname === href || pathname.startsWith(`${href}/`);
    setDesktopNavOpen(null);
    setMobileNavOpen(false);
    setAccountMenuOpen(false);
    if (isAlreadyOnTarget) {
      setRouteTransitionLabel(null);
      return;
    }
    setRouteTransitionLabel(label ?? getPageTitle(href));
    startTransition(() => {
      router.push(href);
    });
  };

  const openProjectsWorkspace = () => {
    if (pathname.startsWith('/projects')) {
      setProjectsNavPending(false);
      setDesktopNavOpen(null);
      setMobileNavOpen(false);
      setRouteTransitionLabel(null);
      return;
    }
    setProjectsNavPending(true);
    navigateWithinApp('/projects', 'Projects');
  };

  const navigateFromMobileMenu = (href: string) => {
    navigateWithinApp(href);
  };

  if (inApp) {
    const flyoutPreviews: Record<string, string> = {
      '/dashboard': '/illustrations/earth.png',
      '/images': '/illustrations/product-ads.png',
      '/create': '/illustrations/startup.png',
      '/templates': '/illustrations/edtech.png',
      '/influencer': '/illustrations/ai-influencer.png',
      '/billing': '/illustrations/marketing.png',
      '/settings': '/illustrations/agency.png',
    };
    const navItems = [
      {
        href: '/dashboard',
        label: 'Home',
        hint: 'Workspace home',
        icon: Home,
        glow: 'from-[hsl(var(--color-accent)/0.2)] to-transparent',
        kind: 'link',
      },
      {
        href: '/images',
        label: 'Tools',
        hint: pathname.startsWith('/create') ? 'Create video' : pathname.startsWith('/templates') ? 'Template browser' : 'Generate images',
        icon: Sparkles,
        glow: 'from-sky-500/15 to-transparent',
        kind: 'group',
      },
      {
        href: '/influencer',
        label: 'Create Avatar',
        hint: 'AI influencer',
        icon: Wand2,
        glow: 'from-rose-500/15 to-transparent',
        kind: 'group',
      },
      {
        href: '/projects',
        label: 'Projects',
        hint: 'Organize outputs',
        icon: FolderKanban,
        glow: 'from-emerald-500/15 to-transparent',
        kind: 'link',
      },
      {
        href: '/pricing',
        label: 'More',
        hint: 'Billing & settings',
        icon: Settings,
        glow: 'from-[hsl(var(--color-accent)/0.16)] to-transparent',
        kind: 'group',
      },
    ] as const;

    const navGroups = {
      home: [
        { href: '/dashboard', label: 'Dashboard', icon: Home },
      ],
      tools: [
        { href: '/images', label: 'Generate images', icon: ImageIcon },
        { href: '/create', label: 'Create video', icon: Video },
        { href: '/templates', label: 'Template browser', icon: LayoutTemplate },
      ],
      avatar: [
        { href: '/influencer', label: 'AI Influencer', icon: Wand2 },
      ],
      more: [
        { href: '/billing', label: 'Billing', icon: Sparkles },
        { href: '/settings', label: 'Settings', icon: Settings },
      ],
    } as const;

    const activeNavGroup = pathname.startsWith('/influencer')
      ? 'avatar'
      : pathname.startsWith('/projects')
        ? 'projects'
      : pathname.startsWith('/images') || pathname.startsWith('/create') || pathname.startsWith('/templates')
        ? 'tools'
        : pathname.startsWith('/billing') || pathname.startsWith('/settings') || pathname.startsWith('/pricing')
          ? 'more'
          : 'home';

    return (
      <CreditProvider userId={userId}>
      <div className="grid min-h-screen grid-cols-1 overflow-visible bg-[hsl(var(--color-bg))] xl:grid-cols-[96px_1fr]">
        <div className={`pointer-events-none fixed inset-x-0 top-0 z-[110] transition-opacity duration-200 ${isPending ? 'opacity-100' : 'opacity-0'}`}>
          <div className="h-[2px] w-full overflow-hidden bg-[hsl(var(--color-border)/0.3)]">
            <div className="h-full w-1/3 animate-[rangmanch-route-slide_1.05s_ease-in-out_infinite] bg-[linear-gradient(90deg,hsl(var(--color-accent)/0),hsl(var(--color-accent)),hsl(var(--color-accent)/0))]" />
          </div>
        </div>
        <div className={`pointer-events-none fixed right-3 top-[84px] z-[95] transition-all duration-200 sm:right-6 sm:top-[92px] xl:right-8 ${isPending && routeTransitionLabel ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'}`}>
          <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-surface)/0.9)] px-3 py-1.5 text-xs font-medium text-text shadow-soft backdrop-blur-xl">
            <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[hsl(var(--color-accent))]" />
            Opening {routeTransitionLabel}...
          </div>
        </div>
        <aside ref={desktopNavRef} className="rangmanch-app-rail relative z-[70] hidden overflow-visible px-2 py-4 xl:block">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-center">
              <BrandLogo href="/dashboard" variant="mark" size="sm" priority="sidebar" />
            </div>
            <div className="mt-5 grid gap-2">
              {navItems.map((item) => {
                const groupKey = item.label === 'Tools'
                  ? 'tools'
                  : item.label === 'Create Avatar'
                    ? 'avatar'
                    : item.label === 'Projects'
                      ? 'projects'
                      : item.label === 'More'
                        ? 'more'
                        : 'home';
                const active = item.label === 'Tools'
                  ? pathname.startsWith('/images') || pathname.startsWith('/create') || pathname.startsWith('/templates')
                  : item.label === 'Create Avatar'
                    ? pathname.startsWith('/influencer')
                    : item.label === 'Projects'
                      ? pathname.startsWith('/projects')
                    : item.label === 'More'
                      ? pathname.startsWith('/billing') || pathname.startsWith('/settings') || pathname.startsWith('/pricing')
                      : pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (groupKey === 'projects') {
                        openProjectsWorkspace();
                      } else if (groupKey === 'home') {
                        navigateWithinApp('/dashboard', 'Dashboard');
                      } else {
                        setDesktopNavOpen((current) => (current === groupKey ? null : groupKey));
                      }
                    }}
                    className={`group inline-flex flex-col items-center justify-center gap-1 rounded-[var(--radius-lg)] border px-2 py-2.5 text-center transition ${
                      active || desktopNavOpen === groupKey
                        ? 'border-[hsl(var(--color-accent)/0.45)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.06))] text-text shadow-soft'
                        : 'border-transparent bg-transparent text-muted hover:border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-bg)/0.72)] hover:text-text'
                    }`}
                    aria-expanded={desktopNavOpen === groupKey}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <span
                      className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border ${
                        active || desktopNavOpen === groupKey
                          ? 'border-[hsl(var(--color-accent)/0.3)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
                      }`}
                    >
                      <span className={`absolute inset-0 bg-gradient-to-br ${item.glow} opacity-100`} />
                      {groupKey === 'projects' && projectsNavPending ? (
                        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Icon className="h-3.5 w-3.5" />
                      )}
                    </span>
                    <span className="block text-[11px] font-medium leading-none text-inherit">{item.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto flex items-center justify-center pb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
              Workspace
            </div>
          </div>

          <div className={`pointer-events-none fixed left-[84px] top-4 z-[90] w-[196px] transition-all duration-200 ease-out ${desktopNavOpen ? 'translate-x-0 scale-100 opacity-100' : '-translate-x-2 scale-[0.985] opacity-0'}`}>
            <div className="pointer-events-auto rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.96)] p-2.5 shadow-soft backdrop-blur-xl">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">{desktopNavOpen === 'tools' ? 'Tools' : desktopNavOpen === 'avatar' ? 'Create Avatar' : desktopNavOpen === 'more' ? 'More' : 'Workspace'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-text">{desktopNavOpen ? navItems.find((item) => (item.label === 'Tools' ? 'tools' : item.label === 'Create Avatar' ? 'avatar' : item.label === 'More' ? 'more' : item.label === 'Projects' ? 'projects' : 'home') === desktopNavOpen)?.hint : ''}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setDesktopNavOpen(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] text-muted hover:text-text"
                  aria-label="Close section"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid gap-1">
                {(desktopNavOpen ? navGroups[desktopNavOpen] : []).map((groupItem) => {
                  const GroupIcon = groupItem.icon;
                  const activeChild = pathname === groupItem.href || pathname.startsWith(`${groupItem.href}/`);
                  return (
                    <Link
                      key={groupItem.href}
                      href={groupItem.href}
                      onClick={(event) => {
                        event.preventDefault();
                        navigateWithinApp(groupItem.href, groupItem.label);
                      }}
                      className={`inline-flex items-center gap-2 rounded-[12px] border px-2 py-1.5 text-sm font-medium transition ${activeChild ? 'border-[hsl(var(--color-accent)/0.55)] bg-[hsl(var(--color-accent)/0.12)] text-text' : 'border-transparent bg-transparent text-muted hover:border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-bg)/0.72)] hover:text-text'}`}
                    >
                      <span className={`relative inline-flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border ${activeChild ? 'border-[hsl(var(--color-accent)/0.25)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]' : 'border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-bg)/0.4)] text-muted'}`}>
                        {flyoutPreviews[groupItem.href] ? (
                          <img src={flyoutPreviews[groupItem.href]} alt={groupItem.label} className="absolute inset-0 h-full w-full object-cover opacity-85" />
                        ) : null}
                        <span className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--color-bg)/0.02)] via-[hsl(var(--color-bg)/0.14)] to-[hsl(var(--color-bg)/0.64)]" />
                        <GroupIcon className="relative z-10 h-3 w-3" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] font-medium leading-tight">{groupItem.label}</span>
                        <span className="block truncate text-[10px] text-muted">
                          {groupItem.href === '/images'
                            ? 'Fast social visuals'
                            : groupItem.href === '/create'
                              ? 'Cinematic reels'
                              : groupItem.href === '/templates'
                                ? 'Guided workflows'
                                : groupItem.href === '/influencer'
                                  ? 'Consistent avatar creation'
                                  : groupItem.href === '/billing'
                                      ? 'Credits and plans'
                                      : 'Workspace settings'}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
        <div className="relative z-0 min-w-0">
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
                    <Link href="/profile" onClick={(event) => {
                      event.preventDefault();
                      navigateWithinApp('/profile', 'Profile');
                    }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                      <User className="h-4 w-4" /> Profile
                    </Link>
                    <Link href="/settings" onClick={(event) => {
                      event.preventDefault();
                      navigateWithinApp('/settings', 'Settings');
                    }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))]">
                      <Settings className="h-4 w-4" /> Settings
                    </Link>
                    <div className="mt-1 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-2 md:hidden">
                      <div className="flex items-center justify-between gap-3">
                        <CreditChip onNavigate={navigateWithinApp} />
                        <ToggleTheme />
                      </div>
                    </div>
                    <LogoutButton
                      label="Logout"
                      pendingLabel="Logging out..."
                      icon="spinner-only"
                      onBeforeNavigate={() => {
                        setAccountMenuOpen(false);
                        setDesktopNavOpen(null);
                        setMobileNavOpen(false);
                      }}
                      className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm text-text hover:bg-[hsl(var(--color-bg))] disabled:opacity-70"
                    />
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
              <div className="absolute inset-x-3 top-3 z-10 max-h-[calc(100vh-88px)] overflow-y-auto rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.96)] p-3 shadow-soft sm:inset-x-4 sm:rounded-[24px] sm:p-4">
                <div className="space-y-4">
                  <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-2.5 sm:rounded-[var(--radius-md)] sm:p-3">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => navigateWithinApp('/dashboard', 'Dashboard')}
                        className="inline-flex min-w-0 shrink-0 items-center"
                        aria-label="Go to dashboard"
                      >
                        <BrandLogo variant="full" size="md" className="max-w-[250px]" priority="nav" disableLink />
                      </button>
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
                      <CreditChip onNavigate={navigateWithinApp} />
                    </div>
                    <div className="flex items-center justify-end">
                      <ToggleTheme />
                    </div>
                  </div>

                  <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-2 sm:rounded-[var(--radius-lg)]">
                    <p className="px-2 pb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted">Workspace</p>
                    <nav className="grid gap-1.5">
                  {navItems.map((item) => {
                        const active = item.label === 'Tools'
              ? pathname.startsWith('/images') || pathname.startsWith('/create') || pathname.startsWith('/templates')
              : item.label === 'Create Avatar'
                ? pathname.startsWith('/influencer')
                : item.label === 'Projects'
                  ? pathname.startsWith('/projects')
                : item.label === 'More'
                  ? pathname.startsWith('/billing') || pathname.startsWith('/settings') || pathname.startsWith('/pricing')
                  : pathname === item.href || pathname.startsWith(item.href.split('?')[0]);
                        const Icon = item.icon;
                        const baseClass = `inline-flex items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-sm font-medium transition sm:rounded-[var(--radius-md)] ${
                          active
                            ? 'bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.06))] text-text'
                            : 'text-muted hover:bg-[hsl(var(--color-surface))] hover:text-text'
                        }`;
                        const iconClass = `inline-flex h-9 w-9 items-center justify-center rounded-full border sm:h-10 sm:w-10 ${
                          active
                            ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
                        }`;

                        if (item.kind === 'group') {
                          const groupKey = item.label === 'Tools' ? 'tools' : item.label === 'Create Avatar' ? 'avatar' : 'more';
                          const expanded = desktopNavOpen === groupKey;
                          return (
                            <div key={item.label} className="space-y-1.5">
                              <button
                                type="button"
                                onClick={() => setDesktopNavOpen((current) => (current === groupKey ? null : groupKey))}
                                className={`w-full ${baseClass}`}
                                aria-expanded={expanded}
                              >
                                <span className={iconClass}>
                                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                </span>
                                <span className="min-w-0 flex-1 text-left">
                                  <span className="block font-semibold text-text">{item.label}</span>
                                  <span className="block text-xs text-muted">{item.hint}</span>
                                </span>
                                <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180 text-text' : 'text-muted'}`} />
                              </button>
                              {expanded ? (
                                <div className="ml-4 grid gap-1.5 border-l border-[hsl(var(--color-border)/0.7)] pl-3">
                                  {navGroups[groupKey].map((groupItem) => {
                                    const GroupIcon = groupItem.icon;
                                    const activeChild = pathname === groupItem.href || pathname.startsWith(`${groupItem.href}/`);
                                    return (
                                      <button
                                        key={groupItem.href}
                                        type="button"
                                        onClick={() => navigateFromMobileMenu(groupItem.href)}
                                        className={`inline-flex items-center gap-2.5 rounded-[12px] px-2 py-2 text-sm transition ${
                                          activeChild
                                            ? 'bg-[hsl(var(--color-accent)/0.12)] text-text'
                                            : 'text-muted hover:bg-[hsl(var(--color-surface))] hover:text-text'
                                        }`}
                                      >
                                        <span className={`relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border ${
                                          activeChild
                                            ? 'border-[hsl(var(--color-accent)/0.25)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]'
                                            : 'border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-bg)/0.4)] text-muted'
                                        }`}>
                                          {flyoutPreviews[groupItem.href] ? (
                                            <img src={flyoutPreviews[groupItem.href]} alt={groupItem.label} className="absolute inset-0 h-full w-full object-cover opacity-85" />
                                          ) : null}
                                          <span className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--color-bg)/0.02)] via-[hsl(var(--color-bg)/0.14)] to-[hsl(var(--color-bg)/0.64)]" />
                                          <GroupIcon className="relative z-10 h-3 w-3" />
                                        </span>
                                        <span className="min-w-0 flex-1">
                                          <span className="block truncate text-[12px] font-medium leading-tight text-text">{groupItem.label}</span>
                                          <span className="block truncate text-[10px] text-muted">
                                            {groupItem.href === '/images'
                                              ? 'Fast social visuals'
                                              : groupItem.href === '/create'
                                                ? 'Cinematic reels'
                                                : groupItem.href === '/templates'
                                                  ? 'Guided workflows'
                                                  : groupItem.href === '/influencer'
                                                    ? 'Consistent avatar creation'
                                                    : groupItem.href === '/billing'
                                                      ? 'Credits and plans'
                                                      : 'Workspace settings'}
                                          </span>
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          );
                        }

                        if (item.label === 'Projects') {
                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={openProjectsWorkspace}
                              className={baseClass}
                            >
                              <span className={iconClass}>
                                {projectsNavPending ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin sm:h-4 sm:w-4" />
                                ) : (
                                  <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                                )}
                              </span>
                              <span className="min-w-0 flex-1 text-left">
                                <span className="block font-semibold text-text">{item.label}</span>
                                <span className="block text-xs text-muted">{projectsNavPending ? 'Opening workspace…' : item.hint}</span>
                              </span>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => navigateFromMobileMenu(item.href)}
                            className={`w-full ${baseClass}`}
                          >
                            <span className={iconClass}>
                              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block font-semibold text-text">{item.label}</span>
                              <span className="block text-xs text-muted">{item.hint}</span>
                            </span>
                          </button>
                        );
                      })}
                    </nav>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          <main className={`mx-auto max-w-[1500px] px-4 pb-8 pt-5 transition-[opacity,transform] duration-200 sm:px-6 sm:pb-10 sm:pt-6 xl:px-8 ${isPending ? 'opacity-80 translate-y-[2px]' : 'opacity-100 translate-y-0'}`}>{children}</main>
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
