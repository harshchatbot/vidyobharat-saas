'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ChevronDown, Compass, FolderKanban, FolderPlus, HelpCircle, Image as ImageIcon, LayoutTemplate, LoaderCircle, Mail, Menu, MessageCircle, Settings, Sparkles, User, Video, Wand2, X } from 'lucide-react';

import { LogoutButton } from '@/components/auth/LogoutButton';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { CreditChip } from '@/components/credits/CreditChip';
import { CreditProvider, useCredits } from '@/components/credits/CreditContext';
import { TopNav } from '@/components/layout/TopNav';
import { Button } from '@/components/ui/Button';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { ToggleTheme } from '@/components/ui/ToggleTheme';
import { API_URL } from '@/lib/env';
import { NotificationBell } from '@/components/notifications/NotificationBell';

type Props = {
  userId: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accountAvatar?: string | null;
  children: React.ReactNode;
};

const appRoutePrefixes = ['/dashboard', '/community', '/images', '/templates', '/influencer', '/create', '/videos', '/library', '/projects', '/editor', '/billing', '/pricing', '/credits', '/profile', '/settings', '/help'];

function isAppRoute(pathname: string) {
  return appRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getPageTitle(pathname: string) {
  if (pathname.startsWith('/dashboard')) return 'Dashboard';
  if (pathname.startsWith('/library')) return 'Library';
  if (pathname.startsWith('/images/library')) return 'Images';
  if (pathname.startsWith('/images')) return 'Image Studio';
  if (pathname === '/videos') return 'Library';
  if (pathname.startsWith('/templates')) return 'Template Browser';
  if (pathname.startsWith('/influencer')) return 'Influencer Studio';
  if (pathname.startsWith('/create')) return 'Create';
  if (pathname.startsWith('/videos/')) return 'Video Details';
  if (pathname.startsWith('/projects')) return 'Projects';
  if (pathname.startsWith('/billing')) return 'Billing';
  if (pathname.startsWith('/pricing')) return 'Pricing';
  if (pathname.startsWith('/credits/history')) return 'Credit History';
  if (pathname.startsWith('/profile')) return 'Profile';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/help')) return 'Help';
  return 'RangManch AI';
}

function getRouteTransitionCopy(label: string) {
  const normalized = label.trim().toLowerCase();
  if (['dashboard', 'projects'].includes(normalized)) {
    return 'Loading workspace';
  }
  if (['image studio', 'create', 'template browser', 'influencer studio'].includes(normalized)) {
    return 'Preparing studio';
  }
  if (['billing', 'pricing', 'settings', 'profile', 'credit history'].includes(normalized)) {
    return 'Fetching account';
  }
  return `Loading ${label}`;
}

function isMoreRoute(pathname: string) {
  return (
    pathname.startsWith('/billing') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/pricing') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/help') ||
    pathname.startsWith('/credits')
  );
}

