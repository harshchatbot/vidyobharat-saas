import { redirect } from 'next/navigation';

import { CreateChooseClient } from '@/components/create/CreateChooseClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateChoosePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateChooseClient />;
}
