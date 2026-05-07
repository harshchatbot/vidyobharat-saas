import type { MetadataRoute } from 'next';

import { getSiteUrl } from '@/lib/seo';

const publicRoutes = [
  '/',
  '/images',
  '/videos',
  '/pricing',
  '/learning',
  '/sarvam-ai-voiceovers',
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const siteUrl = getSiteUrl();

  return publicRoutes.map((path) => ({
    url: `${siteUrl}${path}`,
    lastModified: now,
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : path === '/images' || path === '/videos' ? 0.9 : 0.7,
  }));
}
