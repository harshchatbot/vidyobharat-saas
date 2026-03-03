'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Film, ImageIcon, Search, Tag } from 'lucide-react';

import { MrGreenMascot } from '@/components/landing/MrGreenMascot';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetSearchItem, AssetTagFacet } from '@/types/api';

type Props = {
  userId: string;
  userName: string;
};

type MediaFilter = 'all' | 'video' | 'image';

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

export function DashboardVideosClient({ userId, userName }: Props) {
  const [assets, setAssets] = useState<AssetSearchItem[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('all');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.allSettled([
      api.searchAssets(userId, {
        content_type: mediaFilter === 'all' ? undefined : mediaFilter,
        query: searchQuery || undefined,
        tags: selectedTags,
        sort: 'newest',
        page: 1,
        page_size: 24,
      }),
      api.listAssetTags(userId, {
        content_type: mediaFilter === 'all' ? undefined : mediaFilter,
      }),
    ])
      .then(([results, facets]) => {
        if (cancelled) return;
        if (results.status === 'fulfilled') {
          setAssets(results.value.items);
          setError(null);
        } else {
          setAssets([]);
          setError('Failed to load creations. Please refresh.');
        }

        if (facets.status === 'fulfilled') {
          setTagFacets(facets.value);
        } else {
          setTagFacets([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, searchQuery, selectedTags, mediaFilter]);

  const assetCounts = useMemo(
    () => ({
      all: assets.length,
      image: assets.filter((item) => item.content_type === 'image').length,
      video: assets.filter((item) => item.content_type === 'video').length,
    }),
    [assets],
  );

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

  const emptyState = emptyCopy(mediaFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Manage your generated images and videos from one place.</p>
        </div>
        <div className="flex flex-wrap gap-2 sm:self-start">
          <Link href="/images"><Button variant="secondary">Create image</Button></Link>
          <Link href="/create"><Button>Create video</Button></Link>
        </div>
      </div>

      <Card>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <MrGreenMascot size="sm" className="mx-auto sm:mx-0" />
          <div className="text-left">
            <h2 className="font-heading text-xl font-extrabold tracking-tight text-text sm:text-2xl">
              Hi {userName} 👋 I am Mr Green. Welcome Back !! 
              What do you want to create today?
            </h2>
            <p className="mt-1 text-sm text-muted">Jump into images, videos, or use a ready template.</p>
          </div>
        </div>
      </Card>

      <Grid className="md:grid-cols-3">
        <Card className="flex h-full flex-col justify-between">
          <div>
            <p className="font-semibold text-text">Create image</p>
            <p className="mt-1 text-sm text-muted">Generate covers, posters, thumbnails, and influencer visuals.</p>
          </div>
          <Link href="/images" className="mt-4"><Button className="w-full">Open Images</Button></Link>
        </Card>
        <Card className="flex h-full flex-col justify-between">
          <div>
            <p className="font-semibold text-text">Create video</p>
            <p className="mt-1 text-sm text-muted">Write a script, choose a voice, and render your next video.</p>
          </div>
          <Link href="/create" className="mt-4"><Button variant="secondary" className="w-full">Open Studio</Button></Link>
        </Card>
        <Card className="flex h-full flex-col justify-between">
          <div>
            <p className="font-semibold text-text">AI Influencer Studio</p>
            <p className="mt-1 text-sm text-muted">Build a locked character persona and generate consistent outputs.</p>
          </div>
          <Link href="/influencer" className="mt-4"><Button variant="secondary" className="w-full">Open Influencer</Button></Link>
        </Card>
      </Grid>

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

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
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
        <Card>
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={`skeleton-row-${index}`} className="h-12 w-full animate-pulse rounded-[var(--radius-md)] bg-[hsl(var(--color-border))]" />
            ))}
          </div>
        </Card>
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
        <>
          <Card className="p-0 md:hidden">
            <div className="border-b border-[hsl(var(--color-border))] px-4 py-3">
              <h3 className="font-semibold text-text">Recent creations</h3>
            </div>
            <div className="space-y-3 p-4">
              {assets.map((asset) => {
                const preview = toAbsoluteUrl(asset.thumbnail_url) ?? toAbsoluteUrl(asset.asset_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80';
                const openHref = asset.content_type === 'video' ? `/videos/${asset.id}` : `/images`;
                return (
                  <div key={asset.id} className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] p-3">
                    <div className="flex items-start gap-3">
                      <img src={preview} alt={asset.title || 'Untitled asset'} className="h-16 w-20 shrink-0 rounded object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="break-words font-medium text-text">{asset.title || `Untitled ${mediaLabel(asset.content_type)}`}</p>
                          <Badge>{formatStatus(asset.status)}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted">{mediaLabel(asset.content_type)} • {asset.aspect_ratio} • {asset.resolution}</p>
                        <div className="mt-2 flex flex-wrap gap-1">
                          {[...asset.auto_tags.slice(0, 3), ...asset.user_tags.slice(0, 2)].map((tag) => (
                            <Badge key={`${asset.id}-${tag}`}>{tag}</Badge>
                          ))}
                        </div>
                        <p className="mt-1 text-xs text-muted">{timeAgo(asset.created_at)}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link href={openHref}><Button variant="secondary" className="px-3 py-1 text-xs">{asset.content_type === 'video' ? 'Open' : 'Open Images'}</Button></Link>
                      {asset.asset_url && (
                        <Button
                          className="px-3 py-1 text-xs"
                          onClick={() => void downloadAsset(asset)}
                          disabled={downloadingId === asset.id}
                        >
                          {downloadingId === asset.id ? 'Downloading...' : 'Download'}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="hidden overflow-x-auto p-0 md:block">
            <div className="border-b border-[hsl(var(--color-border))] px-4 py-3">
              <h3 className="font-semibold text-text">Recent creations</h3>
            </div>
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--color-border))] text-muted">
                  <th className="px-4 py-3 font-medium">Asset</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const preview = toAbsoluteUrl(asset.thumbnail_url) ?? toAbsoluteUrl(asset.asset_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80';
                  const openHref = asset.content_type === 'video' ? `/videos/${asset.id}` : `/images`;
                  return (
                    <tr key={asset.id} className="border-b border-[hsl(var(--color-border))] last:border-0">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <img src={preview} alt={asset.title || 'Untitled asset'} className="h-10 w-16 rounded object-cover" />
                          <div>
                            <p className="font-medium text-text">{asset.title || `Untitled ${mediaLabel(asset.content_type)}`}</p>
                            <p className="text-xs text-muted">{asset.aspect_ratio} • {asset.resolution}</p>
                            <div className="mt-1 flex flex-wrap gap-1">
                              {[...asset.auto_tags.slice(0, 3), ...asset.user_tags.slice(0, 2)].map((tag) => (
                                <Badge key={`${asset.id}-${tag}`}>{tag}</Badge>
                              ))}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text">
                        <div className="inline-flex items-center gap-2">
                          {asset.content_type === 'image' ? <ImageIcon className="h-4 w-4 text-[hsl(var(--color-accent))]" /> : <Film className="h-4 w-4 text-[hsl(var(--color-accent))]" />}
                          {mediaLabel(asset.content_type)}
                        </div>
                      </td>
                      <td className="px-4 py-3"><Badge>{formatStatus(asset.status)}</Badge></td>
                      <td className="px-4 py-3 text-muted">{timeAgo(asset.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link href={openHref}><Button variant="secondary" className="px-3 py-1 text-xs">{asset.content_type === 'video' ? 'Open' : 'Open Images'}</Button></Link>
                          {asset.asset_url && (
                            <Button
                              className="px-3 py-1 text-xs"
                              onClick={() => void downloadAsset(asset)}
                              disabled={downloadingId === asset.id}
                            >
                              {downloadingId === asset.id ? 'Downloading...' : 'Download'}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
