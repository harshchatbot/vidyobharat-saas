'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { Video } from '@/types/api';

type Props = {
  userId: string;
};

function formatStatus(status: Video['status']) {
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

export function DashboardVideosClient({ userId }: Props) {
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void api
      .listVideos(userId)
      .then((items) => {
        if (cancelled) return;
        setVideos(items);
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
  }, [userId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Dashboard</h1>
          <p className="mt-1 text-sm text-muted">Manage your generated videos and start quickly with templates.</p>
        </div>
        <Link href="/create"><Button>Create video</Button></Link>
      </div>

      <Card>
        <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">
          Hi User 👋 What do you want to create today?
        </h2>
        <p className="mt-1 text-sm text-muted">Start from scratch or use a ready template.</p>
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
        <Card className="overflow-x-auto p-0">
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
                      <span className="font-medium text-text">{video.title || 'Untitled Video'}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge>{formatStatus(video.status)}</Badge></td>
                  <td className="px-4 py-3 text-muted">{timeAgo(video.created_at)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/videos/${video.id}`}><Button variant="secondary" className="px-3 py-1 text-xs">Open</Button></Link>
                      {video.status === 'completed' && video.output_url && (
                        <a href={toAbsoluteUrl(video.output_url) ?? '#'} target="_blank" rel="noreferrer">
                          <Button className="px-3 py-1 text-xs">Download</Button>
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
