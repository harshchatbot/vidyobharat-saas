import { redirect } from 'next/navigation';

import { CreateTemplateScriptClient } from '@/components/videos/CreateTemplateScriptClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreateTemplatePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CreateTemplateScriptClient userId={userId} />;
}
