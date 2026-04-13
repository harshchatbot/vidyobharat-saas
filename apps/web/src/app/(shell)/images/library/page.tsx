import { redirect } from 'next/navigation';

import { ImageLibraryClient } from '@/components/images/ImageLibraryClient';
import { api } from '@/lib/api';
import { getUserIdFromCookie } from '@/lib/session';

export default async function ImageLibraryPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const images = await api.listGeneratedImages(userId, 50).catch(() => []);

  return <ImageLibraryClient userId={userId} initialImages={images} />;
}
