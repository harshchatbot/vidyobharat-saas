import { redirect } from 'next/navigation';

import { CreateTemplateClient } from '@/components/create/CreateTemplateClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateTemplatePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateTemplateClient userId={userId} />;
}
