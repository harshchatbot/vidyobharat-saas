'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, ImageIcon, LoaderCircle, Search } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import type { GeneratedImage } from '@/types/api';

type Props = {
  userId: string;
  initialImages: GeneratedImage[];
};

function relativeTime(value: string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMin = Math.max(1, Math.floor(diffMs / 60000));
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

export function ImageLibraryClient({ userId, initialImages }: Props) {
  const [images, setImages] = useState(initialImages);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(initialImages.length === 0);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setImages(initialImages);
  }, [initialImages]);

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    void api
      .listGeneratedImages(userId, 50)
      .then((nextImages) => {
        if (cancelled) return;
        setImages(nextImages);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Could not refresh your image library right now.';
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

  return (
    <div className="space-y-6">
      <div className="rangmanch-studio-panel rounded-[28px] px-5 py-6 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Images</p>
            <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Your image library</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted">Every generated image in one place. Reopen results, revisit prompts, and download finals without dropping back into the old studio flow.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/create">
              <Button className="rounded-full px-4">Back to Create</Button>
            </Link>
            <Link href="/videos">
              <Button variant="secondary" className="rounded-full px-4">Open videos</Button>
            </Link>
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
          {filteredImages.map((image) => {
            const preview = image.thumbnail_url || image.image_url;
            return (
              <div
                key={image.id}
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
                    <a href={image.image_url} target="_blank" rel="noreferrer">
                      <Button variant="secondary" className="rounded-full px-3 py-2 text-xs">
                        Open image
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
