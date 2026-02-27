'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import type { Video } from '@/types/api';

type Props = {
  userId: string;
  videoId: string;
};

export function VideoDetailClient({ userId, videoId }: Props) {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

  const load = async () => {
    try {
      const current = await api.getVideo(videoId, userId);
      setVideo(current);
      setError(null);
    } catch {
      setError('Unable to load video status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [videoId, userId]);

  useEffect(() => {
    if (!video) return;
    if (video.status === 'completed' || video.status === 'failed') return;

    const interval = setInterval(() => {
      void load();
    }, 3000);

    return () => clearInterval(interval);
  }, [video?.status]);

  if (loading) {
    return (
      <Card className="flex items-center gap-2">
        <Spinner />
        <p className="text-sm text-muted">Loading video...</p>
      </Card>
    );
  }

  if (error || !video) {
    return (
      <Card>
        <p className="text-sm text-[hsl(var(--color-danger))]">{error ?? 'Video not found'}</p>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">{video.title || 'Untitled Video'}</h1>
        <p className="mt-1 text-sm text-muted">Status: {video.status}</p>
      </div>

      {video.status === 'processing' || video.status === 'draft' ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-2">
            <Spinner />
            <p className="text-sm text-muted">Processing your video... This page auto-refreshes every 3s.</p>
          </div>
          <div className="h-2 rounded-full bg-[hsl(var(--color-border))]">
            <div className="h-2 rounded-full bg-[hsl(var(--color-accent))]" style={{ width: `${video.progress}%` }} />
          </div>
          <p className="text-xs text-muted">Progress: {video.progress}%</p>
        </Card>
      ) : null}

      {video.status === 'completed' && video.output_url ? (
        <Card className="space-y-3">
          <video src={video.output_url} controls className="w-full rounded-[var(--radius-md)] border border-border" />
          <a href={video.output_url} target="_blank" rel="noreferrer">
            <Button>Download Video</Button>
          </a>
        </Card>
      ) : null}

      {video.status === 'failed' ? (
        <Card className="space-y-3">
          <p className="text-sm text-[hsl(var(--color-danger))]">{video.error_message || 'Video rendering failed.'}</p>
          <Button
            onClick={async () => {
              setRetrying(true);
              try {
                await api.retryVideo(video.id, userId);
                await load();
              } finally {
                setRetrying(false);
              }
            }}
            disabled={retrying}
          >
            {retrying ? 'Retrying...' : 'Retry'}
          </Button>
        </Card>
      ) : null}
    </div>
  );
}
