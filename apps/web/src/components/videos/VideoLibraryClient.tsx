'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, ImageIcon, LoaderCircle, Search } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusChip } from '@/components/ui/StatusChip';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { GeneratedImage, Video } from '@/types/api';

type Props = {
  userId: string;
  initialVideos: Video[];
  initialImages: GeneratedImage[];
};

type MediaFilterKey = 'all' | 'videos' | 'images';

function toAbsoluteUrl(url: string | null) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function VideoLibraryClient({ userId, initialVideos, initialImages }: Props) {
  const [videos, setVideos] = useState(initialVideos);
  const [images, setImages] = useState(initialImages);
  const [query, setQuery] = useState('');
  const [mediaFilter, setMediaFilter] = useState<MediaFilterKey>('all');
  const [refreshing, setRefreshing] = useState(initialVideos.length === 0 && initialImages.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setVideos(initialVideos);
  }, [initialVideos]);

  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    void Promise.all([api.listVideos(userId, 50, 45_000), api.listGeneratedImages(userId, 50)])
      .then(([nextVideos, nextImages]) => {
        if (cancelled) return;
        setVideos(nextVideos);
        setImages(nextImages);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Could not refresh your video library right now.';
        setLoadError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const filteredVideos = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return videos.filter((video) => {
      if (mediaFilter === 'images') return false;
      if (!trimmed) return true;
      const haystack = [
        video.title,
        video.template,
        video.script,
        video.selected_model,
        ...video.auto_tags,
        ...video.user_tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [mediaFilter, query, videos]);

  const filteredImages = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return images.filter((image) => {
      if (mediaFilter === 'videos') return false;
      if (!trimmed) return true;
      const haystack = [
        image.prompt,
        image.model_key,
        image.aspect_ratio,
        image.resolution,
        ...image.auto_tags,
        ...image.user_tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(trimmed);
    });
  }, [images, mediaFilter, query]);

  return (
    <div className="space-y-6">
      <div className="rangmanch-studio-panel rounded-[var(--radius-xl)] px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted">Library</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text sm:text-[2rem]">Your generation library</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/create">
              <Button className="rounded-full px-4">Create new</Button>
            </Link>
            <Link href="/projects">
              <Button variant="secondary" className="rounded-full px-4">Open Projects</Button>
            </Link>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search prompts, titles, models, tags, or sizes"
              className="w-full rounded-full border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg)/0.72)] px-10 py-2.5 text-sm text-text outline-none placeholder:text-muted"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {([
              ['all', 'All'],
              ['videos', 'Videos'],
              ['images', 'Images'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setMediaFilter(key)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mediaFilter === key
                    ? 'border border-[hsl(var(--color-accent)/0.22)] bg-[hsl(var(--color-accent)/0.12)] text-text shadow-[0_0_0_1px_hsl(var(--color-hero-glow)/0.12)]'
                    : 'border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-surface)/0.72)] text-muted hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 flex min-h-5 items-center gap-2 text-xs text-muted">
          {refreshing ? (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[hsl(var(--color-accent))]" />
              Refreshing your latest generations…
            </>
          ) : loadError ? (
            <span>{loadError}</span>
          ) : videos.length > 0 || images.length > 0 ? (
            <span>
              {videos.length} video{videos.length === 1 ? '' : 's'} and {images.length} image{images.length === 1 ? '' : 's'} loaded
            </span>
          ) : (
            <span>Your new generations will appear here automatically.</span>
          )}
        </div>
      </div>

      {filteredVideos.length === 0 && filteredImages.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.12)]">
            <Clapperboard className="h-6 w-6 text-[hsl(var(--color-accent))]" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-text">Nothing here yet</h2>
          <p className="mt-2 text-sm text-muted">Generate an image or video from `/create` and it will show up here automatically.</p>
          <div className="mt-5">
            <Link href="/create">
              <Button className="rounded-full px-4">Go to Create</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filteredImages.map((image) => {
            const preview = image.thumbnail_url || image.image_url;
            return (
              <a
                key={`image-${image.id}`}
                href={image.image_url}
                target="_blank"
                rel="noreferrer"
                className="group overflow-hidden bg-[hsl(var(--color-surface))] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
              >
                <div className="relative overflow-hidden border-b border-[hsl(var(--color-border-soft)/0.3)] bg-black">
                  <img
                    src={preview}
                    alt={image.prompt || 'Generated image'}
                    className="h-[240px] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  <div className="absolute left-3 top-3">
                    <StatusChip variant="success">image</StatusChip>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <p className="line-clamp-2 text-base font-semibold text-text">{image.prompt || 'Untitled image'}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{image.model_key}</Badge>
                    <Badge variant="outline">{image.aspect_ratio}</Badge>
                    <Badge variant="outline">{image.resolution}</Badge>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{relativeTime(image.created_at)}</span>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3.5 w-3.5" />
                      Open image
                    </span>
                  </div>
                </div>
              </a>
            );
          })}
          {filteredVideos.map((video) => {
            const poster = toAbsoluteUrl(video.thumbnail_url);
            const output = toAbsoluteUrl(video.output_url);
            return (
              <Link
                key={video.id}
                href={`/videos/${video.id}`}
                className="group overflow-hidden bg-[hsl(var(--color-surface))] transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]"
              >
                <div className="relative overflow-hidden border-b border-[hsl(var(--color-border-soft)/0.3)] bg-black">
                  {video.status === 'completed' && output ? (
                    <video
                      src={output}
                      poster={poster ?? undefined}
                      className="h-[240px] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                      muted
                      loop
                      playsInline
                      preload="metadata"
                    />
                  ) : poster ? (
                    <img
                      src={poster}
                      alt={video.title || 'Generated video'}
                      className="h-[240px] w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-[240px] w-full items-center justify-center bg-[hsl(var(--color-bg)/0.8)] text-muted">
                      <Clapperboard className="h-8 w-8" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                  <div className="absolute left-3 top-3">
                    <StatusChip variant={video.status === 'completed' ? 'success' : video.status === 'failed' || video.status === 'provider_failed' || video.status === 'timed_out' ? 'danger' : 'warning'}>
                      {video.status}
                    </StatusChip>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <p className="line-clamp-1 text-base font-semibold text-text">{video.title || 'Untitled video'}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted">{video.script}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {video.selected_model ? <Badge variant="outline">{video.selected_model}</Badge> : null}
                    <Badge variant="outline">{video.aspect_ratio}</Badge>
                    <Badge variant="outline">{video.resolution}</Badge>
                    {video.duration_seconds ? <Badge variant="outline">{video.duration_seconds}s</Badge> : null}
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{relativeTime(video.created_at)}</span>
                    <span>{video.project_id ? 'In project' : 'Open workspace'}</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
