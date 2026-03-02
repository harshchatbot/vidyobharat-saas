'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Clapperboard,
  FolderKanban,
  Home,
  LayoutTemplate,
  LogOut,
  Settings,
  Sparkles,
  Video,
} from 'lucide-react';

import { logoutAction } from '@/app/auth-actions';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

type Props = {
  accountLabel: string | null;
};

type RailItem = {
  id: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
};

type PanelLink = {
  label: string;
  href: string;
};

const railItems: RailItem[] = [
  { id: 'home', label: 'Home', href: '/dashboard', icon: Home },
  { id: 'create', label: 'Create', href: '/create/choose', icon: Sparkles },
  { id: 'avatars', label: 'Avatars', href: '/create/avatar', icon: Clapperboard },
  { id: 'templates', label: 'Templates', href: '/create/template', icon: LayoutTemplate },
  { id: 'projects', label: 'Projects', href: '/projects', icon: FolderKanban },
  { id: 'renders', label: 'Renders', href: '/renders', icon: Video },
  { id: 'settings', label: 'Settings', href: '/billing', icon: Settings },
];

const panelGroups: Record<string, { title: string; links: PanelLink[] }> = {
  home: {
    title: 'Workspace',
    links: [
      { label: 'Home', href: '/dashboard' },
      { label: 'Projects', href: '/projects' },
      { label: 'Create New', href: '/create/choose' },
      { label: 'Billing', href: '/billing' },
    ],
  },
  create: {
    title: 'Create Flow',
    links: [
      { label: 'Choose Base', href: '/create/choose' },
      { label: 'Avatar Select', href: '/create/avatar' },
      { label: 'Template Select', href: '/create/template' },
      { label: 'Script', href: '/create/script' },
      { label: 'Customize', href: '/create/customize' },
      { label: 'Confirm', href: '/create/confirm' },
    ],
  },
  avatars: {
    title: 'Avatar Videos',
    links: [
      { label: 'Avatar Library', href: '/create/avatar' },
      { label: 'Script to Video', href: '/create/script' },
      { label: 'My Projects', href: '/projects' },
    ],
  },
  templates: {
    title: 'Templates',
    links: [
      { label: 'Browse Templates', href: '/create/template' },
      { label: 'Script Step', href: '/create/script' },
      { label: 'Customize', href: '/create/customize' },
    ],
  },
  projects: {
    title: 'Project Hub',
    links: [
      { label: 'All Projects', href: '/projects' },
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Create New', href: '/create/choose' },
    ],
  },
  renders: {
    title: 'Render Queue',
    links: [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Create Video', href: '/create/choose' },
      { label: 'Projects', href: '/projects' },
    ],
  },
  settings: {
    title: 'Account',
    links: [
      { label: 'Billing', href: '/billing' },
      { label: 'Learning', href: '/learning' },
      { label: 'Company', href: '/company' },
    ],
  },
};

function matchActiveRail(pathname: string): string {
  if (pathname === '/dashboard') return 'home';
  if (pathname.startsWith('/create/avatar')) return 'avatars';
  if (pathname.startsWith('/create/template')) return 'templates';
  if (pathname.startsWith('/create/')) return 'create';
  if (pathname.startsWith('/projects') || pathname.startsWith('/editor/')) return 'projects';
  if (pathname.startsWith('/renders/')) return 'renders';
  if (pathname.startsWith('/billing')) return 'settings';
  return 'home';
}

export function AuthSidebar({ accountLabel }: Props) {
  const pathname = usePathname();
  const activeRail = matchActiveRail(pathname);
  const activeGroup = panelGroups[activeRail] ?? panelGroups.home;

  return (
    <aside className="sticky top-0 grid h-screen grid-cols-[72px_240px] border-r border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
      <div className="flex flex-col items-center gap-3 border-r border-[hsl(var(--color-border))] px-2 py-3">
        <div className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-1">
          <BrandLogo href="/dashboard" variant="mark" size="sm" />
        </div>

        <nav className="grid gap-2">
          {railItems.map((item) => {
            const Icon = item.icon;
            const active = activeRail === item.id;
            return (
              <Link
                key={item.id}
                href={item.href}
                title={item.label}
                className={`inline-flex h-10 w-10 items-center justify-center rounded-[var(--radius-md)] border transition ${
                  active
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.14)] text-text'
                    : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-muted hover:text-text'
                }`}
              >
                <Icon className="h-4 w-4" />
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto flex flex-col items-center gap-2">
          <ToggleTheme />
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
            {accountLabel}
          </div>
        </div>
      </div>

      <div className="flex flex-col p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted">{activeGroup.title}</p>
        <div className="mt-3 grid gap-2">
          {activeGroup.links.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] text-text'
                    : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] text-muted hover:text-text'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="mt-auto rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
          <p className="text-xs text-muted">Personal</p>
          <p className="text-sm font-semibold text-text">{accountLabel ?? 'User'}</p>
          <form action={logoutAction} className="mt-3">
            <button
              type="submit"
              className="inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-2 text-sm font-semibold text-text"
            >
              <LogOut className="h-4 w-4" />
              Log out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
