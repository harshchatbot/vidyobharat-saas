'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, Image as ImageIcon, LoaderCircle, Video } from 'lucide-react';

import { LandingVideo } from '@/components/landing/LandingVideo';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { aspectRatioToCss, isVideoInspiration, mergeUniqueInspiration, sortPublicInspiration, type PublicInspirationItem } from '@/lib/inspiration';
import type { InspirationImage, InspirationVideo } from '@/types/api';

type Scope = 'all' | 'image' | 'video';

type Props = {
  scope: Scope;
  title: string;
  description: string;
  eyebrow?: string;
  ctaHref?: string;
  ctaLabel?: string;
  compact?: boolean;
  batchSize?: number;
  emptyTitle?: string;
  emptyBody?: string;
};

function toAbsoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return url;
}

function formatCreatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function InspirationCard({ item, onOpen }: { item: PublicInspirationItem; onOpen: () => void }) {
  const isVideo = isVideoInspiration(item);
  const previewUrl = isVideo ? (toAbsoluteUrl(item.thumbnail_url) ?? undefined) : (toAbsoluteUrl(item.image_url) ?? item.image_url);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex h-full flex-col overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.62)] bg-[hsl(var(--color-surface)/0.58)] text-left shadow-soft transition duration-300 hover:-translate-y-1 hover:border-[hsl(var(--color-accent)/0.34)]"
    >
      <div className="relative">
        <div style={{ aspectRatio: aspectRatioToCss(item.aspect_ratio, '9 / 16') }} className="overflow-hidden bg-[hsl(var(--color-bg))]">
          {isVideo ? (
            <LandingVideo
              src={toAbsoluteUrl(item.video_url) ?? item.video_url}
              poster={previewUrl}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <img
              src={previewUrl ?? ''}
              alt={item.title}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
              loading="lazy"
              decoding="async"
            />
          )}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.9)] via-[hsl(var(--color-bg)/0.12)] to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-2">
          <Badge variant="outline" className="border-white/15 bg-[hsl(var(--color-surface)/0.86)] text-text backdrop-blur">
            {isVideo ? 'Video' : 'Image'}
          </Badge>
          <Badge variant="outline" className="border-white/15 bg-[hsl(var(--color-surface)/0.86)] text-text backdrop-blur">
            {item.model_key}
          </Badge>
        </div>
        <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-white/15 bg-[hsl(var(--color-surface)/0.86)] px-2.5 py-1 text-[11px] font-semibold text-text backdrop-blur">
          <Heart className="h-3.5 w-3.5" />
          {item.like_count}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4">
          <p className="line-clamp-1 font-heading text-xl font-extrabold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
            {item.title}
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-white/78">{item.prompt}</p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-muted">
        <span className="truncate">{item.creator_name}</span>
        <span className="shrink-0">{formatCreatedAt(item.created_at)}</span>
      </div>
    </button>
  );
}

