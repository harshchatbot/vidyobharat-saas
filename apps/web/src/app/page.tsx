import type { Metadata } from 'next';

import { PublicStudioLanding } from '@/components/landing/PublicStudioLanding';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-static';

export const metadata: Metadata = buildMetadata({
  title: 'Create Beautiful Reels from Your Photos and Videos',
  description:
    'Upload your photos and videos, arrange your story, and create a beautiful vertical reel with RangManch AI.',
  path: '/',
  keywords: [
    'online reel editor',
    'photo video editor',
    'vertical video editor',
    'create reels online',
    'RangManch AI editor',
  ],
});

export default function LandingPage() {
  return <PublicStudioLanding />;
}
