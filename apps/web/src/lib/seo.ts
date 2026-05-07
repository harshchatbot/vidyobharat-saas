import type { Metadata } from 'next';

const SITE_URL = 'https://www.rangmanchai.com';
const SITE_NAME = 'RangManch AI';

type SeoConfig = {
  title: string;
  description: string;
  path?: string;
  keywords?: string[];
};

export function getSiteUrl() {
  return SITE_URL;
}

export function buildMetadata({ title, description, path = '/', keywords = [] }: SeoConfig): Metadata {
  const absoluteUrl = new URL(path, SITE_URL).toString();
  const socialTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: path,
    },
    openGraph: {
      type: 'website',
      url: absoluteUrl,
      title: socialTitle,
      description,
      siteName: SITE_NAME,
    },
    twitter: {
      card: 'summary_large_image',
      title: socialTitle,
      description,
    },
  };
}
