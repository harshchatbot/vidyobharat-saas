import { redirect } from 'next/navigation';

import { CreateAvatarClient } from '@/components/create/CreateAvatarClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateAvatarPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateAvatarClient userId={userId} />;
}
