'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { Render } from '@/types/api';

type Props = {
  renderId: string;
  userId: string;
};

export function RenderStatusClient({ renderId, userId }: Props) {
  const [render, setRender] = useState<Render | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        const next = await api.getRender(renderId, userId);
        if (cancelled) return;
        setRender(next);
        setError(null);
      } catch {
        if (!cancelled) {
          setError('Unable to load render status.');
        }
      }
    };

    void run();
    const interval = setInterval(() => {
      void run();
    }, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [renderId, userId]);

  if (error) {
    return <Card><p className="text-sm text-[hsl(var(--color-danger))]">{error}</p></Card>;
  }

  if (!render) {
    return (
      <Card className="flex items-center gap-2">
        <Spinner />
        <p className="text-sm text-muted">Loading render status...</p>
      </Card>
    );
  }

  const completed = render.status === 'completed' && render.video_url;

  return (
    <div className="grid gap-4">
      <Card>
        <p className="text-sm text-muted">Render ID</p>
        <p className="font-semibold text-text">{render.id}</p>
        <p className="mt-2 text-sm text-muted">Status: <span className="font-semibold text-text">{render.status}</span></p>
        <div className="mt-3 h-2 rounded-full bg-[hsl(var(--color-border))]">
          <div className="h-2 rounded-full bg-[hsl(var(--color-accent))] transition-all" style={{ width: `${render.progress}%` }} />
        </div>
        <p className="mt-2 text-sm text-muted">Progress: {render.progress}%</p>
      </Card>

      {completed ? (
        <Card>
          <h2 className="font-heading text-xl font-bold text-text">Video Ready</h2>
          <video src={render.video_url ?? undefined} controls className="mt-3 w-full rounded-[var(--radius-md)] border border-border" />
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={render.video_url ?? '#'} target="_blank" rel="noreferrer"><Button>Download</Button></a>
            <a href={render.video_url ?? '#'} target="_blank" rel="noreferrer"><Button variant="secondary">Share URL</Button></a>
            <Link href="/dashboard"><Button variant="ghost">Back to Dashboard</Button></Link>
          </div>
        </Card>
      ) : (
        <Card className="flex items-center gap-2">
          <Spinner />
          <p className="text-sm text-muted">Rendering in progress. This page auto-refreshes every 2 seconds.</p>
        </Card>
      )}
    </div>
  );
}
