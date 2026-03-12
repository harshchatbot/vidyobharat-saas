'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Filter, GalleryVerticalEnd, ImageIcon, Languages, Mic2, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { StatusChip } from '@/components/ui/StatusChip';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { ProjectDetail } from '@/types/api';

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

export function ProjectWorkspaceClient({ detail, userId }: { detail: ProjectDetail; userId: string }) {
  const { project } = detail;
  const [title, setTitle] = useState(project.title);
  const [script, setScript] = useState(project.script);
  const [language, setLanguage] = useState(project.language);
  const [voice, setVoice] = useState(project.voice);
  const [template, setTemplate] = useState(project.template);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const saveFingerprint = useRef(`${project.title}|${project.script}|${project.language}|${project.voice}|${project.template}`);
  const { show } = useToast();

  useEffect(() => {
    const fingerprint = `${title}|${script}|${language}|${voice}|${template}`;
    if (fingerprint === saveFingerprint.current) return;

    const timer = window.setTimeout(async () => {
      try {
        setSaveState('saving');
        await api.updateProject(project.id, { title, script, language, voice, template }, userId);
        saveFingerprint.current = fingerprint;
        setSaveState('saved');
      } catch {
        setSaveState('error');
      }
    }, 900);

    return () => window.clearTimeout(timer);
  }, [language, project.id, script, template, title, userId, voice]);

  const imageItems = detail.images || [];
  const videoItems = detail.videos || [];
  const [assetFilter, setAssetFilter] = useState<'all' | 'images' | 'videos'>('all');
  const [selectedTemplateFilter, setSelectedTemplateFilter] = useState('all');
  const [selectedModeFilter, setSelectedModeFilter] = useState('all');
  const summary = detail.summary || {
    imageCount: imageItems.length,
    videoCount: videoItems.length,
    renderCount: detail.renders.length,
  };
  const latestActivity = project.last_activity_at || project.updated_at || project.created_at;
  const projectSnippet = useMemo(() => (project.last_prompt_snippet || script || '').trim(), [project.last_prompt_snippet, script]);
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
  const filteredImages = useMemo(() => {
    if (assetFilter === 'videos') return [];
    return imageItems.filter((item) => {
      const templateValue = item.template_id || 'none';
      const modeValue = item.mode_id || item.model_key || 'none';
      if (selectedTemplateFilter !== 'all' && templateValue !== selectedTemplateFilter) return false;
      if (selectedModeFilter !== 'all' && modeValue !== selectedModeFilter) return false;
      return true;
    });
  }, [assetFilter, imageItems, selectedModeFilter, selectedTemplateFilter]);
  const filteredVideos = useMemo(() => {
    if (assetFilter === 'images') return [];
    return videoItems.filter((item) => {
      const templateValue = item.template_id || item.template || 'none';
      const modeValue = item.mode_id || item.selected_model || item.provider_name || 'none';
      if (selectedTemplateFilter !== 'all' && templateValue !== selectedTemplateFilter) return false;
      if (selectedModeFilter !== 'all' && modeValue !== selectedModeFilter) return false;
      return true;
    });
  }, [assetFilter, selectedModeFilter, selectedTemplateFilter, videoItems]);

  return (
    <div className="space-y-6 sm:space-y-8">
      <StudioPageHeader
        eyebrow="Project Workspace"
        title={title}
        description="Group your brief, template direction, and generated outputs in one calmer project surface."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/create?projectId=${project.id}`}>
              <Button className="gap-2">
                Continue in video
                <Clapperboard className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/images?projectId=${project.id}`}>
              <Button variant="secondary" className="gap-2">
                Continue in images
                <ImageIcon className="h-4 w-4" />
              </Button>
            </Link>
            <Link href={`/templates?projectId=${project.id}`}>
              <Button variant="secondary" className="gap-2">
                Use template
                <GalleryVerticalEnd className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        }
      />

      <section className="grid gap-4 lg:grid-cols-4">
        <div className="rangmanch-studio-panel rounded-[24px] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Last activity</p>
          <p className="mt-2 text-sm font-semibold text-text">{formatRelativeTime(latestActivity)}</p>
        </div>
        <div className="rangmanch-studio-panel rounded-[24px] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Images</p>
          <p className="mt-2 text-sm font-semibold text-text">{summary.imageCount}</p>
        </div>
        <div className="rangmanch-studio-panel rounded-[24px] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Videos</p>
          <p className="mt-2 text-sm font-semibold text-text">{summary.videoCount}</p>
        </div>
        <div className="rangmanch-studio-panel rounded-[24px] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Saved state</p>
          <p className="mt-2 text-sm font-semibold text-text capitalize">{saveState === 'idle' ? 'Ready' : saveState}</p>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rangmanch-studio-panel space-y-4 rounded-[28px] p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="rangmanch-section-eyebrow">Brief</p>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Project brief and working draft</h2>
            </div>
            <StatusChip variant="default">{project.template || 'Freeform'}</StatusChip>
          </div>

          <div className="space-y-3">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Project title" />
            <Textarea
              value={script}
              onChange={(event) => setScript(event.target.value)}
              rows={10}
              placeholder="Capture your brief, script, and creative direction here."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.32)] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Language</p>
              <p className="mt-1 text-sm font-semibold text-text">{language}</p>
            </div>
            <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.32)] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Voice</p>
              <p className="mt-1 text-sm font-semibold text-text">{voice}</p>
            </div>
            <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.32)] px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Template</p>
              <p className="mt-1 text-sm font-semibold text-text">{template || 'Freeform'}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.26)] px-2.5 py-1.5">
              <Languages className="h-3.5 w-3.5" />
              {language}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.26)] px-2.5 py-1.5">
              <Mic2 className="h-3.5 w-3.5" />
              {voice}
            </span>
            {projectSnippet ? (
              <span className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.26)] px-2.5 py-1.5">
                Prompt snippet saved
              </span>
            ) : null}
          </div>

          {saveState === 'saved' ? <p className="text-xs text-muted">Workspace saved automatically.</p> : null}
          {saveState === 'error' ? <p className="text-xs text-[hsl(var(--color-danger))]">Project save failed. Retry by editing again.</p> : null}
        </div>

        <div className="space-y-4">
          <div className="rangmanch-studio-panel rounded-[28px] p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="rangmanch-section-eyebrow">Workspace next steps</p>
                <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Continue from the same project context</h2>
              </div>
              <Link href={`/editor/${project.id}`}>
                <Button variant="secondary">Open editor</Button>
              </Link>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted">
              Use the same project id in video, image, or template flows so outputs stay grouped instead of scattering across separate pages.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Link href={`/create?projectId=${project.id}`} className="rangmanch-poster-card rounded-[24px] p-4 transition hover:-translate-y-0.5">
              <p className="text-sm font-semibold text-text">Video workspace</p>
              <p className="mt-1 text-sm text-muted">Continue script-led video creation with this project attached.</p>
            </Link>
            <Link href={`/images?projectId=${project.id}`} className="rangmanch-poster-card rounded-[24px] p-4 transition hover:-translate-y-0.5">
              <p className="text-sm font-semibold text-text">Image workspace</p>
              <p className="mt-1 text-sm text-muted">Generate image concepts that stay grouped with this brief.</p>
            </Link>
            <Link href={`/templates?projectId=${project.id}`} className="rangmanch-poster-card rounded-[24px] p-4 transition hover:-translate-y-0.5">
              <p className="text-sm font-semibold text-text">Guided templates</p>
              <p className="mt-1 text-sm text-muted">Use structured template flows without losing project context.</p>
            </Link>
            <Link href={`/editor/${project.id}`} className="rangmanch-poster-card rounded-[24px] p-4 transition hover:-translate-y-0.5">
              <p className="text-sm font-semibold text-text">Render editor</p>
              <p className="mt-1 text-sm text-muted">Open the focused editor for render queueing and script iteration.</p>
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="rangmanch-section-eyebrow">Outputs</p>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Grouped images and videos</h2>
          </div>
          <StatusChip variant="default">{summary.imageCount + summary.videoCount} total outputs</StatusChip>
        </div>

        <div className="rangmanch-filter-bar flex flex-col gap-3 rounded-[22px] p-4 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="flex items-center gap-2 text-sm text-muted">
            <Filter className="h-4 w-4" />
            Filter workspace outputs
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { key: 'all', label: 'All' },
              { key: 'images', label: 'Images' },
              { key: 'videos', label: 'Videos' },
            ].map((option) => (
              <Button
                key={option.key}
                variant={assetFilter === option.key ? 'primary' : 'secondary'}
                onClick={() => setAssetFilter(option.key as 'all' | 'images' | 'videos')}
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

        {imageItems.length === 0 && videoItems.length === 0 ? (
          <div className="rangmanch-studio-panel rounded-[28px] px-5 py-8 text-center sm:px-6">
            <p className="font-heading text-xl font-extrabold text-text">No outputs attached yet</p>
            <p className="mt-2 text-sm text-muted">Generate from video, image, or template flows using this project and everything will gather here.</p>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-text">Images</h3>
                <StatusChip variant="success">{filteredImages.length}</StatusChip>
              </div>
              {filteredImages.length === 0 ? <div className="rangmanch-studio-panel rounded-[24px] px-4 py-5 text-sm text-muted">No images match the current filters.</div> : null}
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredImages.slice(0, 8).map((item) => (
                  <article key={item.id} className="rangmanch-poster-card overflow-hidden rounded-[18px]">
                    <img src={toAbsolute(item.thumbnail_url || item.image_url) || ''} alt={item.prompt} className="aspect-[4/5] w-full object-cover" />
                    <div className="space-y-1.5 p-2.5">
                      <p className="line-clamp-2 text-xs font-semibold text-text">{item.prompt}</p>
                      <div className="flex flex-wrap gap-1.5 text-[10px] text-muted">
                        <Badge>{item.model_key}</Badge>
                        <Badge>{item.aspect_ratio}</Badge>
                        <Badge>{item.resolution}</Badge>
                        {item.template_id ? <Badge>{item.template_id}</Badge> : null}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-lg font-semibold text-text">Videos</h3>
                <StatusChip variant="success">{filteredVideos.length}</StatusChip>
              </div>
              {filteredVideos.length === 0 ? <div className="rangmanch-studio-panel rounded-[24px] px-4 py-5 text-sm text-muted">No videos match the current filters.</div> : null}
              <div className="grid gap-3 sm:grid-cols-2">
                {filteredVideos.slice(0, 6).map((item) => {
                  const poster = toAbsolute(item.thumbnail_url || item.source_image_url);
                  return (
                    <article key={item.id} className="rangmanch-poster-card overflow-hidden rounded-[18px]">
                      {poster ? <img src={poster} alt={item.title || 'Video'} className="aspect-[4/5] w-full object-cover" /> : <div className="aspect-[4/5] bg-[hsl(var(--color-elevated))]" />}
                      <div className="space-y-1.5 p-2.5">
                        <p className="line-clamp-1 text-xs font-semibold text-text">{item.title || 'Untitled video'}</p>
                        <div className="flex flex-wrap gap-1.5 text-[10px] text-muted">
                          <Badge>{item.selected_model || item.provider_name || 'video'}</Badge>
                          <Badge>{item.status}</Badge>
                          <Badge>{item.aspect_ratio}</Badge>
                          {item.template_id ? <Badge>{item.template_id}</Badge> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/videos/${item.id}`} className="w-full">
                            <Button variant="secondary" className="w-full">Open</Button>
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
