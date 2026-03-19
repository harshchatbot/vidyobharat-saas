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
    <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.72)] pt-3.5 sm:space-y-4 sm:pt-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-base font-bold tracking-tight text-text sm:text-lg">Preview & output</h2>
          <p className="mt-1 text-xs text-muted">Review the current render, retry fast, or export when it’s ready.</p>
        </div>
        {job ? <Badge>{job.provider_name ?? job.selected_model ?? 'Queued'}</Badge> : null}
      </div>

      {loading || isProcessing ? (
        <div className="rounded-[20px] border border-border bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.76),hsl(var(--color-surface)/0.52))] p-4 sm:rounded-[22px] sm:p-5 text-center shadow-[var(--shadow-soft)]">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
              <Spinner />
            </span>
            <div>
              <p className="text-base font-semibold text-text">Generating your video</p>
              <p className="mt-1 text-sm text-muted">This job is being processed. The page polls automatically for completion.</p>
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
        <div className="rounded-[20px] border border-border bg-[hsl(var(--color-bg)/0.62)] px-4 py-3">
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
          <div className={`mx-auto overflow-hidden rounded-[20px] border border-[hsl(var(--color-border))] bg-black shadow-[var(--shadow-soft)] ${frameWidthClass}`}>
            <video
              src={videoUrl}
              poster={thumbnailUrl ?? undefined}
              controls
              className="max-h-[48vh] sm:max-h-[56vh] w-full bg-black object-contain"
            />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-[18px] border border-border bg-[hsl(var(--color-bg)/0.68)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Provider</p>
              <p className="mt-1 text-sm font-semibold text-text">{job?.provider_name ?? job?.selected_model ?? 'Render'}</p>
            </div>
            <div className="rounded-[18px] border border-border bg-[hsl(var(--color-bg)/0.68)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Resolution</p>
              <p className="mt-1 text-sm font-semibold text-text">{job?.resolution ?? '—'}</p>
            </div>
            <div className="rounded-[18px] border border-border bg-[hsl(var(--color-bg)/0.68)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Duration</p>
              <p className="mt-1 text-sm font-semibold text-text">{job?.duration_seconds ? `${job.duration_seconds}s` : '—'}</p>
            </div>
            <div className="rounded-[18px] border border-border bg-[hsl(var(--color-bg)/0.68)] px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Frame</p>
              <p className="mt-1 text-sm font-semibold text-text">{job?.aspect_ratio ?? '—'}</p>
            </div>
          </div>
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
        <div className="flex min-h-[170px] sm:min-h-[220px] flex-col items-center justify-center rounded-[20px] sm:rounded-[24px] border border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.4),hsl(var(--color-bg)/0.7))] px-4 py-6 sm:px-6 sm:py-8 text-center">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-accent)/0.1)] text-[hsl(var(--color-accent))]">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="mt-4 text-base font-semibold text-text">Your next render will appear here</p>
        </div>
      ) : null}
    </div>
  );
}
