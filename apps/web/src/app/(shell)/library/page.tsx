import { redirect } from 'next/navigation';

import { VideoLibraryClient } from '@/components/videos/VideoLibraryClient';
import { api } from '@/lib/api';
import { getUserIdFromCookie } from '@/lib/session';

export default async function LibraryPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const [videos, images] = await Promise.all([
    api.listVideos(userId, 50, 45_000).catch(() => []),
    api.listGeneratedImages(userId, 50).catch(() => []),
  ]);

  return <VideoLibraryClient userId={userId} initialVideos={videos} initialImages={images} />;
}
