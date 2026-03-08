'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  Bot,
  ChevronDown,
  Clapperboard,
  Copy,
  ExternalLink,
  Film,
  Heart,
  ImageIcon,
  MessageSquare,
  Search,
  Sparkles,
  Tag,
  Wand2,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { StatusChip } from '@/components/ui/StatusChip';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetSearchItem, AssetTagFacet, GeneratedImage, InspirationImage, InspirationVideo, Video } from '@/types/api';

type Props = {
  userId: string;
  userName: string;
};

type MediaFilter = 'all' | 'video' | 'image';
type InspirationFilter = 'all' | 'video' | 'image';
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

const storyCards = [
  {
    title: 'Music Video',
    description: 'Beat-synced scenes and stylized visuals.',
    templateKey: 'music-video',
    titleHint: 'Music Video Concept',
    gradient:
      'radial-gradient(circle at top right, hsl(265 88% 66% / 0.42), transparent 52%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
  },
  {
    title: 'Explainer Video',
    description: 'Clear business storytelling with voice.',
    templateKey: 'explainer-video',
    titleHint: 'Explainer Video',
    gradient:
      'radial-gradient(circle at top left, hsl(160 82% 45% / 0.33), transparent 56%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
  },
  {
    title: 'Character Vlog',
    description: 'Consistent persona-led short videos.',
    templateKey: 'character-vlog',
    titleHint: 'Character Vlog',
    gradient:
      'radial-gradient(circle at top right, hsl(193 87% 60% / 0.33), transparent 56%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
  },
  {
    title: 'ASMR Video',
    description: 'Mood-centric, calming cinematic cuts.',
    templateKey: 'asmr-video',
    titleHint: 'ASMR Video',
    gradient:
      'radial-gradient(circle at top left, hsl(190 84% 58% / 0.33), transparent 56%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
  },
  {
    title: 'Build Storyboard',
    description: 'Turn your idea into scene-by-scene flow.',
    templateKey: 'storyboard',
    titleHint: 'Storyboard Draft',
    gradient:
      'radial-gradient(circle at top right, hsl(275 72% 60% / 0.3), transparent 56%), linear-gradient(145deg, hsl(var(--color-surface)), hsl(var(--color-elevated)))',
  },
];

