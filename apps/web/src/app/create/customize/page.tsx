import { redirect } from 'next/navigation';

import { CreateCustomizeClient } from '@/components/create/CreateCustomizeClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateCustomizePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateCustomizeClient />;
}
