import { redirect } from 'next/navigation';

import { getUserIdFromCookie } from '@/lib/session';

export default async function DashboardPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  redirect('/create');
}
