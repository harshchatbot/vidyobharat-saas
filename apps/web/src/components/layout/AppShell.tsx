import { PropsWithChildren } from 'react';

import { AppFrame } from '@/components/layout/AppFrame';
import { getUserAvatarFromCookie, getUserEmailFromCookie, getUserIdFromCookie, getUserNameFromCookie } from '@/lib/session';

export async function AppShell({ children }: PropsWithChildren) {
  const userId = await getUserIdFromCookie();
  const userName = await getUserNameFromCookie();
  const userEmail = await getUserEmailFromCookie();
  const userAvatar = await getUserAvatarFromCookie();
  const accountLabel = userName ?? (userId ? `U${userId.slice(0, 4).toUpperCase()}` : null);

  return <AppFrame userId={userId} accountLabel={accountLabel} accountEmail={userEmail} accountAvatar={userAvatar}>{children}</AppFrame>;
}