export function PublicInspirationFeed({
  scope,
  title,
  description,
  eyebrow = 'Inspiration',
  ctaHref = '/signup',
  ctaLabel = 'Start creating',
  compact = false,
  batchSize = 12,
  emptyTitle = 'No public inspiration yet',
  emptyBody = 'Approved published images and videos will appear here soon.',
}: Props) {
  const [images, setImages] = useState<InspirationImage[]>([]);
  const [videos, setVideos] = useState<InspirationVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMoreImages, setHasMoreImages] = useState(true);
  const [hasMoreVideos, setHasMoreVideos] = useState(true);
  const [selectedItem, setSelectedItem] = useState<PublicInspirationItem | null>(null);

  const canLoadMore = scope === 'all' ? hasMoreImages || hasMoreVideos : scope === 'image' ? hasMoreImages : hasMoreVideos;

  const loadBatch = useCallback(async (mode: 'reset' | 'append') => {
    const nextImageOffset = mode === 'reset' ? 0 : images.length;
    const nextVideoOffset = mode === 'reset' ? 0 : videos.length;
    const shouldLoadImages = scope !== 'video';
    const shouldLoadVideos = scope !== 'image';

    if (mode === 'reset') {
      setLoading(true);
    } else {
      if (!canLoadMore || compact) return;
      setLoadingMore(true);
    }
    setError(null);

    try {
      const [imageBatch, videoBatch] = await Promise.allSettled([
        shouldLoadImages
          ? api.listPublicImageInspiration({ limit: batchSize, offset: nextImageOffset, sort: 'newest' })
          : Promise.resolve([] as InspirationImage[]),
        shouldLoadVideos
          ? api.listPublicVideoInspiration({ limit: batchSize, offset: nextVideoOffset, sort: 'newest' })
          : Promise.resolve([] as InspirationVideo[]),
      ]);

      if (shouldLoadImages) {
        const nextImages = imageBatch.status === 'fulfilled' ? imageBatch.value : [];
        setImages((current) => (mode === 'reset' ? nextImages : mergeUniqueInspiration(current, nextImages)));
        setHasMoreImages(nextImages.length === batchSize && !compact);
      } else {
        setImages([]);
        setHasMoreImages(false);
      }

      if (shouldLoadVideos) {
        const nextVideos = videoBatch.status === 'fulfilled' ? videoBatch.value : [];
        setVideos((current) => (mode === 'reset' ? nextVideos : mergeUniqueInspiration(current, nextVideos)));
        setHasMoreVideos(nextVideos.length === batchSize && !compact);
      } else {
        setVideos([]);
        setHasMoreVideos(false);
      }

      if ((shouldLoadImages && imageBatch.status === 'rejected') && (shouldLoadVideos && videoBatch.status === 'rejected')) {
        throw new Error('Could not load public inspiration right now.');
      }
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Could not load public inspiration right now.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [batchSize, canLoadMore, compact, images.length, scope, videos.length]);

  useEffect(() => {
    void loadBatch('reset');
  }, [loadBatch]);

  const items = useMemo(() => {
    if (scope === 'image') return sortPublicInspiration(images, 'newest');
    if (scope === 'video') return sortPublicInspiration(videos, 'newest');
    return sortPublicInspiration([...videos, ...images], 'newest');
  }, [images, scope, videos]);

  const visibleItems = compact ? items.slice(0, 8) : items;

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2">
          <p className="rangmanch-section-eyebrow">{eyebrow}</p>
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">{title}</h2>
          <p className="max-w-3xl text-sm leading-6 text-muted sm:text-base">{description}</p>
        </div>
        <div className="flex items-center gap-2">
          {scope === 'all' ? <Link href="/images" className="rounded-full border border-[hsl(var(--color-border)/0.72)] px-4 py-2 text-sm font-semibold text-text">Browse images</Link> : null}
          {scope === 'all' ? <Link href="/videos" className="rounded-full border border-[hsl(var(--color-border)/0.72)] px-4 py-2 text-sm font-semibold text-text">Browse videos</Link> : null}
          <Link href={ctaHref} className="rounded-full bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]">
            {ctaLabel}
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm font-medium text-muted">
            <LoaderCircle className="h-4 w-4 animate-spin" />
            Loading public inspiration
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: compact ? 4 : 8 }).map((_, index) => (
              <div key={`public-inspiration-skeleton-${index}`} className="h-[320px] animate-pulse rounded-[28px] border border-[hsl(var(--color-border)/0.62)] bg-[hsl(var(--color-surface)/0.55)]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.55)] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-text">Could not load inspiration</p>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <Button type="button" variant="secondary" className="mt-4" onClick={() => void loadBatch('reset')}>
            Try again
          </Button>
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.55)] px-6 py-8 text-center">
          <p className="text-sm font-semibold text-text">{emptyTitle}</p>
          <p className="mt-2 text-sm text-muted">{emptyBody}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {visibleItems.map((item) => (
              <InspirationCard key={`${isVideoInspiration(item) ? 'video' : 'image'}-${item.id}`} item={item} onOpen={() => setSelectedItem(item)} />
            ))}
          </div>
          {!compact && canLoadMore ? (
            <div className="flex justify-center pt-2">
              <Button type="button" variant="secondary" onClick={() => void loadBatch('append')} disabled={loadingMore} className="gap-2 rounded-full px-5">
                {loadingMore ? <LoaderCircle className="h-4 w-4 animate-spin" /> : scope === 'video' ? <Video className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
                {loadingMore ? 'Loading more' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {selectedItem ? (
        <Modal open onClose={() => setSelectedItem(null)}>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.88)] p-2">
              {isVideoInspiration(selectedItem) ? (
                <LandingVideo
                  src={toAbsoluteUrl(selectedItem.video_url) ?? selectedItem.video_url}
                  poster={toAbsoluteUrl(selectedItem.thumbnail_url) ?? undefined}
                  className="w-full rounded-[18px] bg-black object-cover"
                />
              ) : (
                <img
                  src={toAbsoluteUrl(selectedItem.image_url) ?? selectedItem.image_url}
                  alt={selectedItem.title}
                  className="w-full rounded-[18px] object-cover"
                  loading="lazy"
                />
              )}
            </div>
            <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.78)] p-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{isVideoInspiration(selectedItem) ? 'Video' : 'Image'}</Badge>
                <Badge>{selectedItem.model_key}</Badge>
                {isVideoInspiration(selectedItem) ? <Badge>{selectedItem.duration_seconds}s</Badge> : <Badge>{selectedItem.aspect_ratio}</Badge>}
              </div>
              <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-text">{selectedItem.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{selectedItem.prompt}</p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.68)] bg-[hsl(var(--color-bg)/0.6)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Creator</p>
                  <p className="mt-1 font-semibold text-text">{selectedItem.creator_name}</p>
                </div>
                <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.68)] bg-[hsl(var(--color-bg)/0.6)] p-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Published</p>
                  <p className="mt-1 font-semibold text-text">{formatCreatedAt(selectedItem.created_at)}</p>
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <Link href={ctaHref} className="flex-1">
                  <Button type="button" className="w-full rounded-[16px] py-3 text-sm font-semibold">Create something like this</Button>
                </Link>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}
