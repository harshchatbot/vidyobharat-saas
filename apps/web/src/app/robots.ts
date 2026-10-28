import type { MetadataRoute } from 'next';

const SITE_URL = 'https://rangmanchai.com';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/dashboard',
        '/settings',
        '/billing',
        '/library',
        '/projects',
        '/profile',
        '/create-ai-video',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}