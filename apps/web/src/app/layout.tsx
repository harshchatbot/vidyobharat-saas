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
  description: 'RangManch AI is a free browser-first video editor for creating beautiful Instagram Reels and short videos from your photos.',
  applicationName: 'RangManch AI',
  keywords: [
    'free AI video editor',
    'Instagram Reel maker',
    'browser video editor',
    'photo slideshow maker',
  ],
  icons: {
    icon: '/brand/logo-mark-light.svg',
  },
  openGraph: {
    type: 'website',
    url: getSiteUrl(),
    siteName: 'RangManch AI',
    title: 'RangManch AI',
    description: 'Create beautiful Instagram Reels and short videos in a browser-first AI editor.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RangManch AI',
    description: 'Create beautiful Instagram Reels and short videos in a browser-first AI editor.',
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
