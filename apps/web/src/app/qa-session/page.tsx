'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

type SessionStatus = 'booting' | 'ready' | 'failed';

function QASessionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<SessionStatus>('booting');
  const [message, setMessage] = useState('Preparing a local QA session…');

  const payload = useMemo(() => {
    const userId = searchParams.get('userId')?.trim() || '';
    const accessToken = searchParams.get('accessToken')?.trim() || '';
    const name = searchParams.get('name')?.trim() || 'QA Browser User';
    const email = searchParams.get('email')?.trim() || '';
    const next = searchParams.get('next')?.trim() || '/create';

    return {
      userId,
      accessToken,
      name,
      email,
      next,
    };
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (typeof window === 'undefined') return;

      if (!payload.userId || !payload.accessToken) {
        setStatus('failed');
        setMessage('Missing QA session parameters.');
        return;
      }

      try {
        const response = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: payload.userId,
            accessToken: payload.accessToken,
            name: payload.name,
            email: payload.email || undefined,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(body || 'Failed to persist QA session');
        }

        window.localStorage.setItem('vidyo_user_id', payload.userId);
        window.localStorage.setItem('vidyo_access_token', payload.accessToken);

        if (cancelled) return;

        setStatus('ready');
        setMessage('Session ready. Opening the studio…');

        router.replace(payload.next);
      } catch (error) {
        if (cancelled) return;

        setStatus('failed');
        setMessage(
          error instanceof Error
            ? error.message
            : 'Could not start the QA session.',
        );
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [payload, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-[hsl(var(--color-bg))] px-6 py-12 text-[hsl(var(--color-text))]">
      <div className="w-full max-w-md rounded-[28px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.96)] p-8 shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[hsl(var(--color-accent))]">
          QA Session
        </p>

        <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
          {status === 'failed'
            ? 'Session failed'
            : 'Bootstrapping session'}
        </h1>

        <p className="mt-4 text-sm leading-6 text-muted">
          {message}
        </p>
      </div>
    </main>
  );
}

export default function QASessionPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-muted">Loading QA session…</p>
        </main>
      }
    >
      <QASessionContent />
    </Suspense>
  );
}