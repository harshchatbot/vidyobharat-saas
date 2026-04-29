import { redirect } from 'next/navigation';

import { UnifiedCreateStudioClient } from '@/components/create/UnifiedCreateStudioClient';
import { api } from '@/lib/api';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreatePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const settings = await api.getMySettings(userId).catch(() => null);

  return (
    <UnifiedCreateStudioClient
      userId={userId}
      initialDefaultAspectRatio={settings?.default_aspect_ratio ?? null}
    />
  );
}
