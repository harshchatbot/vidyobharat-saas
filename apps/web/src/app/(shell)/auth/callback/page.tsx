'use client';

import Link from 'next/link';

import { Card } from '@/components/ui/Card';

export default function AuthCallbackPage() {
  return (
    <div className="mx-auto max-w-md py-10">
      <Card>
        <div className="space-y-3">
          <h1 className="text-lg font-semibold text-[hsl(var(--color-text))]">Authentication flow updated</h1>
          <p className="text-sm text-[hsl(var(--color-muted))]">
            Google sign-in now completes directly from the login and signup forms. If you reached this page from an old
            bookmark or provider redirect, start again from the login screen.
          </p>
          <Link
            href="/login"
            className="inline-flex rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-medium text-[hsl(var(--color-accent-contrast))]"
          >
            Go to Login
          </Link>
        </div>
      </Card>
    </div>
  );
}
