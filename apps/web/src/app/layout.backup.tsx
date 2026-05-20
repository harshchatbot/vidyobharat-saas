import type { Metadata, Viewport } from 'next';

import { ThemeBoot } from '@/components/ui/ThemeBoot';
import { ToastProvider } from '@/components/ui/Toast';
import { getSiteUrl } from '@/lib/seo';

import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: 'RangManch AI',
    template: '%s | RangManch AI',
  },
  description: 'AI video generation and AI image generation platform for India-first creators, brands, educators, and marketers.',
  applicationName: 'RangManch AI',
  keywords: [
    'AI video generation',
    'AI image generation',
    'AI video platform India',
    'India-first AI creator platform',
    'anime lofi reel generator',
    'UGC ad generator',
  ],
  icons: {
    icon: '/brand/logo-mark-light.svg',
  },
  openGraph: {
    type: 'website',
    url: getSiteUrl(),
    siteName: 'RangManch AI',
    title: 'RangManch AI',
    description: 'AI video generation and AI image generation platform for India-first creators, brands, educators, and marketers.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RangManch AI',
    description: 'AI video generation and AI image generation platform for India-first creators, brands, educators, and marketers.',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/brand/logo-mark-light.svg" data-rangmanch-favicon />
      </head>
      <body>
        <ToastProvider>
          <ThemeBoot />
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
