import type { Metadata } from 'next';

import { AppShell } from '@/components/layout/AppShell';
import { ThemeBoot } from '@/components/ui/ThemeBoot';
import { ToastProvider } from '@/components/ui/Toast';

import './globals.css';

export const metadata: Metadata = {
  title: 'RangManch AI',
  description: 'Hybrid text-to-video SaaS for India-first creators',
  icons: {
    icon: '/brand/logo-mark-light.svg',
  },
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
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
