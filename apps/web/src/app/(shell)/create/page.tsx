import { redirect } from 'next/navigation';

import { UnifiedCreateStudioClient } from '@/components/create/UnifiedCreateStudioClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreatePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return (
    <UnifiedCreateStudioClient
      userId={userId}
      initialDefaultAspectRatio={null}
    />
  );
}
