'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BookOpenText, Clapperboard, Crown, FileText, Home, ImageIcon, Menu, PlaySquare, Sparkles, Wand2, X } from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

type NavItem = {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: string;
};

const primaryItems: NavItem[] = [
  { label: 'Home', href: '#hero', icon: Home },
  { label: 'Text to Video', href: '/signup', icon: Clapperboard, section: 'Create' },
  { label: 'Image to Video', href: '/signup', icon: ImageIcon },
  { label: 'AI Influencer', href: '/signup', icon: Wand2 },
  { label: 'Shorts', href: '/signup', icon: Sparkles },
  { label: 'Video Editor', href: '/signup', icon: PlaySquare },
];

const supportItems: NavItem[] = [
  { label: 'My Videos', href: '/login', icon: Crown, section: 'Workspace' },
  { label: 'Pricing', href: '/pricing', icon: FileText, section: 'Support' },
  { label: 'Docs & Tutorials', href: '/learning', icon: BookOpenText },
];

function NavGroup({ items, currentHash, onNavigate }: { items: NavItem[]; currentHash: string; onNavigate?: () => void }) {
  return (
    <div className="space-y-1.5">
      {items.map((item) => {
        const active = item.href.startsWith('#') ? currentHash === item.href : false;
        const Icon = item.icon;
        return (
          <Link
            key={item.label}
            href={item.href}
            onClick={onNavigate}
            className={`group flex items-center gap-3 rounded-[18px] px-3 py-2.5 text-sm transition ${
              active
                ? 'bg-[hsl(var(--color-surface-glass-strong)/0.8)] text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)]'
                : 'text-[hsl(var(--color-muted))] hover:bg-[hsl(var(--color-surface-glass)/0.52)] hover:text-[hsl(var(--color-text))]'
            }`}
          >
            <span
              className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
                active
                  ? 'border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-surface-glass-strong)/0.86)]'
                  : 'border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.36)]'
              }`}
            >
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function CollapsibleNavSection({
  title,
  items,
  currentHash,
  defaultOpen = true,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  currentHash: string;
  defaultOpen?: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-[22px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.24)] p-2.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 rounded-[18px] px-2.5 py-2 text-left"
        aria-expanded={open}
      >
        <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-muted))]">{title}</span>
        <span className="text-xs font-medium text-[hsl(var(--color-text))]">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="mt-1">
          <NavGroup items={items} currentHash={currentHash} onNavigate={onNavigate} />
        </div>
      ) : null}
    </div>
  );
}

export function StudioSidebar({
  mobileOpen,
  onOpenMobile,
  onCloseMobile,
  currentHash,
}: {
  mobileOpen: boolean;
  onOpenMobile: () => void;
  onCloseMobile: () => void;
  currentHash: string;
}) {
  const desktopContent = (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <BrandLogo href="/" variant="full" size="md" className="max-w-[190px]" disableLink />
        <div className="hidden md:block">
          <ToggleTheme />
        </div>
        <button
          type="button"
          onClick={onCloseMobile}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.52)] bg-[hsl(var(--color-surface-glass)/0.42)] text-[hsl(var(--color-text))] md:hidden"
          aria-label="Close navigation drawer"
        >
          <X className="h-4.5 w-4.5" />
        </button>
      </div>

      <div className="space-y-5 overflow-y-auto pr-1">
        <div>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-muted))]">Studio</p>
          <div className="mt-2">
            <NavGroup items={primaryItems} currentHash={currentHash} onNavigate={onCloseMobile} />
          </div>
        </div>
        <div>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-muted))]">Support</p>
          <div className="mt-2">
            <NavGroup items={supportItems} currentHash={currentHash} onNavigate={onCloseMobile} />
          </div>
        </div>
      </div>

      <div className="mt-auto rounded-[24px] border border-[hsl(var(--color-border)/0.52)] bg-[linear-gradient(180deg,hsl(var(--color-surface-glass-strong)/0.72),hsl(var(--color-surface-glass)/0.3))] p-4 shadow-[var(--shadow-soft)]">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-muted))]">Go live faster</p>
        <p className="mt-2 text-sm leading-6 text-[hsl(var(--color-text))]">
          Start with public inspiration, then move into text-to-video, image-to-video, and creator workflows.
        </p>
        <Link
          href="/signup"
          onClick={onCloseMobile}
          className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-[hsl(var(--color-text))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--color-bg))]"
        >
          Start free
        </Link>
      </div>
    </div>
  );

  const mobileContent = (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <BrandLogo href="/" variant="full" size="md" className="max-w-[178px]" disableLink />
        <div className="flex items-center gap-2">
          <ToggleTheme />
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.52)] bg-[hsl(var(--color-surface-glass)/0.42)] text-[hsl(var(--color-text))]"
            aria-label="Close navigation drawer"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>

      <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.46)] bg-[linear-gradient(180deg,hsl(var(--color-surface-glass-strong)/0.5),hsl(var(--color-surface-glass)/0.22))] p-4 shadow-[var(--shadow-soft)]">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-muted))]">Public studio</p>
        <p className="mt-2 text-sm leading-6 text-[hsl(var(--color-text))]">
          Browse inspiration, launch creation workflows, and move into the full studio when you are ready.
        </p>
        <div className="mt-4 flex gap-2">
          <Link
            href="/signup"
            onClick={onCloseMobile}
            className="inline-flex flex-1 items-center justify-center rounded-full bg-[hsl(var(--color-text))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--color-bg))]"
          >
            Start free
          </Link>
          <Link
            href="/login"
            onClick={onCloseMobile}
            className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.52)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--color-text))]"
          >
            Sign in
          </Link>
        </div>
      </div>

      <div className="space-y-3 overflow-y-auto pr-1">
        <CollapsibleNavSection title="Create" items={primaryItems} currentHash={currentHash} defaultOpen onNavigate={onCloseMobile} />
        <CollapsibleNavSection title="Support" items={supportItems} currentHash={currentHash} defaultOpen={false} onNavigate={onCloseMobile} />
      </div>
    </div>
  );

  return (
    <>
      <aside className="rangmanch-studio-rail hidden h-screen w-[var(--landing-rail-width)] shrink-0 flex-col p-4 xl:flex">
        {desktopContent}
      </aside>

      <div className="sticky top-0 z-50 flex items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4 xl:hidden">
        <button
          type="button"
          onClick={onOpenMobile}
          className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.52)] bg-[hsl(var(--color-surface-glass)/0.5)] text-[hsl(var(--color-text))] backdrop-blur-md"
          aria-label="Open navigation drawer"
        >
          <Menu className="h-5 w-5" />
        </button>
        <BrandLogo href="/" variant="full" size="md" className="max-w-[132px] sm:max-w-[180px]" />
        <div className="flex items-center gap-1.5 sm:gap-2">
          <ToggleTheme />
          <Link
            href="/login"
            className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.52)] bg-[hsl(var(--color-surface-glass)/0.52)] px-2.5 py-2 text-xs font-medium text-[hsl(var(--color-text))] backdrop-blur-md sm:px-3 sm:text-sm"
          >
            Sign in
          </Link>
        </div>
      </div>

      {mobileOpen ? (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation drawer"
            className="absolute inset-0 bg-[hsl(var(--color-bg)/0.78)] backdrop-blur-md"
          />
          <div className="absolute inset-y-0 left-0 w-[min(88vw,360px)] border-r border-[hsl(var(--color-border)/0.52)] bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.96),hsl(var(--color-surface)/0.84))] p-4 shadow-[var(--shadow-cinematic)]">
            {mobileContent}
          </div>
        </div>
      ) : null}
    </>
  );
}