export function AppFrame({ userId, accountLabel, accountEmail, accountAvatar, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [desktopNavOpen, setDesktopNavOpen] = useState<null | 'create' | 'billing' | 'more'>(null);
  const [mobileNavTapLocked, setMobileNavTapLocked] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [projectsNavPending, setProjectsNavPending] = useState(false);
  const [routeTransitionLabel, setRouteTransitionLabel] = useState<string | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const desktopNavRef = useRef<HTMLDivElement | null>(null);
  const inApp = Boolean(userId) && isAppRoute(pathname);
  const immersiveStudioRoute = pathname.startsWith('/videos/');
  const pageTitle = getPageTitle(pathname);
  const displayName = accountLabel ?? 'User';
  const useExpandedAppShell = inApp;
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
        setMobileNavTapLocked(false);
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
    setMobileNavTapLocked(false);
    setDesktopNavOpen(null);
    setAccountMenuOpen(false);
    setProjectsNavPending(false);
    setRouteTransitionLabel(null);
  }, [pathname]);

  useEffect(() => {
    if (mobileNavOpen) return;
    setMobileNavTapLocked(false);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!inApp) return;
    [
      '/dashboard',
      '/images',
      '/videos',
      '/library',
      '/create',
      '/templates',
      '/influencer',
      '/projects',
      '/billing',
      '/settings',
      '/pricing',
      '/profile',
      '/help',
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
    window.dispatchEvent(new CustomEvent('rangmanch:navigation-start'));
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
      setMobileNavTapLocked(false);
      setRouteTransitionLabel(null);
      return;
    }
    setProjectsNavPending(true);
    navigateWithinApp('/projects', 'Projects');
  };

  const navigateFromMobileMenu = (href: string, label?: string) => {
    if (mobileNavTapLocked || isPending) return;
    setMobileNavTapLocked(true);
    navigateWithinApp(href, label);
  };

  if (inApp) {
    const flyoutPreviews: Record<string, string> = {
      '/create': '/illustrations/startup.png',
      '/images': '/illustrations/product-ads.png',
      '/templates': '/illustrations/edtech.png',
      '/influencer': '/illustrations/ai-influencer.png',
      '/billing': '/illustrations/marketing.png',
      '/pricing': '/illustrations/marketing.png',
      '/settings': '/illustrations/agency.png',
    };
    const navItems = [
      {
        href: '/create',
        label: 'Create',
        hint: 'Unified creation hub',
        icon: Sparkles,
        glow: 'from-[hsl(var(--color-accent)/0.2)] to-transparent',
        kind: 'group',
        groupKey: 'create',
      },
      {
        href: '/projects',
        label: 'Projects',
        hint: 'Organize outputs',
        icon: FolderKanban,
        glow: 'from-emerald-500/15 to-transparent',
        kind: 'link',
        groupKey: 'projects',
      },
      {
        href: '/billing',
        label: 'Billing',
        hint: 'Credits and plans',
        icon: Sparkles,
        glow: 'from-[hsl(var(--color-accent)/0.16)] to-transparent',
        kind: 'group',
        groupKey: 'billing',
      },
      {
        href: '/help',
        label: 'More',
        hint: 'Settings and help',
        icon: Settings,
        glow: 'from-[hsl(var(--color-accent)/0.16)] to-transparent',
        kind: 'group',
        groupKey: 'more',
      },
    ] as const;

    const navGroups = {
      create: [
        { href: '/create', label: 'Unified studio', icon: Video },
        { href: '/videos', label: 'Video library', icon: Video },
        { href: '/images', label: 'Generate images', icon: ImageIcon },
        { href: '/templates', label: 'Template browser', icon: LayoutTemplate },
        { href: '/influencer', label: 'AI Influencer', icon: Wand2 },
      ],
      billing: [
        { href: '/billing', label: 'Billing', icon: Sparkles },
        { href: '/pricing', label: 'Pricing', icon: Sparkles },
        { href: '/credits/history', label: 'Credit history', icon: FolderKanban },
      ],
      more: [
        { href: '/help', label: 'Help', icon: HelpCircle },
        { href: '/settings', label: 'Settings', icon: Settings },
        { href: '/profile', label: 'Profile', icon: User },
      ],
    } as const;

    const mobileNavItems = [
      { href: '/create', label: 'Explore', hint: 'Recipe-led creation', icon: Compass, active: pathname.startsWith('/create') || pathname.startsWith('/images') || pathname.startsWith('/templates') || pathname.startsWith('/influencer') },
      { href: '/projects', label: 'Projects', hint: projectsNavPending ? 'Loading workspace…' : 'Organize renders', icon: FolderKanban, active: pathname.startsWith('/projects') },
      { href: '/library', label: 'Library', hint: 'Revisit outputs', icon: Video, active: pathname.startsWith('/library') },
      { href: '/billing', label: 'Billing', hint: 'Credits and plans', icon: Sparkles, active: pathname.startsWith('/billing') || pathname.startsWith('/pricing') || pathname.startsWith('/credits') },
      { href: '/help', label: 'More', hint: 'Help and settings', icon: Settings, active: isMoreRoute(pathname) },
    ] as const;

    return (
      <CreditProvider userId={userId}>
      <div className={`grid min-h-screen grid-cols-1 overflow-visible bg-[hsl(var(--color-bg))] ${immersiveStudioRoute ? '' : useExpandedAppShell ? 'xl:grid-cols-[240px_1fr]' : 'xl:grid-cols-[96px_1fr]'}`}>
        <div className={`pointer-events-none fixed inset-x-0 top-0 z-[110] transition-opacity duration-200 ${isPending ? 'opacity-100' : 'opacity-0'}`}>
          <div className="h-[2px] w-full overflow-hidden bg-[hsl(var(--color-border)/0.3)]">
            <div className="h-full w-1/3 animate-[rangmanch-route-slide_1.05s_ease-in-out_infinite] bg-[linear-gradient(90deg,hsl(var(--color-accent)/0),hsl(var(--color-accent)),hsl(var(--color-accent)/0))]" />
          </div>
        </div>
        <LoadingOverlay
          open={isPending && Boolean(routeTransitionLabel)}
          title={routeTransitionLabel ? getRouteTransitionCopy(routeTransitionLabel) : 'Loading workspace'}
          description={routeTransitionLabel ? `Opening ${routeTransitionLabel}.` : 'Opening your workspace.'}
          accentLabel="Workspace"
        />
        {!immersiveStudioRoute ? (
        <aside ref={desktopNavRef} className={`rangmanch-app-rail relative z-[70] hidden overflow-visible py-4 xl:block ${useExpandedAppShell ? 'px-4' : 'px-2'}`}>
          <div className="flex h-full flex-col">
            {useExpandedAppShell ? (
              <div className="sticky top-4 flex h-[calc(100vh-2rem)] flex-col rounded-[var(--radius-xl)] border border-[hsl(var(--color-border-soft)/0.3)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.9),hsl(var(--color-bg)/0.92))] px-4 py-5 shadow-soft">
                <div className="flex items-center justify-between">
                  <BrandLogo href="/create" variant="full" size="md" priority="sidebar" />
                  <NotificationBell />
                </div>
                <div className="mt-7 space-y-1.5">
                  {[
                    { href: '/create', label: 'Explore', icon: Compass, active: pathname.startsWith('/create') || pathname.startsWith('/images') || pathname.startsWith('/templates') || pathname.startsWith('/influencer'), onClick: () => navigateWithinApp('/create', 'Create') },
                    { href: '/projects', label: 'Projects', icon: FolderKanban, active: pathname.startsWith('/projects'), onClick: openProjectsWorkspace },
                    { href: '/library', label: 'Library', icon: Video, active: pathname.startsWith('/library'), onClick: () => navigateWithinApp('/library', 'library') },
                    { href: '/billing', label: 'Billing', icon: Sparkles, active: pathname.startsWith('/billing') || pathname.startsWith('/pricing') || pathname.startsWith('/credits'), onClick: () => navigateWithinApp('/billing', 'Billing') },
                    { href: '/help', label: 'More', icon: Settings, active: isMoreRoute(pathname), onClick: () => navigateWithinApp('/help', 'Help') },
                  ].map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={item.onClick}
                        className={`flex w-full items-center gap-3 rounded-[18px] border px-3 py-3 text-left transition ${
                          item.active
                            ? 'border-[hsl(var(--color-accent)/0.18)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.14),hsl(var(--color-accent)/0.05))] text-text shadow-soft'
                            : 'border-transparent bg-transparent text-muted hover:border-[hsl(var(--color-border-soft)/0.3)] hover:bg-[hsl(var(--color-surface)/0.72)] hover:text-text'
                        }`}
                      >
                        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${item.active ? 'border-[hsl(var(--color-accent)/0.14)] bg-[hsl(var(--color-accent)/0.1)] text-[hsl(var(--color-accent))]' : 'border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-surface))] text-text'}`}>
                          {item.label === 'Projects' && projectsNavPending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-inherit">{item.label}</span>
                          <span className="block text-xs text-muted">
                            {item.label === 'Explore'
                              ? 'Recipe-led creation'
                              : item.label === 'Projects'
                                ? 'Organize renders'
                                : item.label === 'Library'
                                  ? 'Revisit outputs'
                                : item.label === 'Billing'
                                  ? 'Credits and plans'
                                    : 'Help and settings'}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-auto space-y-3">
                  <div className="overflow-hidden rounded-[var(--radius-xl)] border border-[hsl(var(--color-border-soft)/0.3)] bg-[linear-gradient(180deg,hsl(var(--color-accent)/0.18),hsl(var(--color-surface)/0.9))] p-4 shadow-soft">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent-contrast)/0.78)]">Share to earn</p>
                    <p className="mt-2 text-2xl font-heading font-extrabold tracking-tight text-text">Earn credits by sharing videos</p>
                    <Button variant="secondary" className="mt-4 w-full rounded-full border-white/10 bg-white/10 text-white hover:bg-white/15">
                      Earn now
                    </Button>
                  </div>

                  <SidebarCreditsCard />

                  <button
                    type="button"
                    className="flex w-full items-center gap-3 rounded-[18px] border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-surface)/0.82)] px-3 py-3 text-left text-text transition hover:shadow-[var(--shadow-soft)]"
                  >
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg)/0.7)] text-[hsl(var(--color-accent))]">
                      <MessageCircle className="h-4 w-4" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold">Discord</span>
                      <span className="block text-xs text-muted">Creator community</span>
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-center">
                  <BrandLogo href="/create" variant="mark" size="sm" priority="sidebar" />
                </div>
                <div className="mt-5 grid gap-2">
                  {navItems.map((item) => {
                    const groupKey = item.groupKey;
                    const active =
                      groupKey === 'create'
                        ? pathname.startsWith('/create') || pathname.startsWith('/images') || pathname.startsWith('/templates') || pathname.startsWith('/influencer')
                        : groupKey === 'projects'
                          ? pathname.startsWith('/projects')
                          : groupKey === 'billing'
                            ? pathname.startsWith('/billing') || pathname.startsWith('/pricing') || pathname.startsWith('/credits')
                            : isMoreRoute(pathname);
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => {
                          if (groupKey === 'projects') {
                            openProjectsWorkspace();
                          } else {
                            setDesktopNavOpen((current) => (current === groupKey ? null : (groupKey as 'create' | 'billing' | 'more')));
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
              </>
            )}
          </div>

          <div className={`pointer-events-none fixed left-[84px] top-4 z-[90] w-[196px] transition-all duration-200 ease-out ${useExpandedAppShell ? 'hidden' : ''} ${desktopNavOpen ? 'translate-x-0 scale-100 opacity-100' : '-translate-x-2 scale-[0.985] opacity-0'}`}>
            <div className="pointer-events-auto rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.96)] p-2.5 shadow-soft backdrop-blur-xl">
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">{desktopNavOpen === 'create' ? 'Create' : desktopNavOpen === 'billing' ? 'Billing' : desktopNavOpen === 'more' ? 'More' : 'Workspace'}</p>
                  <p className="mt-1 text-[11px] font-semibold text-text">{desktopNavOpen ? navItems.find((item) => item.groupKey === desktopNavOpen)?.hint : ''}</p>
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
                          {groupItem.href === '/create'
                            ? 'Unified creation hub'
                            : groupItem.href === '/images'
                              ? 'Fast social visuals'
                              : groupItem.href === '/templates'
                                ? 'Guided workflows'
                                : groupItem.href === '/influencer'
                                  ? 'Consistent avatar creation'
                                  : groupItem.href === '/billing'
                                      ? 'Credits and plans'
                                      : groupItem.href === '/help'
                                        ? 'Quick answers'
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
        ) : null}
        <div className="relative z-0 min-w-0">
          {!immersiveStudioRoute ? (
          <header className={`sticky top-0 z-40 px-3 pt-3 sm:px-6 sm:pt-4 xl:px-8 ${useExpandedAppShell ? 'pb-1' : ''}`}>
            <div className={`rangmanch-app-header mx-auto flex items-center justify-between gap-3 px-4 py-3 sm:px-5 ${useExpandedAppShell ? 'max-w-[1680px]' : 'max-w-[1500px]'}`}>
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
                  <BrandLogo href="/create" variant="mark" size="sm" />
                </div>
                <span className={`hidden truncate font-heading text-xl font-extrabold tracking-tight text-text md:inline-block xl:text-2xl ${useExpandedAppShell ? 'xl:opacity-0' : ''}`}>{pageTitle}</span>
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
                <NotificationBell />
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
                    <span className="hidden min-w-0 lg:block">
                      <span className="block max-w-[180px] truncate text-left text-sm font-medium text-text">
                        {displayName}
                      </span>
                      <span className="block max-w-[180px] truncate text-left text-[11px] text-muted">
                        {accountEmail ?? 'No email set'}
                      </span>
                    </span>
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
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-text">{displayName}</p>
                          <p className="truncate text-xs text-muted">{accountEmail ?? 'No email set'}</p>
                        </div>
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
                        <NotificationBell />
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
          ) : null}
          {!immersiveStudioRoute && mobileNavOpen ? (
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
                        onClick={() => navigateFromMobileMenu('/create', 'Explore')}
                        className="inline-flex min-w-0 shrink-0 items-center"
                        aria-label="Go to dashboard"
                      >
                        <BrandLogo variant="full" size="md" className="max-w-[250px]" priority="nav" disableLink />
                      </button>
                      <button
                        type="button"
                        aria-label="Close navigation menu"
                        onClick={() => {
                          setMobileNavOpen(false);
                          setMobileNavTapLocked(false);
                        }}
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
                      {mobileNavItems.map((item) => {
                        const Icon = item.icon;
                        const baseClass = `inline-flex items-center gap-3 rounded-[14px] px-2.5 py-2.5 text-sm font-medium transition sm:rounded-[var(--radius-md)] ${
                          item.active
                            ? 'bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.06))] text-text'
                            : 'text-muted hover:bg-[hsl(var(--color-surface))] hover:text-text'
                        }`;
                        const iconClass = `inline-flex h-9 w-9 items-center justify-center rounded-full border sm:h-10 sm:w-10 ${
                          item.active
                            ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
                        }`;

                        if (item.href === '/projects') {
                          return (
                            <button
                              key={item.label}
                              type="button"
                              onClick={() => {
                                if (mobileNavTapLocked || isPending) return;
                                setMobileNavTapLocked(true);
                                openProjectsWorkspace();
                              }}
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
                                <span className="block text-xs text-muted">{projectsNavPending ? 'Loading workspace…' : item.hint}</span>
                              </span>
                            </button>
                          );
                        }

                        return (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => navigateFromMobileMenu(item.href, item.label)}
                            className={baseClass}
                          >
                            <span className={iconClass}>
                              <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                            </span>
                            <span className="min-w-0 flex-1 text-left">
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
          <main className={`mx-auto px-4 pb-8 ${immersiveStudioRoute ? 'pt-4 sm:px-5 sm:pb-8 sm:pt-5 xl:max-w-[1880px] xl:px-6' : 'pt-5 sm:px-6 sm:pb-10 sm:pt-6 xl:px-8 ' + (useExpandedAppShell ? 'max-w-[1680px]' : 'max-w-[1500px]')} transition-[opacity,transform] duration-200 ${isPending ? 'opacity-80 translate-y-[2px]' : 'opacity-100 translate-y-0'}`}>{children}</main>
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
            <TopNav userId={userId} accountLabel={accountLabel} accountEmail={accountEmail} />
          </div>
        </header>
        <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </CreditProvider>
  );
}

function SidebarCreditsCard() {
  const { wallet, loading } = useCredits();

  return (
    <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.82)] p-4 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Credits</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-heading font-extrabold tracking-tight text-text">
            {loading ? '...' : wallet?.currentCredits ?? 0}
          </p>
          <p className="text-xs text-muted">{loading ? 'Loading…' : 'credits left'}</p>
        </div>
        <Button className="rounded-full px-4 py-2 text-xs font-semibold">Upgrade</Button>
      </div>
    </div>
  );
}
