'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Clapperboard, Filter, FolderOpen, ImageIcon, Languages, Mic2, Sparkles, Video } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { ImageDetailModal } from '@/components/ui/ImageDetailModal';
import { MediaPosterCard } from '@/components/ui/MediaPosterCard';
import { StatusChip } from '@/components/ui/StatusChip';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { GeneratedImage, ProjectDetail, Video as VideoAsset } from '@/types/api';

function formatRelativeTime(value?: string | null) {
  if (!value) return 'Just now';
  const ts = new Date(value).getTime();
  const diffHours = Math.max(1, Math.floor((Date.now() - ts) / (1000 * 60 * 60)));
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

function toAbsolute(url?: string | null) {
  if (!url) return null;
  return url.startsWith('http') ? url : `${API_URL}${url}`;
}

type OutputFilter = 'all' | 'images' | 'videos';

type UnifiedOutput =
  | {
      id: string;
      kind: 'image';
      title: string;
      preview: string;
      createdAt: string;
      templateValue: string;
      modeValue: string;
      badges: string[];
      source: GeneratedImage;
    }
  | {
      id: string;
      kind: 'video';
      title: string;
      preview: string;
      createdAt: string;
      href: string;
      templateValue: string;
      modeValue: string;
      badges: string[];
    };

function mapImageOutput(item: GeneratedImage): UnifiedOutput | null {
  const preview = toAbsolute(item.thumbnail_url || item.image_url);
  if (!preview) return null;
  return {
    id: item.id,
    kind: 'image',
    title: item.prompt || 'Untitled image',
    preview,
    createdAt: item.created_at,
    templateValue: item.template_id || 'none',
    modeValue: item.mode_id || item.model_key || 'none',
    badges: [item.model_key, item.aspect_ratio, item.resolution, item.template_id].filter(Boolean) as string[],
    source: item,
  };
}

function mapVideoOutput(item: VideoAsset): UnifiedOutput {
  const preview =
    toAbsolute(item.thumbnail_url || item.source_image_url) ||
    'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  return {
    id: item.id,
    kind: 'video',
    title: item.title || item.script || 'Untitled video',
    preview,
    createdAt: item.updated_at || item.created_at,
    href: `/videos/${item.id}`,
    templateValue: item.template_id || item.template || 'none',
    modeValue: item.mode_id || item.selected_model || item.provider_name || 'none',
    badges: [item.selected_model || item.provider_name || 'video', item.status, item.aspect_ratio, item.template_id || item.template]
      .filter(Boolean) as string[],
  };
}

