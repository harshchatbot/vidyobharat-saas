import type { Metadata } from 'next';

import PricingPageClient from '@/components/pricing/PricingPageClient';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Pricing and Credits for AI Video and AI Image Generation',
  description:
    'See RangManch pricing, monthly free credits, activation bonus credits, and top-up plans for AI videos, AI images, avatar ads, and anime reels.',
  path: '/pricing',
  keywords: [
    'AI video pricing',
    'AI image pricing',
    'RangManch pricing',
    'AI creator credits',
    'India AI SaaS pricing',
  ],
});

export default function PricingPage() {
  return <PricingPageClient />;
}
