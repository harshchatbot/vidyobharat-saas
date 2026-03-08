'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Heart, Wand2 } from 'lucide-react';
import { LandingVideo } from '@/components/landing/LandingVideo';
import { GlassPanel } from '@/components/landing/GlassPanel';

type InspirationVideo = {
  id: string;
  creator_name: string;
  model_key: string;
  provider_name: string;
  title: string;
  prompt: string;
  video_url: string;
  thumbnail_url: string;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  created_at: string;
  tags: string[];
  like_count: number;
};

type InspirationImage = {
  id: string;
  creator_name: string;
  model_key: string;
  title: string;
  prompt: string;
  image_url: string;
  aspect_ratio: string;
  resolution: string;
  created_at: string;
  tags: string[];
  like_count: number;
};

type Props = {
  videos: InspirationVideo[];
  images: InspirationImage[];
};

function aspectRatioToCss(value: string | null | undefined) {
  if (!value) return '9 / 16';
  const normalized = value.replace(/\s+/g, '');
  const separator = normalized.includes(':') ? ':' : normalized.includes('/') ? '/' : null;
  if (!separator) return '9 / 16';
  const [w, h] = normalized.split(separator);
  const width = Number(w);
  const height = Number(h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '9 / 16';
  }
  return `${width} / ${height}`;
}

