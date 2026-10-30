'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { LogoutButton } from '@/components/auth/LogoutButton';
import { TopNav } from '@/components/layout/TopNav';

type Props = {
  userId: string | null;
  accountLabel: string | null;
  accountEmail: string | null;
  accountAvatar?: string | null;
  children: React.ReactNode;
};

export function AppFrame({ userId, accountLabel, accountEmail, accountAvatar, children }: Props) {
  const pathname = usePathname();
  const immersive = pathname.startsWith('/editor') || pathname.startsWith('/admin');
  return (
    <div className="min-h-screen bg-bg text-text">
      {!immersive ? <TopNav userId={userId} accountLabel={accountLabel} accountEmail={accountEmail} /> : null}
      {immersive ? (
        <header className="flex items-center justify-between border-b border-border bg-surface/80 px-4 py-3 backdrop-blur sm:px-6">
          <Link href={userId ? '/dashboard' : '/'} aria-label="RangManch AI home"><BrandLogo variant="full" size="sm" /></Link>
          <div className="flex items-center gap-3 text-sm">
            {userId ? <><Link href="/dashboard" className="text-muted hover:text-text">My Studio</Link><span className="hidden text-muted sm:inline">{accountEmail ?? accountLabel ?? 'Account'}</span><LogoutButton icon="none" className="rounded-lg border border-border px-3 py-1.5 text-text" /></> : <Link href={`/login?next=${encodeURIComponent(pathname || '/editor')}`} className="rounded-lg bg-primary px-3 py-1.5 font-medium text-primary-contrast">Sign in</Link>}
          </div>
        </header>
      ) : null}
      {children}
    </div>
  );
}
