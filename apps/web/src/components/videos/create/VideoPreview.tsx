import { useState } from 'react';
import { Download, RefreshCcw, Sparkles, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

import { API_URL } from '@/lib/env';
import type { Video } from '@/types/api';

function toAbsoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  return url.startsWith('http://') || url.startsWith('https://') ? url : `${API_URL}${url}`;
}

export function VideoPreview({
  job,
  loading,
  error,
  onRetry,
}: {
  job: Video | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const videoUrl = toAbsoluteUrl(job?.output_url);
  const thumbnailUrl = toAbsoluteUrl(job?.thumbnail_url);
  const isProcessing = job && job.status !== 'completed' && job.status !== 'failed';
  const isPortrait = (job?.aspect_ratio || '').trim() === '9:16';
  const frameWidthClass = isPortrait
    ? 'max-w-[260px] sm:max-w-[300px]'
    : 'max-w-[430px] sm:max-w-[500px]';
  const allTags = [...(job?.auto_tags ?? []), ...(job?.user_tags ?? [])];

  const downloadVideo = async () => {
    if (!videoUrl) return;
    setDownloading(true);
    const safeName = (job?.title || 'video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'video';
    const link = document.createElement('a');
    link.href = `/api/download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(`${safeName}.mp4`)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => setDownloading(false), 600);
  };

  return (
    <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-3 sm:space-y-4 sm:pt-4">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-base font-bold tracking-tight text-text sm:text-lg">Preview</h2>
        </div>
        {job ? <span className="text-xs text-muted">{job.provider_name ?? job.selected_model ?? 'Queued'}</span> : null}
      </div>

      {loading || isProcessing ? (
        <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.28)] p-4 text-center">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-accent)/0.1)] text-[hsl(var(--color-accent))]">
              <Spinner />
            </span>
            <div>
              <p className="text-base font-semibold text-text">Creating your video</p>
              <p className="mt-1 text-sm text-muted">Stay here. The preview updates automatically as the render progresses.</p>
            </div>
            <div className="h-2 w-full rounded-full bg-[hsl(var(--color-border))]">
              <div className="h-2 rounded-full bg-[hsl(var(--color-accent))] transition-all" style={{ width: `${job?.progress ?? 18}%` }} />
            </div>
            <p className="text-xs text-muted">{job?.progress ?? 18}% complete</p>
          </div>
        </div>
      ) : null}

      {error ? <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
      {job?.status === 'failed' ? <p className="text-sm text-[hsl(var(--color-danger))]">{job.error_message ?? 'Generation failed.'}</p> : null}

      {job?.tts_provider ? (
        <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.28)] px-3 py-2.5">
          <p className="text-xs uppercase tracking-[0.14em] text-muted">Narration Provider</p>
          <p className="mt-1 text-sm font-semibold text-text">
            {job.tts_provider}
            {job.tts_resolved_voice ? ` · ${job.tts_resolved_voice}` : ''}
            {job.tts_fallback_used ? ' · fallback used' : ''}
          </p>
          {job.tts_provider_message ? (
            <p className="mt-1 text-xs text-muted">{job.tts_provider_message}</p>
          ) : null}
        </div>
      ) : null}

      {videoUrl ? (
        <div className="space-y-4">
          <div className={`mx-auto overflow-hidden rounded-[16px] border border-[hsl(var(--color-border)/0.7)] bg-black ${frameWidthClass}`}>
            <video
              src={videoUrl}
              poster={thumbnailUrl ?? undefined}
              controls
              className="max-h-[46vh] sm:max-h-[54vh] w-full bg-black object-contain"
            />
          </div>
          <dl className="grid gap-x-4 gap-y-2 border-y border-[hsl(var(--color-border)/0.45)] py-3 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-muted">Provider</dt>
              <dd className="font-medium text-text">{job?.provider_name ?? job?.selected_model ?? 'Render'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-muted">Resolution</dt>
              <dd className="font-medium text-text">{job?.resolution ?? '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-muted">Duration</dt>
              <dd className="font-medium text-text">{job?.duration_seconds ? `${job.duration_seconds}s` : '—'}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-[11px] uppercase tracking-[0.16em] text-muted">Frame</dt>
              <dd className="font-medium text-text">{job?.aspect_ratio ?? '—'}</dd>
            </div>
          </dl>
          {allTags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {allTags.map((tag) => (
                <Badge key={tag}>
                  <Tag className="mr-1 h-3 w-3" />
                  {tag}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => void downloadVideo()}
              disabled={downloading}
              className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] disabled:opacity-60"
            >
              <Download className="h-4 w-4" />
              {downloading ? 'Downloading...' : 'Download'}
            </button>
            <Button type="button" variant="secondary" onClick={onRetry} className="gap-2 rounded-full">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      ) : !loading && !error ? (
        <div className="flex min-h-[150px] sm:min-h-[190px] flex-col items-center justify-center rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.24)] px-4 py-6 text-center">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-accent)/0.08)] text-[hsl(var(--color-accent))]">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="mt-3 text-base font-semibold text-text">Your reel preview will appear here</p>
          <p className="mt-1 text-sm text-muted">Start with a quick idea or use a template to generate your first reel.</p>
        </div>
      ) : null}
    </div>
  );
}
