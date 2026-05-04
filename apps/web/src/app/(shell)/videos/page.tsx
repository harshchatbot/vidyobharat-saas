import { redirect } from 'next/navigation';

import { PublicInspirationFeed } from '@/components/community/PublicInspirationFeed';
import { getUserIdFromCookie } from '@/lib/session';

export default async function VideosPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    return (
      <PublicInspirationFeed
        scope="video"
        eyebrow="Public videos"
        title="Browse public inspiration videos from RangManch"
        description="Watch the kinds of short videos, avatar ads, anime reels, and experiments creators are already publishing from this platform."
        ctaHref="/signup"
        ctaLabel="Create your own videos"
      />
    );
  }

  redirect('/library');
}