const aiToolRows = [
  {
    title: 'Lip-Sync Video',
    description: 'Make any avatar or subject talk naturally.',
    href: '/create',
    icon: AudioLines,
  },
  {
    title: 'Motion-Sync Video',
    description: 'Drive shots with expressive movement energy.',
    href: '/create',
    icon: Film,
  },
  {
    title: 'Video Upscale',
    description: 'Improve clarity and output quality quickly.',
    href: '/create',
    icon: Sparkles,
  },
  {
    title: 'Chat to Edit',
    description: 'Refine prompt and composition conversationally.',
    href: '/images',
    icon: MessageSquare,
  },
  {
    title: 'Edit Image',
    description: 'Touch up style, framing, and creative details.',
    href: '/images',
    icon: ImageIcon,
  },
  {
    title: 'Image to Prompt',
    description: 'Extract reusable creative directions from images.',
    href: '/images',
    icon: Bot,
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
  const [inspirationFilter, setInspirationFilter] = useState<InspirationFilter>('all');
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
    if (inspirationFilter === 'video' && videoInspiration.length === 0 && imageInspiration.length > 0) {
      setInspirationFilter('all');
      return;
    }
    if (inspirationFilter === 'image' && imageInspiration.length === 0 && videoInspiration.length > 0) {
      setInspirationFilter('all');
    }
  }, [inspirationFilter, imageInspiration.length, videoInspiration.length]);

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
  const inspirationItems = useMemo(() => {
    if (inspirationFilter === 'video') return videoInspiration;
    if (inspirationFilter === 'image') return imageInspiration;
    return [...videoInspiration, ...imageInspiration].sort((a, b) => {
      const left = new Date(a.created_at).getTime();
      const right = new Date(b.created_at).getTime();
      return right - left;
    });
  }, [imageInspiration, inspirationFilter, videoInspiration]);

  const copyPrompt = async (prompt: string) => {
    await navigator.clipboard.writeText(prompt);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1500);
  };

  const downloadFromUrl = (url: string | null, fallbackName: string, extension: 'png' | 'mp4') => {
    const resolved = toAbsoluteUrl(url);
    if (!resolved) return;
    const safeName = fallbackName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || extension;
    const link = document.createElement('a');
    link.href = `/api/download?url=${encodeURIComponent(resolved)}&filename=${encodeURIComponent(`${safeName}.${extension}`)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const remixInStudio = async (item: DashboardInspirationItem) => {
    await copyPrompt(item.prompt);
    if (isVideoInspiration(item)) {
      window.location.href = '/create';
      return;
    }
    window.location.href = '/images';
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
      <section className="overflow-hidden rounded-[32px]">
        <div
          className="rangmanch-studio-panel-strong space-y-5 rounded-[32px] p-5 sm:p-8"
          style={{
            background:
              'radial-gradient(circle at top center, hsl(var(--color-accent) / 0.22), transparent 32%), radial-gradient(circle at 20% 80%, hsl(260 80% 62% / 0.18), transparent 45%), linear-gradient(145deg, hsl(var(--color-surface) / 0.76), hsl(var(--color-elevated) / 0.73))',
          }}
        >
          <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr] xl:items-end">
            <div className="space-y-4">
              <Badge className="bg-[hsl(var(--color-accent)/0.14)] text-text">Creator workspace</Badge>
              <div className="space-y-3">
                <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text sm:text-5xl xl:text-6xl">
                  Welcome back, {userName}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-muted sm:text-base sm:leading-7">
                  Launch a new render, resume recent work, and browse community inspiration from one calmer studio home.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/create"><Button className="gap-2">New video <ArrowRight className="h-4 w-4" /></Button></Link>
                <Link href="/images"><Button variant="secondary" className="gap-2">Create image <ImageIcon className="h-4 w-4" /></Button></Link>
                <Link href="/influencer"><Button variant="secondary" className="gap-2">AI Influencer <Sparkles className="h-4 w-4" /></Button></Link>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="rangmanch-matte-surface rounded-[24px] p-4">
                <p className="rangmanch-section-eyebrow">All creations</p>
                {loading ? <div className="mt-3 h-8 w-14 animate-pulse rounded-full bg-[hsl(var(--color-border))]" /> : <p className="mt-3 font-heading text-3xl font-extrabold text-text">{assetCounts.all}</p>}
              </div>
              <div className="rangmanch-matte-surface rounded-[24px] p-4">
                <p className="rangmanch-section-eyebrow">Videos</p>
                {loading ? <div className="mt-3 h-8 w-14 animate-pulse rounded-full bg-[hsl(var(--color-border))]" /> : <p className="mt-3 font-heading text-3xl font-extrabold text-text">{assetCounts.video}</p>}
              </div>
              <div className="rangmanch-matte-surface rounded-[24px] p-4">
                <p className="rangmanch-section-eyebrow">Images</p>
                {loading ? <div className="mt-3 h-8 w-14 animate-pulse rounded-full bg-[hsl(var(--color-border))]" /> : <p className="mt-3 font-heading text-3xl font-extrabold text-text">{assetCounts.image}</p>}
              </div>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-center gap-2 rounded-full border border-[hsl(var(--color-border))/0.8] bg-[hsl(var(--color-surface)/0.46)] px-3 py-2 backdrop-blur-xl">
            {[
              //{ label: 'Story', Icon: Sparkles },
              { label: 'Video', Icon: Film },
              { label: 'Image', Icon: ImageIcon },
              { label: 'Character', Icon: Wand2 },
              //{ label: 'Audio', Icon: AudioLines },
            ].map(({ label, Icon }) => (
              <button
                key={label}
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-transparent px-3 py-2 text-sm font-semibold text-text transition hover:border-[hsl(var(--color-border))] hover:bg-[hsl(var(--color-bg)/0.4)]"
              >
                <Icon className="h-4 w-4 text-[hsl(var(--color-accent))]" strokeWidth={1.5} />
                {label}
                <ChevronDown className="h-3.5 w-3.5 text-muted" strokeWidth={1.5} />
              </button>
            ))}
          </div>

      {/*    <div className="mx-auto w-full max-w-3xl">
            <label className="sr-only" htmlFor="dashboard-search">Search creations</label>
            <div className="flex items-center gap-3 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] px-4 py-3 shadow-soft backdrop-blur-xl">
              <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" strokeWidth={1.5} />
              <input
                id="dashboard-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search prompts, tags, styles, scenes..."
                className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
              />
            </div>
          </div>
      

          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/create"><Button className="gap-2">Create video <ArrowRight className="h-4 w-4" /></Button></Link>
            <Link href="/images"><Button variant="secondary" className="gap-2">Generate image <ImageIcon className="h-4 w-4" /></Button></Link>
            <Link href="/influencer"><Button variant="secondary" className="gap-2">Influencer studio <Sparkles className="h-4 w-4" /></Button></Link>
          </div>
        */}  

        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="rangmanch-section-eyebrow">Start points</p>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Create story</h2>
            <p className="mt-1 text-sm text-muted">High-impact starting points with production-ready defaults.</p>
          </div>
          {/*<Button variant="secondary" className="h-9 rounded-full px-4 text-xs">More</Button> */}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {storyCards.map((item) => (
            <Link
              key={item.title}
              href={`/create?template=${encodeURIComponent(item.templateKey)}&title=${encodeURIComponent(item.titleHint)}`}
              className="group min-w-[250px] flex-1 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] p-4 shadow-soft transition hover:-translate-y-0.5 sm:min-w-[280px]"
              style={{ background: item.gradient }}
            >
              <p className="font-heading text-2xl font-extrabold text-text">{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-muted">{item.description}</p>
              <div className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-bg)/0.6)] px-3 py-1.5 text-sm font-semibold text-text backdrop-blur-md">
                Create
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" strokeWidth={1.5} />
              </div>
            </Link>
          ))}
        </div>
      </section>



      <section id="inspiration" className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="rangmanch-section-eyebrow">Discover</p>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Community</h2>
            <p className="mt-1 text-sm text-muted">Trending inspiration from approved, high-quality public creations.</p>
          </div>
          <div className="flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.7)] p-1 backdrop-blur-md">
            {(['all', 'video', 'image'] as const).map((value) => (
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
                {value === 'all'
                  ? `All (${videoInspiration.length + imageInspiration.length})`
                  : value === 'video'
                    ? `Videos (${videoInspiration.length})`
                    : `Images (${imageInspiration.length})`}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="columns-1 gap-4 sm:columns-2 md:columns-3 xl:columns-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`inspiration-skeleton-${index}`}
                className="mb-4 h-56 break-inside-avoid animate-pulse rounded-[var(--radius-lg)] bg-[hsl(var(--color-border))]"
              />
            ))}
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 md:columns-3 xl:columns-4">
            {inspirationItems.map((item) => {
            const videoItem = isVideoInspiration(item) ? item : null;
            const imageItem = !videoItem ? (item as InspirationImage) : null;
            const preview =
              videoItem
                ? toAbsoluteUrl(videoItem.thumbnail_url) ||
                  videoItem.thumbnail_url ||
                  toAbsoluteUrl(videoItem.video_url) ||
                  videoItem.video_url
                : toAbsoluteUrl(imageItem?.image_url ?? '') ||
                  imageItem?.image_url ||
                  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80';
            const meta = videoItem ? `${videoItem.duration_seconds}s` : timeAgo(item.created_at);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedInspirationItem(item)}
                className="group relative mb-4 block w-full break-inside-avoid overflow-hidden rounded-[var(--radius-lg)] text-left shadow-soft"
                style={{ aspectRatio: aspectRatioToCss(videoItem ? videoItem.aspect_ratio : imageItem?.aspect_ratio) }}
              >
                {videoItem ? (
                  <video
                    src={toAbsoluteUrl(videoItem.video_url) ?? videoItem.video_url}
                    poster={toAbsoluteUrl(videoItem.thumbnail_url) ?? videoItem.thumbnail_url}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <img src={preview} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.8)] via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                <span className="absolute right-3 top-3 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.7)] px-2 py-1 text-[10px] font-semibold text-text backdrop-blur-md">
                  {meta}
                </span>
                <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.7)] px-2 py-1 text-[10px] font-semibold text-text backdrop-blur-md">
                  <Heart className={`h-3.5 w-3.5 ${item.liked_by_user ? 'fill-current' : ''}`} strokeWidth={1.75} />
                  {item.like_count}
                </span>
                <div className="absolute left-3 top-12 flex items-center gap-2 opacity-0 transition group-hover:opacity-100">
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md"
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleLikeInspiration(item);
                    }}
                  >
                    <Heart className={`h-4 w-4 text-text ${item.liked_by_user ? 'fill-current' : ''}`} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md"
                    onClick={(event) => {
                      event.stopPropagation();
                      downloadFromUrl(videoItem ? videoItem.video_url : imageItem?.image_url ?? null, item.title, videoItem ? 'mp4' : 'png');
                    }}
                  >
                    <Clapperboard className="h-4 w-4 text-text" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remixInStudio(item);
                    }}
                  >
                    <Wand2 className="h-4 w-4 text-text" strokeWidth={1.75} />
                  </button>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.9)] to-transparent p-3">
                  <p className="line-clamp-1 text-sm font-semibold text-text">{item.title}</p>
                </div>
                <div className="absolute inset-x-3 bottom-12 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.66)] p-3 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                  <p className="line-clamp-2 text-xs leading-5 text-text">{item.prompt}</p>
                </div>
              </button>
            );
            })}
          </div>
        )}
        {!loading && inspirationItems.length === 0 ? (
          <Card className="rangmanch-studio-panel rounded-[28px] border border-dashed border-[hsl(var(--color-border))] bg-transparent p-8 text-center">
            <p className="font-heading text-lg font-extrabold text-text">No inspiration items yet</p>
            <p className="mt-2 text-sm text-muted">
              Publish a high-quality generated {inspirationFilter === 'video' ? 'video' : inspirationFilter === 'image' ? 'image' : 'image or video'} to start building this feed.
            </p>
          </Card>
        ) : null}
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="rangmanch-section-eyebrow">Library</p>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Your studio feed</h2>
            <p className="mt-1 text-sm text-muted">Manage, publish, and download your latest creations.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/images"><Button variant="secondary">Create image</Button></Link>
            <Link href="/create"><Button>Create video</Button></Link>
          </div>
        </div>

        {error && <Card className="rangmanch-studio-panel border-none bg-transparent"><p className="text-sm text-[hsl(var(--color-danger))]">{error}</p></Card>}

        <Card className="rangmanch-studio-panel space-y-4 border-none bg-transparent backdrop-blur-md">
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

          <div className="grid gap-4">
            <div className="rangmanch-filter-bar rounded-[24px] p-4">
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`asset-skeleton-${index}`} className="h-64 animate-pulse rounded-[var(--radius-lg)] bg-[hsl(var(--color-border))]" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <Card className="rangmanch-studio-panel text-center border-none bg-transparent">
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
          <div className="columns-1 gap-4 sm:columns-2 md:columns-3 xl:columns-4 2xl:columns-5">
            {highlightedAssets.map((asset) => {
              const preview = toAbsoluteUrl(asset.thumbnail_url) ?? toAbsoluteUrl(asset.asset_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80';
              const openHref = asset.content_type === 'video' ? `/videos/${asset.id}` : `/images`;
              return (
                <div
                  key={asset.id}
                  className="group relative mb-4 block break-inside-avoid overflow-hidden rounded-[var(--radius-lg)] shadow-soft"
                  style={{ aspectRatio: aspectRatioToCss(asset.aspect_ratio) }}
                >
                  <img src={preview} alt={asset.title || 'Untitled asset'} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.84)] via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
                  <div className="absolute right-2 top-2 z-10 flex max-w-[calc(100%-0.75rem)] flex-wrap items-center justify-end gap-1.5 opacity-0 transition group-hover:opacity-100 sm:right-3 sm:top-3 sm:gap-2">
                    <Button
                      variant="secondary"
                      className="pointer-events-auto h-8 w-8 rounded-full p-0"
                      onClick={() => void downloadAsset(asset)}
                      disabled={downloadingId === asset.id || !asset.asset_url}
                      title="Download"
                    >
                      <Clapperboard className="h-4 w-4" strokeWidth={1.75} />
                    </Button>
                    <Button
                      variant="secondary"
                      className="pointer-events-auto h-8 rounded-full px-3 text-xs font-semibold leading-none"
                      onClick={() => void togglePublish(asset)}
                      disabled={publishingAssetId === asset.id}
                    >
                      {publishingAssetId === asset.id ? '...' : asset.is_public_inspiration ? 'Unpublish' : 'Publish'}
                    </Button>
                    <Link href={openHref} className="pointer-events-auto">
                      <Button variant="secondary" className="h-8 w-8 rounded-full p-0" title="Open">
                        <Wand2 className="h-4 w-4" strokeWidth={1.75} />
                      </Button>
                    </Link>
                  </div>
                  <div className="absolute inset-x-3 bottom-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.66)] p-3 opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="line-clamp-1 text-xs font-semibold text-text">{asset.title || `Untitled ${mediaLabel(asset.content_type)}`}</p>
                      <StatusChip variant={asset.status === 'completed' ? 'success' : asset.status === 'failed' ? 'danger' : 'warning'}>
                        {formatStatus(asset.status)}
                      </StatusChip>
                    </div>
                    <p className="line-clamp-2 text-xs leading-5 text-text">{asset.prompt}</p>
                    <p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                      {mediaLabel(asset.content_type)} • {asset.aspect_ratio} • {asset.resolution} • {timeAgo(asset.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
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
