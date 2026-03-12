import { redirect } from 'next/navigation';

import { ImageStudioClient } from '@/components/images/ImageStudioClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function ImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const params = await searchParams;
  return <ImageStudioClient userId={userId} initialProjectId={params.projectId} />;
}
