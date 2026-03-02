import { redirect } from 'next/navigation';

import { InfluencerStudioClient } from '@/components/influencer/InfluencerStudioClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function InfluencerPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <InfluencerStudioClient userId={userId} />;
}
