import type { Metadata } from 'next';

import { PublicStudioLanding } from '@/components/landing/PublicStudioLanding';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-static';

export const metadata: Metadata = buildMetadata({
  title: 'AI Video Generation and AI Image Generation for India-First Creators',
  description:
    'Create AI videos, AI images, avatar product ads, and anime lofi reels with a guided India-first creator workflow built for fast production.',
  path: '/',
  keywords: [
    'AI video generation India',
    'AI image generation India',
    'AI SaaS platform India',
    'avatar product ad generator',
    'anime lofi reel generator',
    'AI creator platform',
  ],
});

export default function LandingPage() {
  return <PublicStudioLanding />;
}