export function ProjectWorkspaceClient({ detail, userId }: { detail: ProjectDetail; userId: string }) {
  const { project } = detail;
  const { show } = useToast();
  const [script, setScript] = useState(project.script);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [assetFilter, setAssetFilter] = useState<OutputFilter>('all');
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState('all');
  const [selectedModeFilter, setSelectedModeFilter] = useState('all');
  const [projectImages, setProjectImages] = useState<GeneratedImage[]>(detail.images || []);
  const [selectedProjectImage, setSelectedProjectImage] = useState<GeneratedImage | null>(null);
  const [publishingImageId, setPublishingImageId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const saveFingerprint = useRef(`${project.script}`);

  useEffect(() => {
    if (script === saveFingerprint.current) return;

    const timer = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        await api.updateProject(
          project.id,
          {
            title: project.title,
            script,
            language: project.language,
            voice: project.voice,
            template: project.template,
          },
          userId,
        );
        saveFingerprint.current = script;
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [project.id, project.language, project.template, project.title, project.voice, script, userId]);

  useEffect(() => {
    setProjectImages(detail.images || []);
  }, [detail.images]);

  const imageItems = projectImages;
  const videoItems = detail.videos || [];
  const summary = detail.summary || {
    imageCount: imageItems.length,
    videoCount: videoItems.length,
    renderCount: detail.renders.length,
  };
  const latestActivity = project.last_activity_at || project.updated_at || project.created_at;
  const templateFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of imageItems) {
      if (item.template_id) values.add(item.template_id);
    }
    for (const item of videoItems) {
      if (item.template_id) values.add(item.template_id);
      else if (item.template) values.add(item.template);
    }
    return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [imageItems, videoItems]);
  const modeFilterOptions = useMemo(() => {
    const values = new Set<string>();
    for (const item of imageItems) {
      if (item.mode_id) values.add(item.mode_id);
      else if (item.model_key) values.add(item.model_key);
    }
    for (const item of videoItems) {
      if (item.mode_id) values.add(item.mode_id);
      else if (item.selected_model) values.add(item.selected_model);
      else if (item.provider_name) values.add(item.provider_name);
    }
    return ['all', ...Array.from(values).sort((a, b) => a.localeCompare(b))];
  }, [imageItems, videoItems]);
  const outputs = useMemo(() => {
    const allItems = [
      ...imageItems.map(mapImageOutput).filter(Boolean) as UnifiedOutput[],
      ...videoItems.map(mapVideoOutput),
    ];

    return allItems
      .filter((item) => {
        if (assetFilter === 'images' && item.kind !== 'image') return false;
        if (assetFilter === 'videos' && item.kind !== 'video') return false;
        if (selectedTemplateFilter !== 'all' && item.templateValue !== selectedTemplateFilter) return false;
        if (selectedModeFilter !== 'all' && item.modeValue !== selectedModeFilter) return false;
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [assetFilter, imageItems, selectedModeFilter, selectedTemplateFilter, videoItems]);

  const toggleProjectImagePublish = async (image: GeneratedImage) => {
    setPublishingImageId(image.id);
    try {
      const result = await api.publishInspiration('image', image.id, !image.is_public_inspiration, userId);
      setProjectImages((current) =>
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
      setSelectedProjectImage((current) =>
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
      setPublishingImageId(null);
    }
  };

  const deleteProjectImage = async (image: GeneratedImage) => {
    setDeletingImageId(image.id);
    try {
      await api.deleteGeneratedImage(image.id, userId);
      setProjectImages((current) => current.filter((item) => item.id !== image.id));
      setSelectedProjectImage((current) => (current?.id === image.id ? null : current));
      show({ title: 'Image deleted', message: 'The image was removed from this project.', variant: 'success' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to delete image.';
      show({ title: 'Delete failed', message, variant: 'error' });
    } finally {
      setDeletingImageId(null);
    }
  };

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="rounded-[28px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.34)] px-5 py-5 shadow-[var(--shadow-soft)] sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <Link href="/projects" className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted transition hover:text-text">
              <ArrowLeft className="h-4 w-4" />
              Projects
            </Link>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[16px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg-soft))] text-[hsl(var(--color-accent))]">
                <FolderOpen className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate font-heading text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{project.title}</h1>
                <p className="mt-1 text-sm text-muted">
                  {summary.imageCount + summary.videoCount} outputs in this folder • Updated {formatRelativeTime(latestActivity)}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Link href="/create">
              <Button className="gap-2">
                Continue Creating
                <Sparkles className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/editor/${project.id}`}>
              <Button variant="secondary" className="gap-2">
                Open editor
                <Clapperboard className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs text-muted">
          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.24)] px-2.5 py-1.5">
            <Languages className="h-3.5 w-3.5" />
            {project.language}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.24)] px-2.5 py-1.5">
            <Mic2 className="h-3.5 w-3.5" />
            {project.voice}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.24)] px-2.5 py-1.5">
            <ImageIcon className="h-3.5 w-3.5" />
            {summary.imageCount} images
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.24)] px-2.5 py-1.5">
            <Video className="h-3.5 w-3.5" />
            {summary.videoCount} videos
          </span>
          <StatusChip variant="default">{saveState === 'idle' ? 'Ready' : saveState}</StatusChip>
        </div>
      </section>

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_320px]">
        <div className="rounded-[28px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.32)] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Notes</p>
              <h2 className="mt-1 text-lg font-semibold text-text">Project brief</h2>
            </div>
            {saveState === 'saved' ? <p className="text-xs text-muted">Saved automatically</p> : null}
          </div>
          <Textarea
            value={script}
            onChange={(event) => setScript(event.target.value)}
            rows={10}
            placeholder="Keep the latest brief, angle, CTA, or production notes here."
            className="mt-4"
          />
          {saveState === 'error' ? <p className="mt-3 text-xs text-[hsl(var(--color-danger))]">Save failed. Edit again to retry.</p> : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-[28px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.32)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Folder summary</p>
            <div className="mt-3 space-y-3 text-sm text-muted">
              <div className="flex items-center justify-between gap-3">
                <span>Template</span>
                <span className="font-semibold text-text">{project.template || 'Freeform'}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Images</span>
                <span className="font-semibold text-text">{summary.imageCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Videos</span>
                <span className="font-semibold text-text">{summary.videoCount}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>Renders</span>
                <span className="font-semibold text-text">{summary.renderCount}</span>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.32)] p-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Next action</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              Continue from the same project context, then come back here to review everything in one folder-like view.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link href="/create">
                <Button className="w-full justify-center">Continue Creating</Button>
              </Link>
              <Link href={`/images?projectId=${project.id}`}>
                <Button variant="secondary" className="w-full justify-center">Open images</Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Outputs</p>
            <h2 className="mt-1 text-xl font-semibold text-text">All outputs in one place</h2>
          </div>
          <StatusChip variant="default">{outputs.length} visible</StatusChip>
        </div>

        <div className="rangmanch-filter-bar flex flex-col gap-3 rounded-[22px] p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Filter className="h-4 w-4" />
            Refine folder contents
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All outputs' },
              { key: 'images', label: 'Images' },
              { key: 'videos', label: 'Videos' },
            ].map((option) => (
              <Button
                key={option.key}
                variant={assetFilter === option.key ? 'primary' : 'secondary'}
                onClick={() => setAssetFilter(option.key as OutputFilter)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Dropdown value={selectedTemplateFilter} onChange={(event) => setSelectedTemplateFilter(event.target.value)} className="sm:max-w-xs">
            {templateFilterOptions.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All templates' : value}
              </option>
            ))}
          </Dropdown>
          <Dropdown value={selectedModeFilter} onChange={(event) => setSelectedModeFilter(event.target.value)} className="sm:max-w-xs">
            {modeFilterOptions.map((value) => (
              <option key={value} value={value}>
                {value === 'all' ? 'All modes / models' : value}
              </option>
            ))}
          </Dropdown>
        </div>

        {outputs.length === 0 ? (
          <div className="rounded-[28px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.32)] px-5 py-8 text-center sm:px-6">
            <p className="font-heading text-xl font-extrabold text-text">No outputs yet</p>
            <p className="mt-2 text-sm text-muted">Generate from create, image, or template flows and they will all land here in one section.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {outputs.map((item) => (
              <MediaPosterCard
                key={`${item.kind}-${item.id}`}
                preview={item.preview}
                title={item.title}
                href={item.kind === 'video' ? item.href : undefined}
                onClick={item.kind === 'image' ? () => setSelectedProjectImage(item.source) : undefined}
                meta={
                  <div className="flex flex-wrap gap-1.5 text-[10px] text-muted">
                    <Badge>{item.kind}</Badge>
                    {item.badges.slice(0, 3).map((badge) => (
                      <Badge key={`${item.id}-${badge}`}>{badge}</Badge>
                    ))}
                  </div>
                }
                footer={<p className="text-[11px] text-muted">Updated {formatRelativeTime(item.createdAt)}</p>}
              />
            ))}
          </div>
        )}
      </section>

      {selectedProjectImage ? (
        <ImageDetailModal
          open={Boolean(selectedProjectImage)}
          onClose={() => setSelectedProjectImage(null)}
          imageUrl={toAbsolute(selectedProjectImage.image_url) || selectedProjectImage.image_url}
          imageAlt={selectedProjectImage.prompt || 'Project image'}
          title="Project image"
          subtitle={`Created ${formatRelativeTime(selectedProjectImage.created_at)}`}
          prompt={selectedProjectImage.prompt}
          imageAspectRatio={selectedProjectImage.aspect_ratio}
          badges={
            <>
              <Badge>{selectedProjectImage.model_key}</Badge>
              <Badge>{selectedProjectImage.aspect_ratio}</Badge>
              <Badge>{selectedProjectImage.resolution}</Badge>
              <Badge>{selectedProjectImage.status}</Badge>
              {selectedProjectImage.is_public_inspiration ? <Badge>{selectedProjectImage.moderation_status}</Badge> : null}
            </>
          }
          details={
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Model</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedProjectImage.model_key}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Aspect Ratio</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedProjectImage.aspect_ratio}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Resolution</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedProjectImage.resolution}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Credits</p>
                <p className="mt-1 text-[11px] font-semibold text-text">{selectedProjectImage.applied_credits}</p>
              </div>
            </div>
          }
          actions={
            <>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void toggleProjectImagePublish(selectedProjectImage)}
                disabled={publishingImageId === selectedProjectImage.id}
              >
                {publishingImageId === selectedProjectImage.id
                  ? 'Updating...'
                  : selectedProjectImage.is_public_inspiration
                    ? 'Unpublish'
                    : 'Publish to inspiration'}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void deleteProjectImage(selectedProjectImage)}
                disabled={deletingImageId === selectedProjectImage.id}
              >
                {deletingImageId === selectedProjectImage.id ? 'Deleting...' : 'Delete image'}
              </Button>
              <a
                href={toAbsolute(selectedProjectImage.image_url) || selectedProjectImage.image_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text"
              >
                Open full image
              </a>
            </>
          }
        />
      ) : null}
    </div>
  );
}
