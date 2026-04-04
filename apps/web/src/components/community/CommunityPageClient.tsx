'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Film, Heart, LoaderCircle, Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { InspirationImage, InspirationVideo } from '@/types/api';

type Props = {
  userId: string;
};

type CommunityFilter = 'all' | 'video' | 'image';
type CommunitySort = 'newest' | 'liked';
type CommunityItem = InspirationImage | InspirationVideo;

const COMMUNITY_PAGE_SIZE = 12;

function isVideoItem(item: CommunityItem): item is InspirationVideo {
  return 'video_url' in item;
}

function isImageItem(item: CommunityItem): item is InspirationImage {
  return 'image_url' in item;
}

function toAbsoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

function aspectRatioToCss(value: string | null | undefined) {
  if (!value) return '1 / 1';
  const normalized = value.replace(/\s+/g, '');
  const separator = normalized.includes(':') ? ':' : normalized.includes('/') ? '/' : null;
  if (!separator) return '1 / 1';
  const [w, h] = normalized.split(separator);
  const width = Number(w);
  const height = Number(h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '1 / 1';
  }
  return `${width} / ${height}`;
}

function timeAgo(value: string) {
  const now = Date.now();
  const at = new Date(value).getTime();
  const diffMin = Math.max(1, Math.floor((now - at) / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function sortItems(items: CommunityItem[], sort: CommunitySort) {
  const ranked = [...items];
  ranked.sort((left, right) => {
    if (sort === 'liked') {
      const likeDelta = (right.like_count ?? 0) - (left.like_count ?? 0);
      if (likeDelta !== 0) return likeDelta;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
  return ranked;
}

function mergeUnique<T extends { id: string }>(current: T[], incoming: T[]) {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    next.push(item);
    seen.add(item.id);
  }
  return next;
}

export function CommunityPageClient({ userId: _userId }: Props) {
  const [filter, setFilter] = useState<CommunityFilter>('all');
  const [sort, setSort] = useState<CommunitySort>('newest');
  const [images, setImages] = useState<InspirationImage[]>([]);
  const [videos, setVideos] = useState<InspirationVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreImages, setHasMoreImages] = useState(true);
  const [hasMoreVideos, setHasMoreVideos] = useState(true);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const feedItems = useMemo(() => {
    if (filter === 'image') return sortItems(images, sort);
    if (filter === 'video') return sortItems(videos, sort);
    return sortItems([...videos, ...images], sort);
  }, [filter, images, sort, videos]);

  const canLoadMore =
    filter === 'all'
      ? hasMoreImages || hasMoreVideos
      : filter === 'image'
        ? hasMoreImages
        : hasMoreVideos;

  const loadBatch = useCallback(async (mode: 'reset' | 'append') => {
    const nextImageOffset = mode === 'reset' ? 0 : images.length;
    const nextVideoOffset = mode === 'reset' ? 0 : videos.length;
    const shouldLoadImages = filter !== 'video';
    const shouldLoadVideos = filter !== 'image';

    if (mode === 'reset') {
      setLoading(true);
    } else {
      if (!canLoadMore) return;
      setLoadingMore(true);
    }
    setError(null);

    try {
      const [imageBatch, videoBatch] = await Promise.allSettled([
        shouldLoadImages
          ? api.listPublicImageInspiration({
              limit: COMMUNITY_PAGE_SIZE,
              offset: nextImageOffset,
              sort,
            })
          : Promise.resolve([] as InspirationImage[]),
        shouldLoadVideos
          ? api.listPublicVideoInspiration({
              limit: COMMUNITY_PAGE_SIZE,
              offset: nextVideoOffset,
              sort,
            })
          : Promise.resolve([] as InspirationVideo[]),
      ]);

      if (shouldLoadImages) {
        const nextImages = imageBatch.status === 'fulfilled' ? imageBatch.value : [];
        setImages((current) => (mode === 'reset' ? nextImages : mergeUnique(current, nextImages)));
        setHasMoreImages(nextImages.length === COMMUNITY_PAGE_SIZE);
      } else {
        setImages([]);
        setHasMoreImages(false);
      }

      if (shouldLoadVideos) {
        const nextVideos = videoBatch.status === 'fulfilled' ? videoBatch.value : [];
        setVideos((current) => (mode === 'reset' ? nextVideos : mergeUnique(current, nextVideos)));
        setHasMoreVideos(nextVideos.length === COMMUNITY_PAGE_SIZE);
      } else {
        setVideos([]);
        setHasMoreVideos(false);
      }
      if (
        (shouldLoadImages && imageBatch.status === 'rejected') &&
        (shouldLoadVideos && videoBatch.status === 'rejected')
      ) {
        throw new Error('Could not load community feed.');
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load community feed.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [canLoadMore, filter, images.length, sort, videos.length]);

  useEffect(() => {
    void loadBatch('reset');
  }, [loadBatch]);

  useEffect(() => {
    if (!sentinelRef.current || loading || loadingMore || !canLoadMore) return;
    const target = sentinelRef.current;
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (!entry?.isIntersecting) return;
        void loadBatch('append');
      },
      {
        rootMargin: '320px 0px',
      },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [canLoadMore, loadBatch, loading, loadingMore]);

  return (
    <div className="space-y-6">
      <section className="rangmanch-page-shell rounded-[32px] px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="rangmanch-section-eyebrow">Community</p>
            <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
              Browse what creators are publishing
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted sm:text-base">
              Explore approved public images and videos, sort by freshness or momentum, and remix strong ideas back into your workflow.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="rounded-full px-4 py-2 text-xs text-muted">
              Infinite scroll
            </Badge>
            <Badge variant="outline" className="rounded-full px-4 py-2 text-xs text-muted">
              Optimized batches
            </Badge>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', 'All'],
              ['video', 'Videos'],
              ['image', 'Images'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  filter === value
                    ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                    : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-[0.24em] text-muted">Sort</span>
            {([
              ['newest', 'Newest'],
              ['liked', 'Most liked'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setSort(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  sort === value
                    ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                    : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] text-muted'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <Card className="rangmanch-studio-panel border-none bg-transparent">
            <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>
          </Card>
        ) : null}

        {loading ? (
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 2xl:columns-4">
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`community-skeleton-${index}`}
                className="mb-4 h-64 break-inside-avoid animate-pulse rounded-[18px] bg-[hsl(var(--color-border))]"
              />
            ))}
          </div>
        ) : feedItems.length === 0 ? (
          <Card className="rangmanch-studio-panel rounded-[28px] border border-dashed border-[hsl(var(--color-border))] bg-transparent p-8 text-center">
            <p className="font-heading text-lg font-extrabold text-text">No community posts found</p>
            <p className="mt-2 text-sm text-muted">
              Try another filter or publish a strong image or video from your own studio to seed the feed.
            </p>
          </Card>
        ) : (
          <div className="columns-1 gap-3 sm:columns-2 lg:columns-3 2xl:columns-4">
            {feedItems.map((item) => {
              const videoItem = isVideoItem(item) ? item : null;
              const imageItem = isImageItem(item) ? item : null;
              const preview =
                videoItem
                  ? toAbsoluteUrl(videoItem.thumbnail_url) || toAbsoluteUrl(videoItem.video_url)
                  : toAbsoluteUrl(imageItem?.image_url);
              return (
                <article
                  key={item.id}
                  className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[18px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.5)] shadow-soft"
                  style={{ aspectRatio: aspectRatioToCss(item.aspect_ratio) }}
                >
                  {preview ? (
                    <img
                      src={preview}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-[hsl(var(--color-surface))] text-sm text-muted">
                      Preview unavailable
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.92)] via-[hsl(var(--color-bg)/0.12)] to-transparent" />
                  <div className="absolute left-2 top-2 flex items-center gap-1 sm:left-3 sm:top-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] px-2 py-1 text-[10px] font-semibold text-text backdrop-blur-md">
                      <Heart className="h-3 w-3" strokeWidth={1.75} />
                      {item.like_count}
                    </span>
                    {videoItem ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] px-2 py-1 text-[10px] font-semibold text-text backdrop-blur-md">
                        <Film className="h-3 w-3" strokeWidth={1.75} />
                        {videoItem.duration_seconds}s
                      </span>
                    ) : null}
                  </div>
                  <span className="absolute right-2 top-2 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] px-2 py-1 text-[10px] font-semibold text-text backdrop-blur-md sm:right-3 sm:top-3">
                    {timeAgo(item.created_at)}
                  </span>
                  <div className="absolute inset-x-0 bottom-0 space-y-3 p-3 sm:p-4">
                    <div className="space-y-1">
                      <p className="line-clamp-1 text-sm font-semibold text-text sm:text-[15px]">{item.title}</p>
                      <p className="line-clamp-2 text-xs leading-5 text-muted sm:text-sm">{item.prompt}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="rounded-full text-[10px] text-muted">
                        {videoItem ? 'Video' : 'Image'}
                      </Badge>
                      <Badge variant="outline" className="rounded-full text-[10px] text-muted">
                        {item.model_key}
                      </Badge>
                      <Badge variant="outline" className="rounded-full text-[10px] text-muted">
                        {item.aspect_ratio}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={videoItem ? '/create' : '/images'}
                        className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-3 py-2 text-xs font-semibold text-[hsl(var(--color-accent-contrast))]"
                      >
                        <Wand2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Open studio
                      </Link>
                      <a
                        href={videoItem ? toAbsoluteUrl(videoItem.video_url) ?? '#' : toAbsoluteUrl(imageItem?.image_url) ?? '#'}
                        download
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.8)] px-3 py-2 text-xs font-semibold text-text"
                      >
                        <Download className="h-3.5 w-3.5" strokeWidth={1.75} />
                        Download
                      </a>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div ref={sentinelRef} className="flex min-h-16 items-center justify-center">
          {loadingMore ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.75)] px-4 py-2 text-sm text-muted">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Loading more community posts
            </div>
          ) : !loading && canLoadMore ? (
            <p className="text-xs uppercase tracking-[0.22em] text-muted">Scroll to load more</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
