import { PropsWithChildren } from 'react';

import { TopNav } from '@/components/layout/TopNav';
import { getUserIdFromCookie } from '@/lib/session';

export async function AppShell({ children }: PropsWithChildren) {
  const userId = await getUserIdFromCookie();
  const accountLabel = userId ? `U${userId.slice(0, 4).toUpperCase()}` : null;

  return (
    <div className="min-h-screen bg-[hsl(var(--color-bg))]">
      <header className="sticky top-0 z-50 border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.92)] backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 pt-3 sm:px-6 sm:pt-4">
          <TopNav userId={userId} accountLabel={accountLabel} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-6">{children}</main>
    </div>
  );
}
