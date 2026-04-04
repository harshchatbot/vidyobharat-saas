import { redirect } from 'next/navigation';

import { CommunityPageClient } from '@/components/community/CommunityPageClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CommunityPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <CommunityPageClient userId={userId} />;
}
