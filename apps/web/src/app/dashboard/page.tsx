import { redirect } from 'next/navigation';

import { DashboardVideosClient } from '@/components/videos/DashboardVideosClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function DashboardPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <DashboardVideosClient userId={userId} />;
}
