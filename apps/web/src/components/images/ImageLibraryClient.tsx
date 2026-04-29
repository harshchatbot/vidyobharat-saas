'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImageIcon, LoaderCircle, Search, Trash2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ImageDetailModal } from '@/components/ui/ImageDetailModal';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { GeneratedImage } from '@/types/api';

type Props = {
  userId: string;
  initialImages: GeneratedImage[];
};

const INITIAL_IMAGE_BATCH = 12;
const IMAGE_BATCH_STEP = 12;
const IMAGE_REFRESH_STALE_MS = 20_000;

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function toAbsolute(url?: string | null) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

export function ImageLibraryClient({ userId, initialImages }: Props) {
  const { show } = useToast();
  const [images, setImages] = useState(initialImages);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(initialImages.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<GeneratedImage | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_IMAGE_BATCH);
  const [lastLoadedAt, setLastLoadedAt] = useState(initialImages.length > 0 ? Date.now() : 0);

  useEffect(() => {
    setImages(initialImages);
    if (initialImages.length > 0) {
      setLastLoadedAt(Date.now());
    }
  }, [initialImages]);

  const refreshImages = useCallback(async () => {
    setRefreshing(true);
    try {
      const nextImages = await api.listGeneratedImages(userId, 50);
      setImages(nextImages);
      setLoadError(null);
      setLastLoadedAt(Date.now());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not refresh your image library right now.';
      setLoadError(message);
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => {
    if (initialImages.length > 0) return;
    void refreshImages();
  }, [initialImages.length, refreshImages]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastLoadedAt < IMAGE_REFRESH_STALE_MS) return;
      void refreshImages();
    };
    window.addEventListener('focus', onVisibilityChange);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('focus', onVisibilityChange);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [lastLoadedAt, refreshImages]);

  const filteredImages = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    return images.filter((image) => {
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
  }, [images, query]);

  useEffect(() => {
    setVisibleCount(INITIAL_IMAGE_BATCH);
  }, [query, images.length]);

  const visibleImages = useMemo(
    () => filteredImages.slice(0, visibleCount),
    [filteredImages, visibleCount],
  );

  const togglePublish = async (image: GeneratedImage) => {
    setPublishingId(image.id);
    try {
      const result = await api.publishInspiration('image', image.id, !image.is_public_inspiration, userId);
      setImages((current) =>
        current.map((item) =>
          item.id === image.id
            ? {
                ...item,
                is_public_inspiration: result.is_public_inspiration,
                moderation_status: result.moderation_status,
                inspiration_score: result.inspiration_score,
                like_count: result.like_count,
              }
            : item,
        ),
      );
      setSelectedImage((current) =>
        current && current.id === image.id
          ? {
              ...current,
              is_public_inspiration: result.is_public_inspiration,
              moderation_status: result.moderation_status,
              inspiration_score: result.inspiration_score,
              like_count: result.like_count,
            }
          : current,
      );
      show({
        title: result.is_public_inspiration ? 'Published to inspiration' : 'Removed from inspiration',
        message: result.is_public_inspiration
          ? (result.moderation_status !== 'approved'
              ? 'Submitted for review. It will appear after moderation.'
              : 'Your image is now visible in inspiration.')
          : 'Your image is no longer visible in inspiration.',
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update publish status.';
      show({ title: 'Publish update failed', message, variant: 'error' });
    } finally {
      setPublishingId(null);
    }
  };

  const deleteImage = async (image: GeneratedImage) => {
    setDeletingId(image.id);
    try {
      await api.deleteGeneratedImage(image.id, userId);
      setImages((current) => current.filter((item) => item.id !== image.id));
      setSelectedImage((current) => (current?.id === image.id ? null : current));
      show({ title: 'Image deleted', message: 'The image was removed from your library.', variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete image.';
      show({ title: 'Delete failed', message, variant: 'error' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rangmanch-studio-panel rounded-[28px] px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Images</p>
            <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Your image library</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">Every generated image in one place. Reopen results, revisit prompts, and download finals without dropping back into the old studio flow.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Link href="/create">
              <Button className="w-full rounded-full px-4 sm:w-auto">Back to Create</Button>
            </Link>
            <Link href="/videos">
              <Button variant="secondary" className="w-full rounded-full px-4 sm:w-auto">Open videos</Button>
            </Link>
            <Button variant="secondary" className="w-full rounded-full px-4 sm:w-auto" onClick={() => void refreshImages()} disabled={refreshing}>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search prompts, models, tags, or sizes"
              className="w-full rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-10 py-2.5 text-sm text-text outline-none placeholder:text-muted"
            />
          </div>
        </div>

        <div className="mt-3 flex min-h-5 items-center gap-2 text-xs text-muted">
          {refreshing ? (
            <>
              <LoaderCircle className="h-3.5 w-3.5 animate-spin text-[hsl(var(--color-accent))]" />
              Refreshing your latest images…
            </>
          ) : loadError ? (
            <span>{loadError}</span>
          ) : images.length > 0 ? (
            <span>{images.length} image{images.length === 1 ? '' : 's'} loaded</span>
          ) : (
            <span>Your generated images will appear here automatically.</span>
          )}
        </div>
      </div>

      {filteredImages.length === 0 ? (
        <Card className="rounded-[24px] p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.12)]">
            <ImageIcon className="h-6 w-6 text-[hsl(var(--color-accent))]" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-text">No images here yet</h2>
          <p className="mt-2 text-sm text-muted">Generate an image from `/create` and it will show up here automatically.</p>
          <div className="mt-5">
            <Link href="/create">
              <Button className="rounded-full px-4">Go to Create</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleImages.map((image) => {
            const preview = toAbsolute(image.thumbnail_url || image.image_url) || image.image_url;
            return (
              <button
                key={image.id}
                type="button"
                onClick={() => setSelectedImage(image)}
                className="overflow-hidden rounded-[26px] border border-[hsl(var(--color-border)/0.68)] bg-[hsl(var(--color-surface)/0.72)] shadow-soft"
              >
                <div className="relative overflow-hidden border-b border-[hsl(var(--color-border)/0.58)] bg-black">
                  <img
                    src={preview}
                    alt={image.prompt || 'Generated image'}
                    className="h-[260px] w-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent" />
                </div>

                <div className="space-y-3 p-4">
                  <div>
                    <p className="line-clamp-2 text-sm text-text">{image.prompt}</p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{image.model_key}</Badge>
                    <Badge variant="outline">{image.aspect_ratio}</Badge>
                    <Badge variant="outline">{image.resolution}</Badge>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs text-muted">{relativeTime(image.created_at)}</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--color-accent))]">
                      Open details
                      <ExternalLink className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {filteredImages.length > visibleCount ? (
        <div className="flex justify-center">
          <Button variant="secondary" onClick={() => setVisibleCount((current) => current + IMAGE_BATCH_STEP)}>
            Load more images
          </Button>
        </div>
      ) : null}

      {selectedImage ? (
        <ImageDetailModal
          open={Boolean(selectedImage)}
          onClose={() => setSelectedImage(null)}
          imageUrl={toAbsolute(selectedImage.image_url) || selectedImage.image_url}
          imageAlt={selectedImage.prompt || 'Library image'}
          title="Library image"
          subtitle={`Created ${relativeTime(selectedImage.created_at)}`}
          prompt={selectedImage.prompt}
          imageAspectRatio={selectedImage.aspect_ratio}
          badges={
            <>
              <Badge>{selectedImage.model_key}</Badge>
              <Badge>{selectedImage.aspect_ratio}</Badge>
              <Badge>{selectedImage.resolution}</Badge>
              <Badge>{selectedImage.status}</Badge>
              {selectedImage.is_public_inspiration ? <Badge>{selectedImage.moderation_status}</Badge> : null}
            </>
          }
          details={
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Model</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedImage.model_key}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Aspect Ratio</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedImage.aspect_ratio}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Resolution</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedImage.resolution}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Credits</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedImage.applied_credits}</p>
              </div>
            </div>
          }
          actions={
            <>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void togglePublish(selectedImage)}
                disabled={publishingId === selectedImage.id}
              >
                {publishingId === selectedImage.id
                  ? 'Updating...'
                  : selectedImage.is_public_inspiration
                    ? 'Unpublish'
                    : 'Publish to inspiration'}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void deleteImage(selectedImage)}
                disabled={deletingId === selectedImage.id}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                {deletingId === selectedImage.id ? 'Deleting...' : 'Delete image'}
              </Button>
              <a
                href={toAbsolute(selectedImage.image_url) || selectedImage.image_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text"
              >
                <ExternalLink className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Open full image
              </a>
            </>
          }
        />
      ) : null}
    </div>
  );
}
