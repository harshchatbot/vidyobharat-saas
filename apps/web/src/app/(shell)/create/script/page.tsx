import { redirect } from 'next/navigation';

import { CreateScriptClient } from '@/components/create/CreateScriptClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateScriptPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateScriptClient />;
}
