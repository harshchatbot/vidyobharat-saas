import { redirect } from 'next/navigation';

import { VideoDetailClient } from '@/components/videos/VideoDetailClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const { id } = await params;
  return <VideoDetailClient userId={userId} videoId={id} />;
}
