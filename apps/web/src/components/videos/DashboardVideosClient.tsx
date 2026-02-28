'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Film, Search, Tag } from 'lucide-react';

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

export function DashboardVideosClient({ userId, userName }: Props) {
  const [videos, setVideos] = useState<AssetSearchItem[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      api.searchAssets(userId, {
        content_type: 'video',
        query: searchQuery || undefined,
        tags: selectedTags,
        sort: 'newest',
        page: 1,
        page_size: 24,
      }),
      api.listAssetTags(userId, { content_type: 'video' }),
    ])
      .then(([results, facets]) => {
        if (cancelled) return;
        setVideos(results.items);
        setTagFacets(facets);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setError('Failed to load videos. Please refresh.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [userId, searchQuery, selectedTags]);

  const downloadVideo = async (video: AssetSearchItem) => {
    const url = toAbsoluteUrl(video.asset_url);
    if (!url) return;
    setDownloadingId(video.id);
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      const safeName = (video.title || 'video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
      link.download = `${safeName || 'video'}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch {
      setError('Failed to download video. Please try again.');
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Manage your generated videos and start quickly with templates.</p>
        </div>
        <Link href="/create" className="sm:self-start"><Button>Create video</Button></Link>
      </div>

      <Card>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
          <MrGreenMascot size="sm" className="mx-auto sm:mx-0" />
          <div className="text-left">
            <h2 className="font-heading text-xl font-extrabold tracking-tight text-text sm:text-2xl">
              Hi {userName} 👋 I am Mr Green. What do you want to create today?
            </h2>
            <p className="mt-1 text-sm text-muted">Start from scratch or use a ready template.</p>
          </div>
        </div>
      </Card>

      <Grid className="md:grid-cols-3">
        <Card className="flex h-full flex-col justify-between">
          <div>
            <p className="font-semibold text-text">Start from scratch</p>
            <p className="mt-1 text-sm text-muted">Upload images, write a script, choose voice, and generate.</p>
          </div>
          <Link href="/create" className="mt-4"><Button className="w-full">Open</Button></Link>
        </Card>
        <Card className="flex h-full flex-col justify-between">
          <div>
            <p className="font-semibold text-text">Template: Real Estate Promo</p>
            <p className="mt-1 text-sm text-muted">Pre-filled structure for property showcase videos.</p>
          </div>
          <Link href="/create?template=real_estate" className="mt-4"><Button variant="secondary" className="w-full">Use Template</Button></Link>
        </Card>
        <Card className="flex h-full flex-col justify-between">
          <div>
            <p className="font-semibold text-text">Template: YouTube Intro</p>
            <p className="mt-1 text-sm text-muted">Pre-filled structure for fast channel intro videos.</p>
          </div>
          <Link href="/create?template=youtube_intro" className="mt-4"><Button variant="secondary" className="w-full">Use Template</Button></Link>
        </Card>
      </Grid>

      {error && <Card><p className="text-sm text-[hsl(var(--color-danger))]">{error}</p></Card>}

      <Card className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
              <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              Search videos
            </label>
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search scripts, titles, and tags..."
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
      ) : videos.length === 0 ? (
        <Card className="text-center">
          <div className="mx-auto inline-flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--color-border))]">
            <Film className="h-5 w-5 text-muted" />
          </div>
          <p className="mt-3 font-semibold text-text">No videos yet</p>
          <p className="mt-1 text-sm text-muted">Create your first video in under a minute.</p>
          <div className="mt-4">
            <Link href="/create"><Button>Create video</Button></Link>
          </div>
        </Card>
      ) : (
        <>
          <Card className="p-0 md:hidden">
            <div className="border-b border-[hsl(var(--color-border))] px-4 py-3">
              <h3 className="font-semibold text-text">Recent videos</h3>
            </div>
            <div className="space-y-3 p-4">
              {videos.map((video) => (
                <div key={video.id} className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] p-3">
                  <div className="flex items-start gap-3">
                    <img
                      src={toAbsoluteUrl(video.thumbnail_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80'}
                      alt={video.title ?? 'Untitled Video'}
                      className="h-16 w-20 shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="break-words font-medium text-text">{video.title || 'Untitled Video'}</p>
                        <Badge>{formatStatus(video.status)}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted">{video.aspect_ratio} • {video.resolution}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {[...video.auto_tags.slice(0, 3), ...video.user_tags.slice(0, 2)].map((tag) => (
                          <Badge key={`${video.id}-${tag}`}>{tag}</Badge>
                        ))}
                      </div>
                      <p className="mt-1 text-xs text-muted">{timeAgo(video.created_at)}</p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={`/videos/${video.id}`}><Button variant="secondary" className="px-3 py-1 text-xs">Open</Button></Link>
                    {video.status === 'completed' && video.asset_url && (
                      <Button
                        className="px-3 py-1 text-xs"
                        onClick={() => void downloadVideo(video)}
                        disabled={downloadingId === video.id}
                      >
                        {downloadingId === video.id ? 'Downloading...' : 'Download'}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="hidden overflow-x-auto p-0 md:block">
            <div className="border-b border-[hsl(var(--color-border))] px-4 py-3">
              <h3 className="font-semibold text-text">Recent videos</h3>
            </div>
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-[hsl(var(--color-border))] text-muted">
                  <th className="px-4 py-3 font-medium">Video</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Created</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {videos.map((video) => (
                  <tr key={video.id} className="border-b border-[hsl(var(--color-border))] last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={toAbsoluteUrl(video.thumbnail_url) ?? 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=800&q=80'}
                          alt={video.title ?? 'Untitled Video'}
                          className="h-10 w-16 rounded object-cover"
                        />
                        <div>
                          <p className="font-medium text-text">{video.title || 'Untitled Video'}</p>
                          <p className="text-xs text-muted">{video.aspect_ratio} • {video.resolution}</p>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {[...video.auto_tags.slice(0, 3), ...video.user_tags.slice(0, 2)].map((tag) => (
                              <Badge key={`${video.id}-${tag}`}>{tag}</Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><Badge>{formatStatus(video.status)}</Badge></td>
                    <td className="px-4 py-3 text-muted">{timeAgo(video.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link href={`/videos/${video.id}`}><Button variant="secondary" className="px-3 py-1 text-xs">Open</Button></Link>
                        {video.status === 'completed' && video.asset_url && (
                          <Button
                            className="px-3 py-1 text-xs"
                            onClick={() => void downloadVideo(video)}
                            disabled={downloadingId === video.id}
                          >
                            {downloadingId === video.id ? 'Downloading...' : 'Download'}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}
    </div>
  );
}
