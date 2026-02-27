import type { Metadata } from 'next';

import { AppShell } from '@/components/layout/AppShell';
import { ToastProvider } from '@/components/ui/Toast';

import './globals.css';

export const metadata: Metadata = {
  title: 'RangManch AI',
  description: 'Hybrid text-to-video SaaS for India-first creators',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ToastProvider>
          <AppShell>{children}</AppShell>
        </ToastProvider>
      </body>
    </html>
  );
}
