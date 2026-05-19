'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';

import { LogoutButton } from '@/components/auth/LogoutButton';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

import { NotificationBell } from '@/components/notifications/NotificationBell';

const navLinks = [
  { href: '/create', label: 'Create' },
  { href: '/images', label: 'Images' },
  { href: '/videos', label: 'Videos' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/learning', label: 'Learn' },
];
const compactNavLinks = navLinks;

type TopNavProps = {
  userId: string | null;
  accountLabel: string | null;
  accountEmail?: string | null;
};

function getInitials(label: string | null) {
  if (!label) return 'U';
  const parts = label.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

export function TopNav({ userId, accountLabel, accountEmail }: TopNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [clientLoggedOut, setClientLoggedOut] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const effectiveUserId = clientLoggedOut ? null : userId;
  const effectiveAccountLabel = clientLoggedOut ? null : accountLabel;
  const effectiveAccountEmail = clientLoggedOut ? null : accountEmail;
  const initials = getInitials(effectiveAccountLabel);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    setClientLoggedOut(false);
  }, [userId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    const onNavigationStart = () => setOpen(false);
    window.addEventListener('rangmanch:navigation-start', onNavigationStart);
    return () => {
      window.removeEventListener('rangmanch:navigation-start', onNavigationStart);
    };
  }, []);

  useEffect(() => {
    const onLoggedOut = () => {
      setOpen(false);
      setClientLoggedOut(true);
    };
    window.addEventListener('rangmanch:logged-out', onLoggedOut);
    return () => {
      window.removeEventListener('rangmanch:logged-out', onLoggedOut);
    };
  }, []);

  return (
    <div ref={menuRef}>
      <div className="border-b border-[hsl(var(--color-border)/0.6)] px-1 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push('/');
              }}
              className="inline-flex"
              aria-label="Go to landing page"
            >
              <BrandLogo disableLink variant="full" size="md" className="max-w-[240px] sm:max-w-[290px]" />
            </button>
            <span className="hidden h-6 w-px bg-[hsl(var(--color-border))] lg:block" />
          </div>

          <nav className="hidden items-center gap-1 lg:flex">
            {compactNavLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="whitespace-nowrap px-3 py-1 text-sm text-[hsl(var(--color-muted))] transition hover:text-[hsl(var(--color-text))]"
              >
                {link.label}
              </Link>
            ))}
            {navLinks.slice(compactNavLinks.length).map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="hidden whitespace-nowrap px-3 py-1 text-sm text-[hsl(var(--color-muted))] transition hover:text-[hsl(var(--color-text))] xl:inline-flex"
              >
                {link.label}
              </Link>
            ))}

            {!effectiveUserId && (
              <>
                <Link href="/login" className="ml-2 inline-flex items-center gap-1 rounded-[12px] border border-[hsl(var(--color-border))] px-3 py-1.5 text-sm font-semibold text-[hsl(var(--color-text))]">
                  Sign in
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </>
            )}

            {effectiveUserId && (
              <>
                <Link
                  href="/dashboard"
                  className="ml-2 inline-flex items-center gap-2 rounded-[12px] border border-[hsl(var(--color-border))] px-2.5 py-1 text-sm font-medium text-[hsl(var(--color-text))]"
                  title={effectiveUserId}
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-xs font-bold text-[hsl(var(--color-accent-contrast))]">
                    {initials}
                  </span>
                  <span className="max-w-[180px] truncate text-xs text-[hsl(var(--color-muted))] sm:text-sm">
                    {effectiveAccountEmail ?? effectiveAccountLabel ?? 'Account'}
                  </span>
                </Link>
                <LogoutButton
                  className="rounded-[12px] border border-[hsl(var(--color-border))] px-3 py-1 text-sm font-medium text-[hsl(var(--color-text))] disabled:opacity-70"
                  onBeforeNavigate={() => setOpen(false)}
                  icon="none"
                />
              </>
            )}

          </nav>

          <div className="flex items-center gap-2">
            {effectiveUserId && <NotificationBell userId={effectiveUserId} />}
            <ToggleTheme />
            <div className="lg:hidden">
              <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                className="rounded-[12px] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]"
                aria-expanded={open}
                aria-label="Toggle menu"
              >
                Menu
              </button>
            </div>
          </div>
        </div>
      </div>

      {open && (
        <div className="mt-3 grid gap-2 border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.82)] p-3 lg:hidden">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="rounded-[var(--radius-md)] px-2 py-1 text-sm text-[hsl(var(--color-text))]" onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}

          {!effectiveUserId && (
            <div className="mt-1 flex gap-2">
              <Link href="/login" className="inline-flex items-center gap-1 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]" onClick={() => setOpen(false)}>
                Sign in <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          )}

          {effectiveUserId && (
            <div className="mt-1 flex gap-2">
              <Link href="/dashboard" className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))]" onClick={() => setOpen(false)}>
                {effectiveAccountEmail ?? 'Account'}
              </Link>
              <LogoutButton
                className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-sm text-[hsl(var(--color-text))] disabled:opacity-70"
                onBeforeNavigate={() => setOpen(false)}
                icon="none"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
