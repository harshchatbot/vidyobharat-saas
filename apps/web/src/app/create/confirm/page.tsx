import { redirect } from 'next/navigation';

import { CreateConfirmClient } from '@/components/create/CreateConfirmClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateConfirmPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateConfirmClient userId={userId} />;
}
