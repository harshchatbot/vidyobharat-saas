import { Download, RefreshCcw, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  const videoUrl = toAbsoluteUrl(job?.output_url);
  const thumbnailUrl = toAbsoluteUrl(job?.thumbnail_url);
  const isProcessing = job && job.status !== 'completed' && job.status !== 'failed';
  const allTags = [...(job?.auto_tags ?? []), ...(job?.user_tags ?? [])];

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="font-heading text-xl font-extrabold tracking-tight text-text">Post-Generate Preview</h2>
          <p className="mt-1 text-sm text-muted">Review the final job, metadata, and export actions.</p>
        </div>
        {job ? <Badge>{job.provider_name ?? job.selected_model ?? 'Queued'}</Badge> : null}
      </div>

      {loading || isProcessing ? (
        <div className="rounded-[var(--radius-lg)] border border-border bg-bg p-6 text-center">
          <div className="mx-auto flex w-full max-w-md flex-col items-center gap-4">
            <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
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

      {videoUrl ? (
        <div className="space-y-4">
          <video src={videoUrl} poster={thumbnailUrl ?? undefined} controls className="w-full rounded-[var(--radius-lg)] border border-border bg-black" />
          <div className="flex flex-wrap gap-2">
            {job?.provider_name ? <Badge>{job.provider_name}</Badge> : null}
            {job?.resolution ? <Badge>{job.resolution}</Badge> : null}
            {job?.duration_seconds ? <Badge>{job.duration_seconds}s</Badge> : null}
            {job?.aspect_ratio ? <Badge>{job.aspect_ratio}</Badge> : null}
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
          <div className="flex flex-wrap gap-3">
            <a
              href={videoUrl}
              download
              className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]"
            >
              <Download className="h-4 w-4" />
              Download
            </a>
            <Button type="button" variant="secondary" onClick={onRetry} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
