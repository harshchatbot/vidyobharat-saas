import { redirect } from 'next/navigation';

import { TemplatesBrowserClient } from '@/components/templates/TemplatesBrowserClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const userId = await getUserIdFromCookie();
  if (!userId) redirect('/login');
  const params = await searchParams;
  return <TemplatesBrowserClient userId={userId} initialProjectId={params.projectId} />;
}
