'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, ImageIcon, Layers3, PlaySquare, Sparkles, Wand2 } from 'lucide-react';
import { motion } from 'framer-motion';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { GlassPanel } from '@/components/landing/GlassPanel';
import { HeroBackgroundVideo } from '@/components/landing/HeroBackgroundVideo';
import { HeroPromptBar } from '@/components/landing/HeroPromptBar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingVideo } from '@/components/landing/LandingVideo';
import { StudioSidebar } from '@/components/landing/StudioSidebar';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

type SurfaceMedia = {
  type: 'video' | 'image';
  src: string;
  poster?: string;
};

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
  reference_urls?: string[];
  tags: string[];
  like_count: number;
};

const toolTiles = [
  {
    title: 'Text to Video',
    subtitle: 'Turn script into cinematic scenes',
    href: '/signup',
    media: { type: 'video', src: '/videos/samples/english-startup-16x9.mp4', poster: '/illustrations/startup.png' } satisfies SurfaceMedia,
    icon: Clapperboard,
  },
  {
    title: 'Image to Video',
    subtitle: 'Animate reference visuals into motion',
    href: '/signup',
    media: { type: 'image', src: '/illustrations/product-ads.png' } satisfies SurfaceMedia,
    icon: ImageIcon,
  },
  {
    title: 'AI Influencer',
    subtitle: 'Build a consistent character identity',
    href: '/signup',
    media: { type: 'image', src: '/illustrations/ai-influencer.png' } satisfies SurfaceMedia,
    icon: Wand2,
  },
  {
    title: 'Shorts',
    subtitle: 'High-frequency vertical reel workflows',
    href: '/signup',
    media: { type: 'video', src: '/videos/samples/lip-sync.mp4' } satisfies SurfaceMedia,
    icon: Sparkles,
  },
  {
    title: 'Video Editor',
    subtitle: 'Polish voice, captions, and pacing',
    href: '/signup',
    media: { type: 'image', src: '/illustrations/earth.png' } satisfies SurfaceMedia,
    icon: PlaySquare,
  },
];

const showcaseTiles = [
  {
    eyebrow: 'Daily Reels',
    title: 'Fast vertical publishing',
    body: 'Affordable daily output for creators posting regularly without overspending.',
    media: { type: 'video', src: '/videos/samples/tamil-education-9x16.mp4' } satisfies SurfaceMedia,
  },
  {
    eyebrow: 'Creator Pro',
    title: 'Polished creator-grade output',
    body: 'Balanced quality and cost for brands, coaches, and serious publishing.',
    media: { type: 'image', src: '/illustrations/agency.png' } satisfies SurfaceMedia,
  },
  {
    eyebrow: 'Premium / Cinema',
    title: 'Launch-ready hero videos',
    body: 'Premium motion, campaign visuals, and cinematic narrative surfaces.',
    media: { type: 'image', src: '/illustrations/edtech.png' } satisfies SurfaceMedia,
  },
];

const heroGalleryTiles: Array<{
  title: string;
  note: string;
  media: SurfaceMedia;
}> = [
  {
    title: 'Creator launch',
    note: 'Campaign frame',
    media: { type: 'image', src: '/videos/samples/cr-launch.png' },
  },
  {
    title: 'Influencer persona',
    note: 'Character memory',
    media: { type: 'image', src: '/videos/samples/influncer-persona.png' },
  },
  {
    title: 'Product motion',
    note: 'Ad visual',
    media: { type: 'image', src: '/videos/samples/earth.png' },
  },
  {
    title: 'Shorts pipeline',
    note: 'Vertical publishing',
    media: { type: 'video', src: '/videos/samples/tamil-education-9x16.mp4' },
  },
];

