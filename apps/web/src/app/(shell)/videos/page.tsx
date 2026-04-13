import { redirect } from 'next/navigation';

import { getUserIdFromCookie } from '@/lib/session';

export default async function VideosPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  redirect('/library');
}
