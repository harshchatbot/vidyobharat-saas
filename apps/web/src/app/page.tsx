import type { Metadata } from 'next';

import { PublicStudioLanding } from '@/components/landing/PublicStudioLanding';
import { buildMetadata } from '@/lib/seo';

export const dynamic = 'force-static';

export const metadata: Metadata = buildMetadata({
  title: 'Create Stunning Videos with AI — Free',
  description:
    'Turn your photos into beautiful Instagram Reels with AI-powered editing, music, transitions, and text. Edit in your browser with RangManch AI.',
  path: '/',
  keywords: [
    'online video editor',
    'free AI video editor',
    'photo to video maker',
    'reel maker online',
    'create reels from photos',
    'browser based video editor',
    'online slideshow maker',
    'RangManch AI',
  ],
});

export default function LandingPage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': 'https://techfilabs.com/#organization',
        name: 'TechFi Labs',
        url: 'https://techfilabs.com/',
      },
      {
        '@type': 'SoftwareApplication',
        '@id': 'https://rangmanchai.com/#application',
        name: 'RangManch AI',
        url: 'https://rangmanchai.com/',
        applicationCategory: 'MultimediaApplication',
        operatingSystem: 'Web',
        description:
          'RangManch AI is a browser-based video editor for creating reels and videos from photos and video clips.',
        creator: {
          '@id': 'https://techfilabs.com/#organization',
        },
        featureList: [
          'Local browser-based AI editing',
          'Photo and video uploads',
          'Visual timeline editing',
          'Text and audio editing',
          'Video filters and effects',
          'MP4 video export',
        ],
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, '\\u003c'),
        }}
      />
      <PublicStudioLanding />
    </>
  );
}
