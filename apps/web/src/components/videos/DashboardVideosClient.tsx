'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Clapperboard, Copy, ExternalLink, Film, Heart, ImageIcon, Layers3, Search, Sparkles, Tag, Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';
import { Modal } from '@/components/ui/Modal';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetSearchItem, AssetTagFacet, GeneratedImage, InspirationImage, InspirationVideo, Video } from '@/types/api';

type Props = {
  userId: string;
  userName: string;
};

type MediaFilter = 'all' | 'video' | 'image';
type InspirationFilter = 'video' | 'image';
type DashboardInspirationItem = InspirationImage | InspirationVideo;

function formatStatus(status: string) {
  if (status === 'processing') return 'Processing';
  if (status === 'completed') return 'Completed';
  if (status === 'failed') return 'Failed';
  return 'Draft';
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

function toAbsoluteUrl(url: string | null) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

function mediaLabel(contentType: string) {
  return contentType === 'image' ? 'Image' : 'Video';
}

function isVideoInspiration(item: DashboardInspirationItem): item is InspirationVideo {
  return 'provider_name' in item;
}

function emptyCopy(mediaFilter: MediaFilter) {
  if (mediaFilter === 'image') {
    return {
      title: 'No images yet',
      description: 'Generate your first visual and it will appear here.',
    };
  }
  if (mediaFilter === 'video') {
    return {
      title: 'No videos yet',
      description: 'Create your first video in under a minute.',
    };
  }
  return {
    title: 'No creations yet',
    description: 'Generate an image or video and it will appear in your dashboard.',
  };
}

function toAssetFromImage(image: GeneratedImage): AssetSearchItem {
  return {
    id: image.id,
    content_type: 'image',
    title: image.prompt.split('.').find(Boolean)?.trim() || 'Generated image',
    model_key: image.model_key,
    resolution: image.resolution,
    aspect_ratio: image.aspect_ratio,
    prompt: image.prompt,
    thumbnail_url: image.thumbnail_url || image.image_url,
    asset_url: image.image_url,
    status: image.status,
    created_at: image.created_at,
    reference_urls: image.reference_urls,
    auto_tags: image.auto_tags,
    user_tags: image.user_tags,
    is_public_inspiration: image.is_public_inspiration,
    moderation_status: image.moderation_status,
    inspiration_score: image.inspiration_score,
    like_count: image.like_count,
  };
}

function toAssetFromVideo(video: Video): AssetSearchItem {
  return {
    id: video.id,
    content_type: 'video',
    title: video.title || 'Generated video',
    model_key: video.selected_model || video.provider_name || 'video',
    resolution: video.resolution,
    aspect_ratio: video.aspect_ratio,
    prompt: video.script,
    thumbnail_url: video.thumbnail_url,
    asset_url: video.output_url,
    status: video.status,
    created_at: video.created_at,
    reference_urls: video.reference_images,
    auto_tags: video.auto_tags,
    user_tags: video.user_tags,
    is_public_inspiration: video.is_public_inspiration,
    moderation_status: video.moderation_status,
    inspiration_score: video.inspiration_score,
    like_count: video.like_count,
  };
}

function buildTagFacets(assets: AssetSearchItem[]): AssetTagFacet[] {
  const counts = new Map<string, number>();
  for (const asset of assets) {
    for (const tag of [...asset.auto_tags, ...asset.user_tags]) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

const workflowCards = [
  {
    title: 'Create Reel Video',
    description: 'Script, voice, scene, and render in one guided studio.',
    href: '/create',
    cta: 'Open video studio',
    gradient: 'radial-gradient(circle at top left, hsl(var(--color-accent) / 0.34), transparent 38%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
    icon: Film,
  },
  {
    title: 'Generate Premium Visuals',
    description: 'Posters, thumbnails, and scene-rich image generations.',
    href: '/images',
    cta: 'Open image studio',
    gradient: 'radial-gradient(circle at top left, hsl(190 88% 58% / 0.22), transparent 36%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
    icon: ImageIcon,
  },
  {
    title: 'Build AI Influencer',
    description: 'Lock a persona, keep style memory, and generate consistently.',
    href: '/influencer',
    cta: 'Open influencer studio',
    gradient: 'radial-gradient(circle at top left, hsl(142 71% 45% / 0.2), transparent 34%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
    icon: Wand2,
  },
  {
    title: 'Start From Inspiration',
    description: 'Study reference outputs before jumping into your own workflow.',
    href: '#inspiration',
    cta: 'Browse inspiration',
    gradient: 'radial-gradient(circle at top left, hsl(275 70% 62% / 0.18), transparent 34%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
    icon: Layers3,
  },
];

export function DashboardVideosClient({ userId, userName }: Props) {
  const [assets, setAssets] = useState<AssetSearchItem[]>([]);
  const [allAssets, setAllAssets] = useState<AssetSearchItem[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [imageInspiration, setImageInspiration] = useState<InspirationImage[]>([]);
  const [videoInspiration, setVideoInspiration] = useState<InspirationVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [inspirationFilter, setInspirationFilter] = useState<InspirationFilter>('video');
  const [selectedInspirationItem, setSelectedInspirationItem] = useState<DashboardInspirationItem | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [publishingAssetId, setPublishingAssetId] = useState<string | null>(null);
  const [likingAssetId, setLikingAssetId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDashboardData = async (attempt = 1) => {
      setLoading(true);
      const [imageResults, videoResults, imageRefs, videoRefs] = await Promise.allSettled([
        api.listGeneratedImages(userId),
        api.listVideos(userId),
        api.listImageInspiration(userId),
        api.listVideoInspiration(userId),
      ]);
      if (cancelled) return;

      const creationsLoaded = imageResults.status === 'fulfilled' || videoResults.status === 'fulfilled';
      if (!creationsLoaded && attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 1200));
        if (!cancelled) {
          await loadDashboardData(attempt + 1);
        }
        return;
      }

      if (creationsLoaded) {
        const nextAssets = [
          ...(imageResults.status === 'fulfilled' ? imageResults.value.map(toAssetFromImage) : []),
          ...(videoResults.status === 'fulfilled' ? videoResults.value.map(toAssetFromVideo) : []),
        ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        setAllAssets(nextAssets);
        setError(null);
      } else {
        setAllAssets([]);
        setAssets([]);
        setError('Failed to load creations. Please refresh.');
      }

      setImageInspiration(imageRefs.status === 'fulfilled' ? imageRefs.value : []);
      setVideoInspiration(videoRefs.status === 'fulfilled' ? videoRefs.value : []);
      setLoading(false);
    };

    void loadDashboardData();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    const filtered = allAssets.filter((item) => {
      const matchesMedia = mediaFilter === 'all' || item.content_type === mediaFilter;
      const searchable = `${item.title} ${item.prompt} ${item.auto_tags.join(' ')} ${item.user_tags.join(' ')}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const allTags = [...item.auto_tags, ...item.user_tags].map((tag) => tag.toLowerCase());
      const matchesTags = selectedTags.length === 0 || selectedTags.every((tag) => allTags.includes(tag.toLowerCase()));
      return matchesMedia && matchesQuery && matchesTags;
    });
    setAssets(filtered);
  }, [allAssets, searchQuery, selectedTags, mediaFilter]);

  useEffect(() => {
    const scoped = allAssets.filter((item) => mediaFilter === 'all' || item.content_type === mediaFilter);
    setTagFacets(buildTagFacets(scoped));
  }, [allAssets, mediaFilter]);

  const assetCounts = useMemo(
    () => ({
      all: assets.length,
      image: assets.filter((item) => item.content_type === 'image').length,
      video: assets.filter((item) => item.content_type === 'video').length,
    }),
    [assets],
  );

  const highlightedAssets = useMemo(() => {
    if (mediaFilter !== 'all') {
      return assets.slice(0, 6);
    }
    const videos = assets.filter((item) => item.content_type === 'video').slice(0, 3);
    const images = assets.filter((item) => item.content_type === 'image').slice(0, 3);
    return [...videos, ...images]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);
  }, [assets, mediaFilter]);
  const inspirationItems = inspirationFilter === 'video' ? videoInspiration : imageInspiration;

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1500);
  };

  const downloadAsset = async (asset: AssetSearchItem) => {
    const url = toAbsoluteUrl(asset.asset_url);
    if (!url) return;
    setDownloadingId(asset.id);
    const extension = asset.content_type === 'image' ? 'png' : 'mp4';
    const safeName = (asset.title || asset.content_type)
      .replace(/[^a-z0-9-_]+/gi, '-')
      .toLowerCase() || asset.content_type;
    const link = document.createElement('a');
    link.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${safeName}.${extension}`)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => setDownloadingId(null), 600);
  };

  const togglePublish = async (asset: AssetSearchItem) => {
    setPublishingAssetId(asset.id);
    try {
      const next = await api.publishInspiration(asset.content_type === 'video' ? 'video' : 'image', asset.id, !asset.is_public_inspiration, userId);
      setAllAssets((current) =>
        current.map((item) =>
          item.id === asset.id
            ? {
                ...item,
                is_public_inspiration: next.is_public_inspiration,
                moderation_status: next.moderation_status,
                inspiration_score: next.inspiration_score,
                like_count: next.like_count,
              }
            : item,
        ),
      );
      if (next.moderation_status !== 'approved' && next.is_public_inspiration) {
        setError('Submitted to inspiration review. It will appear after approval.');
      } else {
        setError(null);
      }
      if (asset.content_type === 'video') {
        const refreshed = await api.listVideoInspiration(userId).catch(() => null);
        if (refreshed) setVideoInspiration(refreshed);
      } else {
        const refreshed = await api.listImageInspiration(userId).catch(() => null);
        if (refreshed) setImageInspiration(refreshed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update inspiration publish status.');
    } finally {
      setPublishingAssetId(null);
    }
  };

  const toggleLikeInspiration = async (item: DashboardInspirationItem) => {
    const contentType = isVideoInspiration(item) ? 'video' : 'image';
    setLikingAssetId(item.id);
    try {
      const next = await api.likeInspiration(contentType, item.id, !item.liked_by_user, userId);
      if (isVideoInspiration(item)) {
        setVideoInspiration((current) =>
          current.map((row) => (row.id === item.id ? { ...row, liked_by_user: next.liked, like_count: next.like_count } : row)),
        );
      } else {
        setImageInspiration((current) =>
          current.map((row) => (row.id === item.id ? { ...row, liked_by_user: next.liked, like_count: next.like_count } : row)),
        );
      }
      setSelectedInspirationItem((current) =>
        current && current.id === item.id ? { ...current, liked_by_user: next.liked, like_count: next.like_count } as DashboardInspirationItem : current,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update like.');
    } finally {
      setLikingAssetId(null);
    }
  };

  const emptyState = emptyCopy(mediaFilter);

  return (
    <div className="space-y-6 sm:space-y-8">
      <section
        className="overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] p-5 shadow-soft sm:p-7"
        style={{
          background:
            'radial-gradient(circle at top center, hsl(var(--color-accent) / 0.22), transparent 26%), radial-gradient(circle at bottom left, hsl(196 80% 58% / 0.12), transparent 28%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
        }}
      >
        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-5">
            <Badge className="bg-[hsl(var(--color-accent)/0.14)] text-text">Creator home</Badge>
            <div>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl xl:text-5xl">
                What would you like to create today, {userName.split(' ')[0] || 'Creator'}?
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7 lg:text-lg">
                Jump into video, image, or influencer workflows, then pick up your latest creations and fresh inspiration without leaving the studio.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link href="/create"><Button className="gap-2">Create video <ArrowRight className="h-4 w-4" /></Button></Link>
              <Link href="/images"><Button variant="secondary" className="gap-2">Generate image <ImageIcon className="h-4 w-4" /></Button></Link>
              <Link href="/influencer"><Button variant="secondary" className="gap-2">Influencer studio <Sparkles className="h-4 w-4" /></Button></Link>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)] p-3.5 sm:p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted">All creations</p>
                {loading ? (
                  <div className="mt-2 h-9 w-16 animate-pulse rounded-full bg-[hsl(var(--color-border))]" />
                ) : (
                  <p className="mt-2 font-heading text-2xl font-extrabold text-text sm:text-3xl">{assetCounts.all}</p>
                )}
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)] p-3.5 sm:p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted">Videos</p>
                {loading ? (
                  <div className="mt-2 h-9 w-16 animate-pulse rounded-full bg-[hsl(var(--color-border))]" />
                ) : (
                  <p className="mt-2 font-heading text-2xl font-extrabold text-text sm:text-3xl">{assetCounts.video}</p>
                )}
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)] p-3.5 sm:p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-muted">Images</p>
                {loading ? (
                  <div className="mt-2 h-9 w-16 animate-pulse rounded-full bg-[hsl(var(--color-border))]" />
                ) : (
                  <p className="mt-2 font-heading text-2xl font-extrabold text-text sm:text-3xl">{assetCounts.image}</p>
                )}
              </div>
            </div>
          </div>

          
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Featured workflows</h2>
            <p className="mt-1 text-sm text-muted">Start with a polished studio path instead of a blank page.</p>
          </div>
        </div>
        <Grid className="md:grid-cols-2 xl:grid-cols-4">
          {workflowCards.map((item) => {
            const Icon = item.icon;
            const content = (
              <Card
                className="flex h-full flex-col justify-between border-[hsl(var(--color-border))] p-4 sm:p-5 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_hsl(var(--color-accent)/0.16)]"
                style={{ background: item.gradient }}
              >
                <div className="space-y-4">
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)]">
                    <Icon className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                  </div>
                  <div>
                    <p className="font-heading text-lg font-extrabold text-text sm:text-xl">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
                  </div>
                </div>
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-text">
                  {item.cta}
                  <ArrowRight className="h-4 w-4" />
                </div>
              </Card>
            );
            return item.href.startsWith('#') ? (
              <a key={item.title} href={item.href} className="block">
                {content}
              </a>
            ) : (
              <Link key={item.title} href={item.href} className="block">
                {content}
              </Link>
            );
          })}
        </Grid>
      </section>

      <section id="inspiration" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Inspiration feed</h2>
            <p className="mt-1 text-sm text-muted">Reference-ready outputs to help you start faster and set quality expectations.</p>
          </div>
          <div className="flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-1">
            {(['video', 'image'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setInspirationFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  inspirationFilter === value
                    ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                    : 'text-muted'
                }`}
              >
                {value === 'video' ? 'Videos' : 'Images'}
              </button>
            ))}
          </div>
        </div>
        <Grid className="md:grid-cols-2 xl:grid-cols-3">
          {inspirationItems.map((item) => {
            const preview =
              inspirationFilter === 'video'
                ? toAbsoluteUrl((item as InspirationVideo).thumbnail_url) ||
                  (item as InspirationVideo).thumbnail_url ||
                  toAbsoluteUrl((item as InspirationVideo).video_url) ||
                  (item as InspirationVideo).video_url
                : (item as InspirationImage).image_url;
            const meta =
              inspirationFilter === 'video'
                ? `${(item as InspirationVideo).provider_name} • ${(item as InspirationVideo).duration_seconds}s`
                : `${(item as InspirationImage).creator_name} • ${(item as InspirationImage).aspect_ratio}`;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedInspirationItem(item)}
                className="text-left"
              >
              <Card className="overflow-hidden p-0 transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_50px_hsl(var(--color-accent)/0.14)]">
                <img src={preview} alt={item.title} className="h-48 w-full object-cover sm:h-56" />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-heading text-lg font-extrabold text-text sm:text-xl">{item.title}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">{meta}</p>
                    </div>
                    <Badge>{item.model_key}</Badge>
                  </div>
                  <p className="line-clamp-3 text-sm leading-6 text-muted">{item.prompt}</p>
                  <div className="flex flex-wrap gap-1">
                    {item.tags.slice(0, 4).map((tag) => (
                      <Badge key={`${item.id}-${tag}`}>{tag}</Badge>
                    ))}
                  </div>
                  <div className="inline-flex items-center gap-2 text-sm font-semibold text-text">
                    View details
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </Card>
              </button>
            );
          })}
        </Grid>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Your recent creations</h2>
            <p className="mt-1 text-sm text-muted">Filter images and videos from one unified studio feed.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/images"><Button variant="secondary">Create image</Button></Link>
            <Link href="/create"><Button>Create video</Button></Link>
          </div>
        </div>

        {error && <Card><p className="text-sm text-[hsl(var(--color-danger))]">{error}</p></Card>}

        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {([
              ['all', `All · ${assetCounts.all}`],
              ['video', `Videos · ${assetCounts.video}`],
              ['image', `Images · ${assetCounts.image}`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setMediaFilter(value)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  mediaFilter === value
                    ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                    : 'border border-[hsl(var(--color-border))] text-muted hover:border-[hsl(var(--color-accent)/0.5)] hover:text-text'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Search {mediaFilter === 'all' ? 'creations' : mediaFilter === 'image' ? 'images' : 'videos'}
              </label>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search titles, prompts, scripts, and tags..."
                className="w-full rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
              />
            </div>
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                <Tag className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Filter by tags
              </p>
              <div className="flex flex-wrap gap-2">
                {tagFacets.slice(0, 12).map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() =>
                      setSelectedTags((current) =>
                        current.includes(item.tag) ? current.filter((value) => value !== item.tag) : [...current, item.tag],
                      )
                    }
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      selectedTags.includes(item.tag)
                        ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                        : 'border border-[hsl(var(--color-border))] text-muted'
                    }`}
                  >
                    {item.tag} · {item.count}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {loading ? (
          <Grid className="md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`asset-skeleton-${index}`} className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[hsl(var(--color-border))]" />
            ))}
          </Grid>
        ) : assets.length === 0 ? (
          <Card className="text-center">
            <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--color-border))]">
              {mediaFilter === 'image' ? <ImageIcon className="h-5 w-5 text-muted" /> : <Film className="h-5 w-5 text-muted" />}
            </div>
            <p className="mt-3 font-semibold text-text">{emptyState.title}</p>
            <p className="mt-1 text-sm text-muted">{emptyState.description}</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Link href="/images"><Button variant="secondary">Create image</Button></Link>
              <Link href="/create"><Button>Create video</Button></Link>
            </div>
          </Card>
        ) : (
          <Grid className="md:grid-cols-2 xl:grid-cols-4">
            {highlightedAssets.map((asset) => {
              const preview = toAbsoluteUrl(asset.thumbnail_url) ?? toAbsoluteUrl(asset.asset_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80';
              const openHref = asset.content_type === 'video' ? `/videos/${asset.id}` : `/images`;
              return (
                <Card key={asset.id} className="overflow-hidden p-0 transition duration-300 hover:-translate-y-1 hover:shadow-[0_24px_50px_hsl(var(--color-accent)/0.16)]">
                  <img src={preview} alt={asset.title || 'Untitled asset'} className="h-40 w-full object-cover sm:h-44" />
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="line-clamp-2 font-semibold text-text">{asset.title || `Untitled ${mediaLabel(asset.content_type)}`}</p>
                        <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted">{mediaLabel(asset.content_type)} • {asset.aspect_ratio} • {asset.resolution}</p>
                      </div>
                      <Badge>{formatStatus(asset.status)}</Badge>
                    </div>
                    <div className="min-h-6 flex flex-wrap gap-1">
                      {[...asset.auto_tags.slice(0, 3), ...asset.user_tags.slice(0, 2)].map((tag) => (
                        <Badge key={`${asset.id}-${tag}`}>{tag}</Badge>
                      ))}
                    </div>
                    <p className="text-[11px] uppercase tracking-[0.16em] text-muted">{timeAgo(asset.created_at)}</p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                      <Link href={openHref} className="sm:flex-1">
                        <Button variant="secondary" className="w-full px-3 py-1 text-xs">{asset.content_type === 'video' ? 'Open' : 'Open images'}</Button>
                      </Link>
                      {asset.asset_url && (
                        <Button
                          className="w-full px-3 py-1 text-xs sm:w-auto"
                          onClick={() => void downloadAsset(asset)}
                          disabled={downloadingId === asset.id}
                        >
                          {downloadingId === asset.id ? 'Downloading...' : 'Download'}
                        </Button>
                      )}
                      <Button
                        variant="secondary"
                        className="w-full px-3 py-1 text-xs sm:w-auto"
                        onClick={() => void togglePublish(asset)}
                        disabled={publishingAssetId === asset.id}
                      >
                        {publishingAssetId === asset.id
                          ? 'Updating...'
                          : asset.is_public_inspiration
                            ? 'Unpublish'
                            : 'Publish'}
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </Grid>
        )}

        {!loading && assets.length > highlightedAssets.length && (
          <div className="flex justify-center">
            <Link href={mediaFilter === 'image' ? '/images' : '/dashboard'}>
              <Button variant="secondary" className="gap-2">
                View more creations
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </section>

      {selectedInspirationItem ? (
        <Modal open onClose={() => setSelectedInspirationItem(null)}>
          <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
            <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]">
              {isVideoInspiration(selectedInspirationItem) ? (
                <video
                  src={toAbsoluteUrl(selectedInspirationItem.video_url) ?? selectedInspirationItem.video_url}
                  poster={toAbsoluteUrl(selectedInspirationItem.thumbnail_url) ?? selectedInspirationItem.thumbnail_url}
                  controls
                  className="h-full max-h-[520px] w-full bg-black object-cover"
                />
              ) : (
                <img src={selectedInspirationItem.image_url} alt={selectedInspirationItem.title} className="h-full max-h-[520px] w-full object-cover" />
              )}
            </div>
            <div className="space-y-4">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-2xl font-extrabold tracking-tight text-text">{selectedInspirationItem.title}</h3>
                    <p className="mt-2 text-sm text-muted">
                      {isVideoInspiration(selectedInspirationItem)
                        ? `${selectedInspirationItem.provider_name} • ${selectedInspirationItem.duration_seconds}s`
                        : `${selectedInspirationItem.creator_name} • ${selectedInspirationItem.aspect_ratio}`}
                    </p>
                  </div>
                  <Badge>{selectedInspirationItem.model_key}</Badge>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  type="button"
                  className="gap-2"
                  onClick={() => void toggleLikeInspiration(selectedInspirationItem)}
                  disabled={likingAssetId === selectedInspirationItem.id}
                >
                  <Heart className={`h-4 w-4 ${selectedInspirationItem.liked_by_user ? 'fill-current' : ''}`} />
                  {selectedInspirationItem.like_count}
                </Button>
              </div>

              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Prompt</p>
                  <Button variant="secondary" type="button" onClick={() => void copyPrompt(selectedInspirationItem.prompt)} className="gap-2 px-3 py-1.5 text-xs">
                    <Copy className="h-3.5 w-3.5" />
                    {copiedPrompt ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted">{selectedInspirationItem.prompt}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">Model</p>
                  <p className="mt-2 text-sm font-semibold text-text">{selectedInspirationItem.model_key}</p>
                </div>
                <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-muted">{isVideoInspiration(selectedInspirationItem) ? 'Duration' : 'Aspect ratio'}</p>
                  <p className="mt-2 text-sm font-semibold text-text">
                    {isVideoInspiration(selectedInspirationItem) ? `${selectedInspirationItem.duration_seconds}s` : selectedInspirationItem.aspect_ratio}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedInspirationItem.tags.map((tag) => (
                  <Badge key={`${selectedInspirationItem.id}-${tag}`}>{tag}</Badge>
                ))}
              </div>

              <a
                href={
                  isVideoInspiration(selectedInspirationItem)
                    ? (toAbsoluteUrl(selectedInspirationItem.video_url) ?? selectedInspirationItem.video_url)
                    : (toAbsoluteUrl(selectedInspirationItem.image_url) ?? selectedInspirationItem.image_url)
                }
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text"
              >
                Open original
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
