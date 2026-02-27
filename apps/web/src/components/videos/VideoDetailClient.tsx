'use client';

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { Video } from '@/types/api';

type Props = {
  userId: string;
  videoId: string;
};

function toAbsoluteUrl(url: string | null) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

export function VideoDetailClient({ userId, videoId }: Props) {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [downloading, setDownloading] = useState(false);

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

  const downloadVideo = async () => {
    if (!video) return;
    const url = toAbsoluteUrl(video.output_url);
    if (!url) return;

    setDownloading(true);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeName = (video.title || 'video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
      link.download = `${safeName || 'video'}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setError('Download failed. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

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
          <video src={toAbsoluteUrl(video.output_url) ?? undefined} controls className="w-full rounded-[var(--radius-md)] border border-border" />
          <Button onClick={() => void downloadVideo()} disabled={downloading}>
            {downloading ? 'Downloading...' : 'Download Video'}
          </Button>
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
