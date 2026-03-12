'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Clapperboard,
  FolderPlus,
  FolderKanban,
  Home,
  ImageIcon,
  LayoutTemplate,
  LogOut,
  Settings,
  Sparkles,
  Video,
  Wand2,
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
  icon?: React.ComponentType<{ className?: string }>;
};

const railItems: RailItem[] = [
  { id: 'home', label: 'Home', href: '/dashboard', icon: Home },
  { id: 'tools', label: 'Tools', href: '/images', icon: Sparkles },
  { id: 'avatar', label: 'Create Avatar', href: '/influencer', icon: Wand2 },
  { id: 'templates', label: 'Templates', href: '/templates', icon: LayoutTemplate },
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
  tools: {
    title: 'Create with Tools',
    links: [
      { label: 'Generate images', href: '/images', icon: ImageIcon },
      { label: 'Create video', href: '/create', icon: Video },
      { label: 'Template Browser', href: '/templates', icon: LayoutTemplate },
    ],
  },
  avatar: {
    title: 'Create Avatar',
    links: [
      { label: 'AI Influencer', href: '/influencer' },
      { label: 'Projects', href: '/projects', icon: FolderKanban },
      { label: 'Template Browser', href: '/templates', icon: LayoutTemplate },
    ],
  },
  templates: {
    title: 'Templates',
    links: [
      { label: 'Browse Templates', href: '/templates' },
      { label: 'Legacy Flow', href: '/create/template' },
      { label: 'Script Step', href: '/create/script' },
      { label: 'Customize', href: '/create/customize' },
    ],
  },
  projects: {
    title: 'Project Hub',
    links: [
      { label: 'All Projects', href: '/projects' },
      { label: 'Create Project', href: '/projects#new-project' },
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
  if (pathname.startsWith('/influencer') || pathname.startsWith('/create/avatar')) return 'avatar';
  if (pathname.startsWith('/templates') || pathname.startsWith('/admin/templates') || pathname.startsWith('/create/template')) return 'templates';
  if (pathname.startsWith('/images') || pathname.startsWith('/create/') || pathname === '/create') return 'tools';
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
          <Link
            href="/projects#new-project"
            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.12)] px-3 py-2 text-sm font-semibold text-text transition hover:border-[hsl(var(--color-accent))]"
          >
            <FolderPlus className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Create project
          </Link>
          {activeGroup.links.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] text-text'
                    : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] text-muted hover:text-text'
                }`}
              >
                {Icon ? <Icon className={`h-4 w-4 ${active ? 'text-[hsl(var(--color-accent))]' : ''}`} /> : null}
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
