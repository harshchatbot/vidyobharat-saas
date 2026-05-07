import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PublicInspirationFeed } from '@/components/community/PublicInspirationFeed';
import { buildMetadata } from '@/lib/seo';
import { getUserIdFromCookie } from '@/lib/session';

export const metadata: Metadata = buildMetadata({
  title: 'AI Video Generation Showcase and Inspiration Gallery',
  description:
    'Browse public AI videos created with RangManch, including prompts, model details, and creator-ready outputs like ads, reels, and anime videos.',
  path: '/videos',
  keywords: [
    'AI video generation',
    'AI video gallery',
    'AI video prompts',
    'public AI videos',
    'India AI video platform',
  ],
});

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
