import { redirect } from 'next/navigation';

import { DashboardVideosClient } from '@/components/videos/DashboardVideosClient';
import { getUserIdFromCookie, getUserNameFromCookie } from '@/lib/session';

export default async function DashboardPage() {
  const userId = await getUserIdFromCookie();
  const userName = await getUserNameFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <DashboardVideosClient userId={userId} userName={userName ?? 'User'} />;
}
