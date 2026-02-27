import { PropsWithChildren } from 'react';

import { AppFrame } from '@/components/layout/AppFrame';
import { getUserIdFromCookie } from '@/lib/session';

export async function AppShell({ children }: PropsWithChildren) {
  const userId = await getUserIdFromCookie();
  const accountLabel = userId ? `U${userId.slice(0, 4).toUpperCase()}` : null;

  return <AppFrame userId={userId} accountLabel={accountLabel}>{children}</AppFrame>;
}
