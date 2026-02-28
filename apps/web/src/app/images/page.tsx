import { redirect } from 'next/navigation';

import { ImageStudioClient } from '@/components/images/ImageStudioClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function ImagesPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <ImageStudioClient userId={userId} />;
}
