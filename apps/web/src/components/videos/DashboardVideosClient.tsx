'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  AudioLines,
  Bot,
  ChevronDown,
  Clapperboard,
  Download,
  Copy,
  ExternalLink,
  Film,
  Heart,
  ImageIcon,
  MessageSquare,
  Search,
  Sparkles,
  Tag,
  Trash2,
  Wand2,
  FolderOpen,
  FolderPlus,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { MediaPosterCard } from '@/components/ui/MediaPosterCard';
import { Modal } from '@/components/ui/Modal';
import { StatusChip } from '@/components/ui/StatusChip';
import { ProjectAssignmentDialog } from '@/components/projects/ProjectAssignmentDialog';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetSearchItem, AssetTagFacet, GeneratedImage, InspirationImage, InspirationVideo, Project, Video } from '@/types/api';

type Props = {
  userId: string;
  userName: string;
};

type MediaFilter = 'all' | 'video' | 'image';
type InspirationFilter = 'all' | 'video' | 'image';
type DashboardInspirationItem = InspirationImage | InspirationVideo;

const DASHBOARD_FEED_LIMIT = 8;
const DASHBOARD_COMMUNITY_LIMIT = 6;

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
    project_id: image.project_id,
    mode_id: image.mode_id,
    template_id: image.template_id,
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
    project_id: video.project_id,
    mode_id: video.mode_id,
    template_id: video.template_id,
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
  const cacheKey = `rangmanch:dashboard:v2:${userId}`;
  const [assets, setAssets] = useState<AssetSearchItem[]>([]);
  const [allAssets, setAllAssets] = useState<AssetSearchItem[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [imageInspiration, setImageInspiration] = useState<InspirationImage[]>([]);
  const [videoInspiration, setVideoInspiration] = useState<InspirationVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesLoading, setImagesLoading] = useState(true);
  const [videosLoading, setVideosLoading] = useState(true);
  const [imageCommunityLoading, setImageCommunityLoading] = useState(true);
  const [videoCommunityLoading, setVideoCommunityLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [communityError, setCommunityError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');
  const [inspirationFilter, setInspirationFilter] = useState<InspirationFilter>('all');
  const [selectedInspirationItem, setSelectedInspirationItem] = useState<DashboardInspirationItem | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [publishingAssetId, setPublishingAssetId] = useState<string | null>(null);
  const [likingAssetId, setLikingAssetId] = useState<string | null>(null);
  const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectAssignmentTarget, setProjectAssignmentTarget] = useState<AssetSearchItem | null>(null);
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const creationsLoading = imagesLoading && videosLoading && allAssets.length === 0;
  const communityLoading =
    imageCommunityLoading && videoCommunityLoading && imageInspiration.length === 0 && videoInspiration.length === 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(cacheKey) ?? window.localStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        ts?: number;
        allAssets?: AssetSearchItem[];
        imageInspiration?: InspirationImage[];
        videoInspiration?: InspirationVideo[];
      };
      const hasAnyCachedData =
        (cached.allAssets?.length ?? 0) > 0 ||
        (cached.imageInspiration?.length ?? 0) > 0 ||
        (cached.videoInspiration?.length ?? 0) > 0;
      if (!hasAnyCachedData) return;
      // Use cache immediately even if slightly stale, then revalidate in background.
      setAllAssets(cached.allAssets ?? []);
      setImageInspiration(cached.imageInspiration ?? []);
      setVideoInspiration(cached.videoInspiration ?? []);
      setLoading(false);
      setImagesLoading(false);
      setVideosLoading(false);
      setImageCommunityLoading(false);
      setVideoCommunityLoading(false);
    } catch {
      // ignore malformed cache
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    if (typeof window !== 'undefined') {
      try {
        const raw = window.sessionStorage.getItem(`rangmanch:projects:v1:${userId}`);
        if (raw) {
          const cached = JSON.parse(raw) as { projects?: Project[] };
          if (cached.projects?.length) {
            setProjects(cached.projects);
          }
        }
      } catch {
        // ignore malformed project cache
      }
    }
    void api.listProjects(userId)
      .then((items) => {
        if (!cancelled) {
          setProjects(items);
          if (typeof window !== 'undefined') {
            try {
              window.sessionStorage.setItem(
                `rangmanch:projects:v1:${userId}`,
                JSON.stringify({ ts: Date.now(), projects: items }),
              );
            } catch {
              // ignore write failure
            }
          }
        }
      })
      .catch(() => {
        if (!cancelled && projects.length === 0) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projects.length, userId]);

  useEffect(() => {
    let cancelled = false;
    let imageLoadFailed = false;
    let videoLoadFailed = false;
    let imageCommunityFailed = false;
    let videoCommunityFailed = false;
    const hasWarmAssets = allAssets.length > 0;
    const hasWarmCommunity = imageInspiration.length > 0 || videoInspiration.length > 0;
    setLoading(!hasWarmAssets);
    setImagesLoading(!hasWarmAssets);
    setVideosLoading(!hasWarmAssets);
    setImageCommunityLoading(!hasWarmCommunity);
    setVideoCommunityLoading(!hasWarmCommunity);
    setError(null);
    setCommunityError(null);

    const sortAssets = (items: AssetSearchItem[]) =>
      [...items].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const replaceAssetType = (type: 'image' | 'video', nextItems: AssetSearchItem[]) => {
      setAllAssets((current) =>
        sortAssets([
          ...current.filter((item) => item.content_type !== type),
          ...nextItems,
        ]),
      );
    };

    void api.listGeneratedImages(userId, DASHBOARD_FEED_LIMIT)
      .then((images) => {
        if (cancelled) return;
        replaceAssetType('image', images.map(toAssetFromImage));
      })
      .catch((err) => {
        if (cancelled) return;
        imageLoadFailed = true;
        if (videoLoadFailed) {
          setError(err instanceof Error ? err.message : 'Failed to load images.');
        }
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
        setImagesLoading(false);
        if (imageLoadFailed && videoLoadFailed) {
          setAllAssets([]);
          setAssets([]);
          setError((current) => current ?? 'Failed to load creations. Please refresh.');
        }
      });

    void api.listVideos(userId, DASHBOARD_FEED_LIMIT)
      .then((videos) => {
        if (cancelled) return;
        replaceAssetType('video', videos.map(toAssetFromVideo));
      })
      .catch((err) => {
        if (cancelled) return;
        videoLoadFailed = true;
        if (imageLoadFailed) {
          setError((current) => current ?? (err instanceof Error ? err.message : 'Failed to load videos.'));
        }
      })
      .finally(() => {
        if (cancelled) return;
        setVideosLoading(false);
        if (imageLoadFailed && videoLoadFailed) {
          setAllAssets([]);
          setAssets([]);
          setError((current) => current ?? 'Failed to load creations. Please refresh.');
        }
      });

    const loadCommunity = () => {
      void api.listImageInspiration(userId, DASHBOARD_COMMUNITY_LIMIT)
        .then((images) => {
          if (cancelled) return;
          setImageInspiration(images);
        })
        .catch((err) => {
          if (cancelled) return;
          imageCommunityFailed = true;
          if (videoCommunityFailed) {
            setCommunityError(err instanceof Error ? err.message : 'Failed to load image inspiration.');
          }
        })
        .finally(() => {
          if (cancelled) return;
          setImageCommunityLoading(false);
        });

      void api.listVideoInspiration(userId, DASHBOARD_COMMUNITY_LIMIT)
        .then((videos) => {
          if (cancelled) return;
          setVideoInspiration(videos);
        })
        .catch((err) => {
          if (cancelled) return;
          videoCommunityFailed = true;
          if (imageCommunityFailed) {
            setCommunityError((current) => current ?? (err instanceof Error ? err.message : 'Failed to load video inspiration.'));
          }
        })
        .finally(() => {
          if (cancelled) return;
          setVideoCommunityLoading(false);
        });
    };

    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(() => loadCommunity(), { timeout: 1200 });
    } else if (typeof window !== 'undefined') {
      timeoutHandle = globalThis.setTimeout(loadCommunity, 450);
    } else {
      loadCommunity();
    }

    return () => {
      cancelled = true;
      if (typeof window !== 'undefined' && idleHandle !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        globalThis.clearTimeout(timeoutHandle);
      }
    };
  }, [cacheKey, userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const payload = JSON.stringify({
        ts: Date.now(),
        allAssets,
        imageInspiration,
        videoInspiration,
      });
      window.sessionStorage.setItem(cacheKey, payload);
      window.localStorage.setItem(cacheKey, payload);
    } catch {
      // ignore cache write issues
    }
  }, [allAssets, cacheKey, imageInspiration, videoInspiration]);

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
      all: allAssets.length,
      image: allAssets.filter((item) => item.content_type === 'image').length,
      video: allAssets.filter((item) => item.content_type === 'video').length,
    }),
    [allAssets],
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
        const refreshed = await api.listVideoInspiration(userId, DASHBOARD_COMMUNITY_LIMIT).catch(() => null);
        if (refreshed) setVideoInspiration(refreshed);
      } else {
        const refreshed = await api.listImageInspiration(userId, DASHBOARD_COMMUNITY_LIMIT).catch(() => null);
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

  const deleteAsset = async (asset: AssetSearchItem) => {
    setDeletingAssetId(asset.id);
    try {
      if (asset.content_type === 'video') {
        await api.deleteVideo(asset.id, userId);
      } else {
        await api.deleteGeneratedImage(asset.id, userId);
      }
      setAllAssets((current) => current.filter((item) => item.id !== asset.id));
      setAssets((current) => current.filter((item) => item.id !== asset.id));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to delete ${asset.content_type}.`);
    } finally {
      setDeletingAssetId(null);
    }
  };

  const assignAssetToProject = async (projectId: string) => {
    if (!projectAssignmentTarget) return;
    setAssigningProjectId(projectAssignmentTarget.id);
    try {
      if (projectAssignmentTarget.content_type === 'video') {
        await api.assignVideoToProject(projectAssignmentTarget.id, projectId, userId);
      } else {
        await api.assignImageToProject(projectAssignmentTarget.id, projectId, userId);
      }
      setAllAssets((current) =>
        current.map((item) =>
          item.id === projectAssignmentTarget.id
            ? {
                ...item,
                project_id: projectId,
              }
            : item,
        ),
      );
      setAssets((current) =>
        current.map((item) =>
          item.id === projectAssignmentTarget.id
            ? {
                ...item,
                project_id: projectId,
              }
            : item,
        ),
      );
      setError(null);
      setProjectAssignmentTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update project assignment.');
    } finally {
      setAssigningProjectId(null);
    }
  };

  const emptyState = emptyCopy(mediaFilter);
  const viewAllHref = mediaFilter === 'image' ? '/images' : mediaFilter === 'video' ? '/videos' : '/projects';
  //const viewAllLabel = mediaFilter === 'image' ? 'View all images' : mediaFilter === 'video' ? 'View all videos' : 'View all projects';

  return (
    <div className="rangmanch-page-stack">
      <section className="overflow-hidden rounded-[32px]">
        <div
          className="rangmanch-studio-panel-strong space-y-5 rounded-[32px] p-5 sm:p-8"
          style={{
            background:
              'radial-gradient(circle at top center, hsl(var(--color-accent) / 0.22), transparent 32%), radial-gradient(circle at 20% 80%, hsl(260 80% 62% / 0.18), transparent 45%), linear-gradient(145deg, hsl(var(--color-surface) / 0.76), hsl(var(--color-elevated) / 0.73))',
          }}
        >
          <div className="grid gap-6 2xl:grid-cols-[1.25fr_0.75fr] 2xl:items-end">
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
            <div className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
              <div className="rangmanch-matte-surface rounded-[24px] p-4">
                <p className="rangmanch-section-eyebrow">Recent creations</p>
                {imagesLoading || videosLoading ? (
                  <div className="mt-3 h-8 w-14 animate-pulse rounded-full bg-[hsl(var(--color-border))]" />
                ) : (
                  <p className="mt-3 font-heading text-3xl font-extrabold text-text">{assetCounts.all}</p>
                )}
              </div>
              <div className="rangmanch-matte-surface rounded-[24px] p-4">
                <p className="rangmanch-section-eyebrow">Recent videos</p>
                {videosLoading ? (
                  <div className="mt-3 h-8 w-14 animate-pulse rounded-full bg-[hsl(var(--color-border))]" />
                ) : (
                  <p className="mt-3 font-heading text-3xl font-extrabold text-text">{assetCounts.video}</p>
                )}
              </div>
              <div className="rangmanch-matte-surface rounded-[24px] p-4">
                <p className="rangmanch-section-eyebrow">Recent images</p>
                {imagesLoading ? (
                  <div className="mt-3 h-8 w-14 animate-pulse rounded-full bg-[hsl(var(--color-border))]" />
                ) : (
                  <p className="mt-3 font-heading text-3xl font-extrabold text-text">{assetCounts.image}</p>
                )}
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
            <p className="rangmanch-section-eyebrow">Quick Launch</p>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Start with a guided format</h2>
            <p className="mt-1 text-sm text-muted">Use a proven workflow instead of starting from a blank canvas.</p>
          </div>
          {/*<Button variant="secondary" className="h-9 rounded-full px-4 text-xs">More</Button> */}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          {storyCards.map((item) => (
            <Link
              key={item.title}
              href={`/create?template=${encodeURIComponent(item.templateKey)}`}
              className="group rounded-[20px] border border-[hsl(var(--color-border))] p-3.5 shadow-soft transition hover:-translate-y-0.5"
              style={{ background: item.gradient }}
            >
              <div className="inline-flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.52)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted backdrop-blur-md">
                Guided
              </div>
              <p className="mt-4 font-heading text-lg font-extrabold text-text">{item.title}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted">{item.description}</p>
              <div className="mt-6 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-bg)/0.6)] px-3 py-1.5 text-sm font-semibold text-text backdrop-blur-md">
                Open
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
            <p className="mt-1 text-sm text-muted">A lightweight preview of approved public creations.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline" className="h-9 rounded-full px-4 text-xs text-muted">
              Preview only
            </Badge>
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
        </div>
        {communityLoading ? (
          <div className="columns-1 gap-2.5 sm:columns-2 md:columns-3 xl:columns-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`inspiration-skeleton-${index}`}
                className="mb-4 h-56 break-inside-avoid animate-pulse rounded-[var(--radius-lg)] bg-[hsl(var(--color-border))]"
              />
            ))}
          </div>
        ) : (
          <div className="columns-1 gap-2.5 sm:columns-2 md:columns-3 xl:columns-4">
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
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedInspirationItem(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setSelectedInspirationItem(item);
                  }
                }}
                className="group relative mb-2.5 block w-full break-inside-avoid overflow-hidden rounded-[14px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.34)] text-left shadow-soft transition duration-200 hover:-translate-y-0.5 hover:border-[hsl(var(--color-accent)/0.24)] hover:shadow-[var(--shadow-hard)] sm:rounded-[16px]"
                style={{ aspectRatio: aspectRatioToCss(videoItem ? videoItem.aspect_ratio : imageItem?.aspect_ratio) }}
              >
                {videoItem ? (
                  <>
                    <img
                      src={preview}
                      alt={item.title}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                    />
                    <span className="absolute left-2 bottom-12 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-bg)/0.76)] px-1.5 py-0.5 text-[9px] font-semibold text-text backdrop-blur-md sm:left-2.5 sm:bottom-14 sm:py-1 sm:text-[10px]">
                      <Film className="h-3 w-3" strokeWidth={1.75} />
                      Preview
                    </span>
                  </>
                ) : (
                  <img src={preview} alt={item.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.82)] via-[hsl(var(--color-bg)/0.12)] to-transparent opacity-90" />
                <span className="absolute right-2 top-2 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] px-1.5 py-0.5 text-[9px] font-semibold text-text backdrop-blur-md sm:right-2.5 sm:top-2.5 sm:py-1 sm:text-[10px]">
                  {meta}
                </span>
                <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] px-1.5 py-0.5 text-[9px] font-semibold text-text backdrop-blur-md sm:left-2.5 sm:top-2.5 sm:py-1 sm:text-[10px]">
                  <Heart className={`h-3 w-3 ${item.liked_by_user ? 'fill-current' : ''}`} strokeWidth={1.75} />
                  {item.like_count}
                </span>
                <div className="absolute left-2 top-10 flex items-center gap-1 opacity-0 transition group-hover:opacity-100 sm:left-2.5 sm:top-11 sm:gap-1.5">
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md"
                    onClick={(event) => {
                      event.stopPropagation();
                      void toggleLikeInspiration(item);
                    }}
                  >
                    <Heart className={`h-3.5 w-3.5 text-text ${item.liked_by_user ? 'fill-current' : ''}`} strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md"
                    onClick={(event) => {
                      event.stopPropagation();
                      downloadFromUrl(videoItem ? videoItem.video_url : imageItem?.image_url ?? null, item.title, videoItem ? 'mp4' : 'png');
                    }}
                  >
                    <Download className="h-3.5 w-3.5 text-text" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remixInStudio(item);
                    }}
                  >
                    <Wand2 className="h-3.5 w-3.5 text-text" strokeWidth={1.75} />
                  </button>
                </div>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.92)] via-[hsl(var(--color-bg)/0.32)] to-transparent px-2 pb-2 pt-7 sm:px-2.5 sm:pb-2.5 sm:pt-8">
                  <p className="line-clamp-1 text-[11px] font-semibold leading-4 text-text sm:text-[12px]">{item.title}</p>
                </div>
                <div className="absolute inset-x-2 bottom-9 rounded-[10px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.66)] p-2 opacity-0 backdrop-blur-md transition group-hover:opacity-100 sm:inset-x-2.5 sm:bottom-10 sm:rounded-[12px] sm:p-2.5">
                  <p className="line-clamp-2 text-[10px] leading-4 text-text sm:text-[11px]">{item.prompt}</p>
                </div>
              </div>
            );
          })}
          </div>
        )}
        {communityError ? (
          <Card className="rangmanch-studio-panel border-none bg-transparent">
            <p className="text-sm text-[hsl(var(--color-danger))]">{communityError}</p>
          </Card>
        ) : null}
        {!communityLoading && inspirationItems.length === 0 ? (
          <Card className="rangmanch-studio-panel rounded-[28px] border border-dashed border-[hsl(var(--color-border))] bg-transparent p-8 text-center">
            <p className="font-heading text-lg font-extrabold text-text">No inspiration items yet</p>
            <p className="mt-2 text-sm text-muted">
              Publish a high-quality generated {inspirationFilter === 'video' ? 'video' : inspirationFilter === 'image' ? 'image' : 'image or video'} to start building this feed.
            </p>
          </Card>
        ) : null}
      </section>

{/*
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
            <Link href={viewAllHref}>
              <Button variant="secondary">{viewAllLabel}</Button>
            </Link>
          </div>
        </div>

        {error && <Card className="rangmanch-studio-panel border-none bg-transparent"><p className="text-sm text-[hsl(var(--color-danger))]">{error}</p></Card>}

        <Card className="rangmanch-studio-panel space-y-4 border-none bg-transparent backdrop-blur-md">
          {(imagesLoading || videosLoading) && allAssets.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {imagesLoading ? <Badge variant="outline">Loading images…</Badge> : null}
              {videosLoading ? <Badge variant="outline">Loading videos…</Badge> : null}
            </div>
          ) : null}
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

        {creationsLoading ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
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
          <div className="columns-2 gap-3 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6">
            {highlightedAssets.map((asset) => {
              const preview = toAbsoluteUrl(asset.thumbnail_url) ?? toAbsoluteUrl(asset.asset_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80';
              const openHref = asset.content_type === 'video' ? `/videos/${asset.id}` : `/images`;
              return (
                <div
                  key={asset.id}
                  className="mb-2.5 break-inside-avoid"
                >
                  <MediaPosterCard
                    preview={preview}
                    title={asset.title || `Untitled ${mediaLabel(asset.content_type)}`}
                    aspectRatio={aspectRatioToCss(asset.aspect_ratio)}
                    roundedClassName="rounded-[14px]"
                    bodyClassName="space-y-1 p-2"
                    titleClassName="line-clamp-1 text-[11px] font-semibold text-text"
                    actions={
                      <div className="flex max-w-[calc(100%-0.5rem)] flex-wrap items-center justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                        <button
                          type="button"
                          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-bg)/0.96)] text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:bg-[hsl(var(--color-elevated)/0.96)] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void downloadAsset(asset)}
                          disabled={downloadingId === asset.id || !asset.asset_url}
                          title="Download"
                        >
                          <Download className="h-4 w-4" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          className="pointer-events-auto inline-flex h-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-bg)/0.97)] px-3 text-[11px] font-semibold leading-none text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:bg-[hsl(var(--color-elevated)/0.97)] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void togglePublish(asset)}
                          disabled={publishingAssetId === asset.id}
                        >
                          {publishingAssetId === asset.id ? '...' : asset.is_public_inspiration ? 'Unpublish' : 'Publish'}
                        </button>
                        <button
                          type="button"
                          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-bg)/0.96)] text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:bg-[hsl(var(--color-elevated)/0.96)] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => void deleteAsset(asset)}
                          disabled={deletingAssetId === asset.id}
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2} />
                        </button>
                        {asset.project_id ? (
                          <Link
                            href={`/projects/${asset.project_id}`}
                            className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-bg)/0.96)] text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:bg-[hsl(var(--color-elevated)/0.96)]"
                            title="Open in project"
                          >
                            <FolderOpen className="h-4 w-4" strokeWidth={2} />
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-bg)/0.96)] text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:bg-[hsl(var(--color-elevated)/0.96)] disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => setProjectAssignmentTarget(asset)}
                          disabled={assigningProjectId === asset.id}
                          title={asset.project_id ? 'Move to project' : 'Add to project'}
                        >
                          <FolderPlus className="h-4 w-4" strokeWidth={2} />
                        </button>
                        <Link
                          href={openHref}
                          className="pointer-events-auto inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.9)] bg-[hsl(var(--color-bg)/0.96)] text-[hsl(var(--color-text))] shadow-[var(--shadow-soft)] backdrop-blur-xl transition hover:bg-[hsl(var(--color-elevated)/0.96)]"
                          title="Open"
                        >
                          <ExternalLink className="h-4 w-4" strokeWidth={2} />
                        </Link>
                      </div>
                    }
                    meta={
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <StatusChip variant={asset.status === 'completed' ? 'success' : asset.status === 'failed' ? 'danger' : 'warning'}>
                            {formatStatus(asset.status)}
                          </StatusChip>
                        </div>
                        <p className="line-clamp-2 text-[10px] leading-4 text-text">{asset.prompt}</p>
                        <p className="text-[9px] uppercase tracking-[0.12em] text-muted">
                          {mediaLabel(asset.content_type)} • {asset.aspect_ratio} • {asset.resolution} • {timeAgo(asset.created_at)}
                        </p>
                      </>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}

        {!loading && assets.length > highlightedAssets.length && (
          <div className="flex justify-center">
            <Link href={viewAllHref}>
              <Button variant="secondary" className="gap-2">
                {viewAllLabel}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        )}
      </section>

     */}

      {selectedInspirationItem ? (
        <Modal open onClose={() => setSelectedInspirationItem(null)}>
          <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1.48fr)_272px]">
            <div className="flex min-h-[48vh] items-center justify-center overflow-hidden rounded-[16px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg))] p-1.5 sm:min-h-[62vh] sm:rounded-[18px] sm:p-2.5">
              {isVideoInspiration(selectedInspirationItem) ? (
                <video
                  src={toAbsoluteUrl(selectedInspirationItem.video_url) ?? selectedInspirationItem.video_url}
                  poster={toAbsoluteUrl(selectedInspirationItem.thumbnail_url) ?? selectedInspirationItem.thumbnail_url}
                  controls
                  className="max-h-[84vh] w-full rounded-[14px] bg-black object-contain"
                />
              ) : (
                <img
                  src={selectedInspirationItem.image_url}
                  alt={selectedInspirationItem.title}
                  className="max-h-[84vh] w-full rounded-[14px] object-contain"
                />
              )}
            </div>
            <div className="space-y-2 xl:max-h-[84vh] xl:overflow-y-auto xl:pr-1 sm:space-y-2.5">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-base font-extrabold tracking-tight text-text sm:text-lg">{selectedInspirationItem.title}</h3>
                    <p className="mt-1 text-[11px] text-muted">
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
                  className="h-9 gap-2 px-3 text-xs"
                  onClick={() => void toggleLikeInspiration(selectedInspirationItem)}
                  disabled={likingAssetId === selectedInspirationItem.id}
                >
                  <Heart className={`h-4 w-4 ${selectedInspirationItem.liked_by_user ? 'fill-current' : ''}`} />
                  {selectedInspirationItem.like_count}
                </Button>
              </div>

              <div className="rounded-[12px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg))] p-2.5 sm:rounded-[16px]">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Prompt</p>
                  <Button variant="secondary" type="button" onClick={() => void copyPrompt(selectedInspirationItem.prompt)} className="h-8 gap-1.5 px-2.5 text-[11px]">
                    <Copy className="h-3.5 w-3.5" />
                    {copiedPrompt ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <p className="mt-2 text-[12px] leading-5 text-muted">{selectedInspirationItem.prompt}</p>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
                <div className="rounded-[12px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg))] p-2.5 sm:rounded-[16px]">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">Model</p>
                  <p className="mt-1 text-[12px] font-semibold text-text">{selectedInspirationItem.model_key}</p>
                </div>
                <div className="rounded-[12px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg))] p-2.5 sm:rounded-[16px]">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-muted">{isVideoInspiration(selectedInspirationItem) ? 'Duration' : 'Aspect ratio'}</p>
                  <p className="mt-1 text-[12px] font-semibold text-text">
                    {isVideoInspiration(selectedInspirationItem) ? `${selectedInspirationItem.duration_seconds}s` : selectedInspirationItem.aspect_ratio}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1">
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
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-2 text-xs font-semibold text-text"
              >
                Open original
                <ExternalLink className="h-4 w-4" />
              </a>
            </div>
          </div>
        </Modal>
      ) : null}
      <ProjectAssignmentDialog
        open={Boolean(projectAssignmentTarget)}
        onClose={() => setProjectAssignmentTarget(null)}
        projects={projects}
        currentProjectId={projectAssignmentTarget?.project_id}
        assetLabel={projectAssignmentTarget?.title || 'selected asset'}
        onConfirm={assignAssetToProject}
        submitting={Boolean(projectAssignmentTarget && assigningProjectId === projectAssignmentTarget.id)}
      />
    </div>
  );
}
