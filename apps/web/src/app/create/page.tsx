import { redirect } from 'next/navigation';

import { CreateVideoClient } from '@/components/videos/CreateVideoClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ template?: string }> }) {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const params = await searchParams;
  return <CreateVideoClient userId={userId} templateKey={params.template} />;
}
