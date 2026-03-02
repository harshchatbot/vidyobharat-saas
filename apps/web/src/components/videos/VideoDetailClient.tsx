'use client';

import { useEffect, useState } from 'react';
import { AudioLines, CheckCircle2, Clapperboard, Sparkles, Tag, Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
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

function getStage(progress: number, status: Video['status']) {
  if (status === 'draft') {
    return {
      label: 'Queueing render',
      detail: 'Preparing scenes, assets, and voice instructions.',
    };
  }
  if (progress < 35) {
    return {
      label: 'Building scenes',
      detail: 'Arranging layouts, images, and aspect ratio.',
    };
  }
  if (progress < 70) {
    return {
      label: 'Generating voice and captions',
      detail: 'Creating narration, timing visuals, and burn-in text.',
    };
  }
  return {
    label: 'Mixing final video',
    detail: 'Encoding music, transitions, and final export.',
  };
}

export function VideoDetailClient({ userId, videoId }: Props) {
  const [video, setVideo] = useState<Video | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [manualTags, setManualTags] = useState('');

  const load = async () => {
    try {
      const current = await api.getVideo(videoId, userId);
      setVideo(current);
      setManualTags(current.user_tags.join(', '));
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
    const safeName = (video.title || 'video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'video';
    const link = document.createElement('a');
    link.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${safeName}.mp4`)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => setDownloading(false), 600);
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

  const stage = getStage(video.progress, video.status);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">{video.title || 'Untitled Video'}</h1>
        <p className="mt-1 text-sm text-muted">Status: {video.status}</p>
      </div>

      {video.status === 'processing' || video.status === 'draft' ? (
        <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-5 py-8 shadow-soft sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute inset-x-10 top-0 h-40 rounded-full bg-[hsl(var(--color-accent)/0.18)] blur-3xl" />
          <div className="relative mx-auto flex min-h-[65vh] max-w-2xl flex-col items-center justify-center text-center">
            <div className="relative mb-6 flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
              <div className="absolute inset-0 animate-pulse rounded-full border border-[hsl(var(--color-accent)/0.25)] bg-[radial-gradient(circle_at_center,hsl(var(--color-accent)/0.25),transparent_70%)]" />
              <div className="absolute inset-3 rounded-full border border-[hsl(var(--color-accent)/0.4)]" />
              <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-[hsl(var(--color-bg))] shadow-soft sm:h-24 sm:w-24">
                <Spinner />
              </div>
            </div>

            <p className="font-heading text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{stage.label}</p>
            <p className="mt-2 max-w-xl text-sm text-muted sm:text-base">{stage.detail}</p>

            <div className="mt-6 w-full max-w-xl">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted">Render progress</span>
                <span className="font-semibold text-text">{video.progress}%</span>
              </div>
              <div className="mt-2 h-3 overflow-hidden rounded-full bg-[hsl(var(--color-border))]">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--color-accent)),hsl(var(--color-accent)/0.72))] transition-[width] duration-700 ease-out"
                  style={{ width: `${video.progress}%` }}
                />
              </div>
            </div>

            <div className="mt-8 grid w-full max-w-2xl gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] p-4 text-left">
                <Clapperboard className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                <p className="mt-3 text-sm font-semibold text-text">Scenes</p>
                <p className="mt-1 text-xs text-muted">Layouts and image sequencing are being assembled.</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] p-4 text-left">
                <AudioLines className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                <p className="mt-3 text-sm font-semibold text-text">Narration</p>
                <p className="mt-1 text-xs text-muted">Voiceover, music balance, and audio timing are processing.</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] p-4 text-left">
                <Wand2 className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                <p className="mt-3 text-sm font-semibold text-text">Final output</p>
                <p className="mt-1 text-xs text-muted">Captions, overlays, and export are being finalized.</p>
              </div>
            </div>

            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.75)] px-4 py-2 text-xs text-muted">
              <Sparkles className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              Auto-refreshing every 3 seconds until your render completes
            </div>
          </div>
        </section>
      ) : null}

      {video.status === 'completed' && video.output_url ? (
        <Card className="space-y-3">
          <div className="flex items-center gap-2 text-sm text-[hsl(var(--color-success))]">
            <CheckCircle2 className="h-4 w-4" />
            Video ready
          </div>
          <video src={toAbsoluteUrl(video.output_url) ?? undefined} controls className="w-full rounded-[var(--radius-md)] border border-border" />
          <Button onClick={() => void downloadVideo()} disabled={downloading}>
            {downloading ? 'Downloading...' : 'Download Video'}
          </Button>
        </Card>
      ) : null}

      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <Tag className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          <p className="text-sm font-semibold text-text">Asset metadata</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Auto tags</p>
            <div className="flex flex-wrap gap-2">
              {video.auto_tags.length > 0 ? video.auto_tags.map((tag) => <Badge key={`video-auto-${tag}`}>{tag}</Badge>) : <span className="text-xs text-muted">No auto tags yet</span>}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">User tags</p>
            <div className="flex flex-wrap gap-2">
              {video.user_tags.length > 0 ? video.user_tags.map((tag) => <Badge key={`video-user-${tag}`}>{tag}</Badge>) : <span className="text-xs text-muted">No user tags yet</span>}
            </div>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={manualTags}
            onChange={(event) => setManualTags(event.target.value)}
            placeholder="Add comma separated tags"
            className="w-full rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
          />
          <Button
            variant="secondary"
            onClick={async () => {
              try {
                const response = await api.updateAssetTags(
                  'video',
                  video.id,
                  manualTags
                    .split(',')
                    .map((item) => item.trim().toLowerCase())
                    .filter(Boolean),
                  userId,
                );
                setVideo((current) => (current ? { ...current, auto_tags: response.auto_tags, user_tags: response.user_tags } : current));
                setManualTags(response.user_tags.join(', '));
              } catch {
                setError('Could not update video tags right now.');
              }
            }}
          >
            Save tags
          </Button>
        </div>
      </Card>

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