const heroBackgroundMedia: SurfaceMedia = {
  type: 'video',
  src: '/videos/samples/hindi-festival-9x16.mp4',
  poster: '/illustrations/startup.png',
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

function MediaSurface({ media, alt, className }: { media: SurfaceMedia; alt: string; className?: string }) {
  if (media.type === 'video') {
    return <LandingVideo src={media.src} poster={media.poster} className={className} />;
  }

  return <img src={media.src} alt={alt} className={className} loading="lazy" />;
}

export function PublicStudioLanding({ videos, images }: { videos: InspirationVideo[]; images: InspirationImage[] }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentHash, setCurrentHash] = useState('#hero');
  const [communityFilter, setCommunityFilter] = useState<'all' | 'videos' | 'images'>('all');

  useEffect(() => {
    const updateHash = () => setCurrentHash(window.location.hash || '#hero');
    updateHash();
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

  const communityItems = useMemo(
    () =>
      [
        ...(communityFilter === 'all' || communityFilter === 'videos'
          ? videos.map((video) => ({ type: 'video' as const, item: video }))
          : []),
        ...(communityFilter === 'all' || communityFilter === 'images'
          ? images.map((image) => ({ type: 'image' as const, item: image }))
          : []),
      ]
        .sort((a, b) => new Date(b.item.created_at).getTime() - new Date(a.item.created_at).getTime())
        .slice(0, 18),
    [communityFilter, images, videos],
  );

  return (
    <div className="min-h-screen overflow-x-clip bg-[hsl(var(--color-bg))] text-[hsl(var(--color-text))]">
      <div className="flex min-h-screen max-w-full overflow-x-clip">
        <StudioSidebar
          mobileOpen={mobileOpen}
          onOpenMobile={() => setMobileOpen(true)}
          onCloseMobile={() => setMobileOpen(false)}
          currentHash={currentHash}
        />

        <main className="min-w-0 max-w-full flex-1 overflow-x-clip">
          <div className="mx-auto flex min-h-screen w-full max-w-[1680px] flex-col px-3 pb-10 sm:px-4 lg:px-6 lg:pb-12 xl:px-8 xl:pb-14">
            <section id="hero" className="scroll-mt-24 pt-2 md:pt-3 xl:pt-6">
              <div className="hidden items-center justify-between gap-4 pb-5 xl:flex">
                <div className="inline-flex items-center gap-3 rounded-full border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-surface-glass)/0.34)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[hsl(var(--color-muted))] backdrop-blur-md">
                  Public Studio
                  <span className="h-1 w-1 rounded-full bg-[hsl(var(--color-accent))]" />
                  AI video creation
                </div>
                <div className="flex items-center gap-2">
                  <ToggleTheme />
                  <Link
                    href="/login"
                    className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.56)] bg-[hsl(var(--color-surface-glass)/0.48)] px-4 py-2 text-sm font-medium backdrop-blur-md"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-text))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-bg))]"
                  >
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="rangmanch-floating-hero relative overflow-hidden rounded-[28px] sm:rounded-[32px] xl:rounded-[36px]">
                <HeroBackgroundVideo
                  src={heroBackgroundMedia.src}
                  poster={heroBackgroundMedia.poster}
                />
                <div className="relative z-10 grid min-h-[500px] gap-5 px-4 py-5 sm:min-h-[540px] sm:px-6 sm:py-7 md:min-h-[580px] lg:min-h-[640px] lg:gap-6 lg:px-7 lg:py-8 xl:grid-cols-[1.1fr_0.9fr] xl:px-8 xl:py-8">
                  <div className="flex flex-col justify-between gap-8">
                    <div className="max-w-2xl space-y-5">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.54)] bg-[hsl(var(--color-bg)/0.22)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-text))] backdrop-blur-md">
                        <span className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--color-accent))]" />
                        Make 'One Day' your 'Day One
                      </div>
                      <div className="space-y-3">
                        <h1 className="max-w-3xl font-heading text-[2.25rem] font-extrabold tracking-tight text-[hsl(var(--color-text))] sm:text-5xl xl:text-6xl">
                          Create cinematic AI videos from text, images, and character workflows.
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-[hsl(var(--color-muted))] sm:text-base sm:leading-7">
                          RangManch AI brings together text-to-video, image animation, AI influencer workflows, and short-form publishing inside one visual-first studio.
                        </p>
                      </div>
                      <HeroPromptBar />
                    </div>

                {/*    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {showcaseTiles.map((tile, index) => (
                        <motion.div
                          key={tile.title}
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.42, delay: 0.12 + index * 0.06, ease: 'easeOut' }}
                          className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.4)] bg-[hsl(var(--color-bg)/0.18)] backdrop-blur-md"
                        >
                          <div className="relative aspect-[5/4] md:aspect-[4/3] xl:aspect-[4/3]">
                            <MediaSurface media={tile.media} alt={tile.title} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.92),transparent_58%)]" />
                            <div className="absolute inset-x-0 bottom-0 p-4">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-muted))]">{tile.eyebrow}</p>
                              <p className="mt-1 text-lg font-semibold text-[hsl(var(--color-text))]">{tile.title}</p>
                              <p className="mt-1 line-clamp-2 text-xs leading-5 text-[hsl(var(--color-muted))]">{tile.body}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div> */}
                  </div>

                  <div className="flex flex-col gap-4 xl:pl-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {heroGalleryTiles.map((tile, index) => (
                        <motion.div
                          key={tile.title}
                          initial={{ opacity: 0, y: 18 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.42, delay: 0.08 + index * 0.04, ease: 'easeOut' }}
                          className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-bg)/0.18)] backdrop-blur-md"
                        >
                          <div className="relative aspect-[4/3]">
                            <MediaSurface media={tile.media} alt={tile.title} className="h-full w-full object-cover" />
                            <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.94),transparent_58%)]" />
                            <div className="absolute inset-x-0 bottom-0 p-3">
                              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-muted))]">{tile.note}</p>
                              <p className="mt-1 text-sm font-semibold text-[hsl(var(--color-text))]">{tile.title}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                      {toolTiles.map((tool, index) => {
                        const Icon = tool.icon;
                        return (
                          <motion.div
                            key={tool.title}
                            initial={{ opacity: 0, x: 16 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.42, delay: 0.14 + index * 0.05, ease: 'easeOut' }}
                          >
                            <Link
                              href={tool.href}
                              className="group block overflow-hidden rounded-[26px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-bg)/0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:border-[hsl(var(--color-border)/0.68)]"
                            >
                              <div className="relative aspect-[16/10]">
                                <MediaSurface media={tool.media} alt={tool.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                                <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.94),transparent_54%)]" />
                                <div className="absolute left-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.62)] bg-[hsl(var(--color-bg)/0.4)] backdrop-blur-md">
                                  <Icon className="h-4.5 w-4.5" />
                                </div>
                                <div className="absolute inset-x-0 bottom-0 p-4">
                                  <p className="text-base font-semibold text-[hsl(var(--color-text))]">{tool.title}</p>
                                  <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">{tool.subtitle}</p>
                                </div>
                              </div>
                            </Link>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="tools" className="scroll-mt-24 pt-8 lg:pt-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="rangmanch-section-eyebrow">Tool launcher</p>
                  <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Launch the workflow you need, not a maze of settings.</h2>
                </div>
                <Link href="/signup" className="hidden rounded-full border border-[hsl(var(--color-border)/0.5)] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] sm:inline-flex">
                  Open studio
                </Link>
              </div>
              <div className="mt-5 hidden gap-4 sm:grid sm:grid-cols-2 xl:grid-cols-5">
                {toolTiles.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.title}
                      href={tool.href}
                      className="group overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.22)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                    >
                      <div className="relative aspect-[4/5]">
                        <MediaSurface media={tool.media} alt={tool.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.96),transparent_55%)]" />
                        <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.4)] px-3 py-1.5 text-xs font-medium backdrop-blur-md">
                          <Icon className="h-4 w-4" />
                          {tool.title}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-4">
                          <p className="text-lg font-semibold">{tool.title}</p>
                          <p className="mt-1 text-sm leading-6 text-[hsl(var(--color-muted))]">{tool.subtitle}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="-mx-3 mt-5 overflow-x-auto px-3 sm:hidden">
                <div className="flex w-max gap-3 pb-1">
                  {toolTiles.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Link
                        key={tool.title}
                        href={tool.href}
                        className="group block w-[78vw] max-w-[320px] shrink-0 overflow-hidden rounded-[26px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.22)] backdrop-blur-md transition duration-300 active:scale-[0.99]"
                      >
                        <div className="relative aspect-[4/5]">
                          <MediaSurface media={tool.media} alt={tool.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
                          <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.96),transparent_55%)]" />
                          <div className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.4)] px-3 py-1.5 text-xs font-medium backdrop-blur-md">
                            <Icon className="h-4 w-4" />
                            {tool.title}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-4">
                            <p className="text-lg font-semibold">{tool.title}</p>
                            <p className="mt-1 text-sm leading-6 text-[hsl(var(--color-muted))]">{tool.subtitle}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>

            <section id="community" className="scroll-mt-24 pt-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="rangmanch-section-eyebrow">Community / Explore</p>
                  <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Browse public inspiration in a live creative wall.</h2>
                </div>
                <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-surface-glass)/0.28)] p-1 backdrop-blur-md">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'videos', label: 'Videos' },
                    { key: 'images', label: 'Images' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setCommunityFilter(item.key as 'all' | 'videos' | 'images')}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        communityFilter === item.key
                          ? 'bg-[hsl(var(--color-text))] text-[hsl(var(--color-bg))]'
                          : 'text-[hsl(var(--color-muted))] hover:text-[hsl(var(--color-text))]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 columns-1 gap-4 md:columns-2 xl:columns-4">
                {communityItems.length === 0 ? (
                  <GlassPanel className="mb-4 px-5 py-8 text-sm text-[hsl(var(--color-muted))]">
                    Community creations are loading. Published videos and images will appear here automatically.
                  </GlassPanel>
                ) : null}

                {communityItems.map((entry) => {
                  if (entry.type === 'video') {
                    const video = entry.item;
                    return (
                      <article
                        key={`video-${video.id}`}
                        className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.38)] bg-[hsl(var(--color-surface-glass)/0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                      >
                        <div style={{ aspectRatio: aspectRatioToCss(video.aspect_ratio) }}>
                          <LandingVideo src={video.video_url} poster={video.thumbnail_url || undefined} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                        </div>
                        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.64)] bg-[hsl(var(--color-bg)/0.5)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
                          <Layers3 className="h-3.5 w-3.5" />
                          {video.model_key}
                        </div>
                        <div className="absolute right-3 top-3 rounded-full border border-[hsl(var(--color-border)/0.64)] bg-[hsl(var(--color-bg)/0.5)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
                          {video.duration_seconds}s
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.94),transparent)] p-4">
                          <p className="line-clamp-1 text-base font-semibold">{video.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{video.prompt}</p>
                        </div>
                      </article>
                    );
                  }

                  const image = entry.item;
                  return (
                    <article
                      key={`image-${image.id}`}
                      className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.38)] bg-[hsl(var(--color-surface-glass)/0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                    >
                      <div style={{ aspectRatio: aspectRatioToCss(image.aspect_ratio) }}>
                        <img src={image.image_url} alt={image.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" loading="lazy" />
                      </div>
                      <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.64)] bg-[hsl(var(--color-bg)/0.5)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
                        <Layers3 className="h-3.5 w-3.5" />
                        {image.model_key}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.94),transparent)] p-4">
                        <p className="line-clamp-1 text-base font-semibold">{image.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{image.prompt}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>

            <section id="pricing" className="scroll-mt-24 pt-10">
              <div className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-3">
                  <p className="rangmanch-section-eyebrow">Plans</p>
                  <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Move from testing to production without changing your workflow.</h2>
                  <p className="max-w-2xl text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                    Start with the free studio, then move into creator-grade packs when you need more renders, more voice, and premium output.
                  </p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Link href="/pricing" className="inline-flex rounded-full bg-[hsl(var(--color-text))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-bg))]">
                      View pricing
                    </Link>
                    <Link href="/signup" className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.52)] px-5 py-2.5 text-sm font-medium">
                      Start free
                    </Link>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {[
                    ['Free', '40 credits', 'Start testing image, voice, and first renders.'],
                    ['Starter', '200 credits', 'Good for repeat creator workflows and short-form output.'],
                    ['Creator', '550 credits', 'Built for serious publishing and balanced premium usage.'],
                  ].map(([name, credits, blurb]) => (
                    <div
                      key={name}
                      className="rounded-[26px] border border-[hsl(var(--color-border)/0.44)] bg-[hsl(var(--color-surface-glass)/0.24)] p-4 backdrop-blur-md"
                    >
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="mt-4 text-2xl font-extrabold tracking-tight">{credits}</p>
                      <p className="mt-3 text-sm leading-6 text-[hsl(var(--color-muted))]">{blurb}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="pt-10">
              <LandingFooter />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
