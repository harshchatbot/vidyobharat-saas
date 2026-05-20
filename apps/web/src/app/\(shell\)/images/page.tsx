import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { PublicInspirationFeed } from '@/components/community/PublicInspirationFeed';
import { buildMetadata } from '@/lib/seo';
import { getUserIdFromCookie } from '@/lib/session';

export const metadata: Metadata = buildMetadata({
  title: 'AI Image Generation Showcase and Inspiration Gallery',
  description:
    'Browse public AI images created with RangManch, including prompts, model details, and polished inspiration from the platform.',
  path: '/images',
  keywords: [
    'AI image generation',
    'AI image gallery',
    'AI image prompts',
    'public AI images',
    'India AI image platform',
  ],
});

export default async function ImagesPage() {
  const userId = await getUserIdFromCookie();

  // Logged-in users go to /create (unified creation hub)
  if (userId) {
    redirect('/create');
  }

  // Unauthenticated users see the public gallery
  return (
    <PublicInspirationFeed
      scope="image"
      eyebrow="Public images"
      title="Browse public inspiration images from RangManch"
      description="See the styles, prompts, and quality creators are already publishing on the platform. No account is needed to explore."
      ctaHref="/signup"
      ctaLabel="Create your own images"
    />
  );
}
