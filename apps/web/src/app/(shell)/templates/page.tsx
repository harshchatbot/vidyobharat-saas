import { redirect } from 'next/navigation';

import { TemplatesBrowserClient } from '@/components/templates/TemplatesBrowserClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function TemplatesPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) redirect('/login');
  return <TemplatesBrowserClient userId={userId} />;
}