export function CommunityShowcase({ videos, images }: Props) {
  const [filter, setFilter] = useState<'all' | 'videos' | 'images'>('all');
  const hasAny = videos.length > 0 || images.length > 0;
  const merged = useMemo(
    () =>
      [
        ...(filter === 'all' || filter === 'videos'
          ? videos.slice(0, 18).map((video) => ({ type: 'video' as const, item: video }))
          : []),
        ...(filter === 'all' || filter === 'images'
          ? images.slice(0, 24).map((image) => ({ type: 'image' as const, item: image }))
          : []),
      ].sort((a, b) => {
        const aTime = new Date(a.item.created_at).getTime();
        const bTime = new Date(b.item.created_at).getTime();
        return bTime - aTime;
      }),
    [filter, images, videos],
  );

  return (
    <section className="space-y-6 py-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="rangmanch-section-eyebrow">Community</p>
          <h2 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
            Explore public videos and visuals already created on RangManch AI
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
            Browse approved public creations from creators already shipping content with the platform.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <GlassPanel className="flex flex-wrap gap-2 rounded-full px-2 py-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'videos', label: 'Videos' },
              { key: 'images', label: 'Images' },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key as 'all' | 'videos' | 'images')}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  filter === item.key
                    ? 'bg-[hsl(var(--color-text))] text-[hsl(var(--color-bg))]'
                    : 'text-muted hover:bg-[hsl(var(--color-surface)/0.4)] hover:text-text'
                }`}
              >
                {item.label}
              </button>
            ))}
          </GlassPanel>
          <Link
            href="/signup"
            className="hidden rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.28)] px-4 py-2 text-sm font-semibold text-text sm:inline-flex"
          >
            Start creating
          </Link>
        </div>
      </div>

      {!hasAny ? (
        <GlassPanel className="px-5 py-8 text-sm text-muted">
          Community creations are loading. Check back in a moment.
        </GlassPanel>
      ) : null}

      {hasAny ? (
        <div className="columns-1 gap-4 sm:columns-2 lg:columns-4">
          {merged.map((entry, index) => {
            if (entry.type === 'video') {
              const video = entry.item;
              return (
                <motion.article
                  key={`video-${video.id}`}
                  initial={{ opacity: 0, y: 18, scale: 0.98 }}
                  whileInView={{ opacity: 1, y: 0, scale: 1 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.18), ease: 'easeOut' }}
                  className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[var(--radius-xl)] border border-[hsl(var(--color-border)/0.56)] bg-[hsl(var(--color-surface-glass)/0.4)] shadow-[var(--shadow-soft)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-float)]"
                >
                  <div
                    className="relative w-full bg-[hsl(var(--color-bg))]"
                    style={{ aspectRatio: aspectRatioToCss(video.aspect_ratio) }}
                  >
                    <LandingVideo
                      src={video.video_url}
                      poster={video.thumbnail_url || undefined}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute left-2 top-2 rounded-full bg-[hsl(var(--color-bg)/0.75)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur-md">
                      {video.model_key}
                    </div>
                    <div className="absolute right-2 top-2 rounded-full bg-[hsl(var(--color-bg)/0.75)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur-md">
                      {video.duration_seconds}s
                    </div>
                    <div className="absolute left-2 top-10 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--color-bg)/0.78)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur-md">
                      <Heart className="h-3.5 w-3.5" />
                      {video.like_count}
                    </div>
                    <div className="pointer-events-none absolute right-2 top-10 z-10 flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.52)] px-1.5 py-1 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                      <button type="button" aria-label="Like" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-accent)/0.2)]">
                        <Heart className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Download" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-accent)/0.2)]">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" aria-label="Remix" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-accent)/0.2)]">
                        <Wand2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="absolute inset-x-2 bottom-2 z-10 rounded-[var(--radius-md)] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.56)] p-3 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                      <p className="line-clamp-1 text-sm font-semibold text-[hsl(var(--color-text))]">{video.title}</p>
                      <p className="line-clamp-2 text-xs text-[hsl(var(--color-muted))]">{video.prompt}</p>
                    </div>
                    <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.9),transparent)] p-3 transition group-hover:opacity-0">
                      <p className="line-clamp-1 text-sm font-semibold text-[hsl(var(--color-text))]">{video.title}</p>
                      <p className="line-clamp-2 text-xs text-[hsl(var(--color-muted))]">{video.prompt}</p>
                    </div>
                  </div>
                </motion.article>
              );
            }

            const image = entry.item;
            return (
              <motion.article
                key={`image-${image.id}`}
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.4, delay: Math.min(index * 0.03, 0.18), ease: 'easeOut' }}
                className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[var(--radius-xl)] border border-[hsl(var(--color-border)/0.56)] bg-[hsl(var(--color-surface-glass)/0.4)] shadow-[var(--shadow-soft)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[var(--shadow-float)]"
              >
                <div style={{ aspectRatio: aspectRatioToCss(image.aspect_ratio) }}>
                  <img
                    src={image.image_url}
                    alt={image.title}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    loading="lazy"
                  />
                </div>
                <div className="absolute left-2 top-2 rounded-full bg-[hsl(var(--color-bg)/0.75)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur-md">
                  {image.model_key}
                </div>
                <div className="absolute left-2 top-10 inline-flex items-center gap-1 rounded-full bg-[hsl(var(--color-bg)/0.78)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur-md">
                  <Heart className="h-3.5 w-3.5" />
                  {image.like_count}
                </div>
                <div className="pointer-events-none absolute right-2 top-10 z-10 flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.52)] px-1.5 py-1 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                  <button type="button" aria-label="Like" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-accent)/0.2)]">
                    <Heart className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Download" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-accent)/0.2)]">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" aria-label="Remix" className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-accent)/0.2)]">
                    <Wand2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="absolute inset-x-2 bottom-2 z-10 rounded-[var(--radius-md)] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.56)] p-3 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                  <p className="line-clamp-1 text-sm font-semibold text-[hsl(var(--color-text))]">{image.title}</p>
                  <p className="line-clamp-2 text-xs text-[hsl(var(--color-muted))]">{image.prompt}</p>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.9),transparent)] p-3 transition group-hover:opacity-0">
                  <p className="line-clamp-1 text-sm font-semibold text-[hsl(var(--color-text))]">{image.title}</p>
                  <p className="line-clamp-2 text-xs text-[hsl(var(--color-muted))]">{image.prompt}</p>
                </div>
              </motion.article>
            );
          })}
        </div>
      ) : null}

      <div className="pt-1">
        <Link
          href="/signup"
          className="inline-flex rounded-full bg-[hsl(var(--color-text))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-bg))]"
        >
          Join the community and create yours
        </Link>
      </div>
    </section>
  );
}
