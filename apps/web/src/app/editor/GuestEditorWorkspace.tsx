'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import { AudioLines, BetweenHorizontalStart, ChevronDown, Download, Film, GripHorizontal, Maximize2, Trash2, PanelLeftClose, PanelLeftOpen, PanelRight, Pause, Play, Plus, Redo2, SlidersHorizontal, Sparkles, Type, Undo2, Upload } from 'lucide-react';
import { getApiUrl } from '@/lib/env';
import { EditorInspector } from './EditorInspector';
import { ExportDialog, type ExportJobView } from './ExportDialog';
import { FilterGallery } from './FilterGallery';
import { GuestAudioLayer } from './GuestAudioLayer';
import { GuestMediaPreview } from './GuestMediaPreview';
import { GuestMediaThumbnail } from './GuestMediaThumbnail';
import { invalidateGuestMediaUrl } from './useGuestMediaUrl';
import { TextOverlayCanvas } from './TextOverlayCanvas';
import { TextLibrary } from './TextLibrary';
import { MultiTrackTimeline } from './timeline/MultiTrackTimeline';
import { activeItems, addItem, moveItem, projectItem, removeItem, resizeItem, splitItem, updateItem } from './timeline/model';
import { browserEffectStyle, effectsWithTemporaryPreview, vignetteOpacity } from './timeline/filters';
import type { EffectSection } from './timeline/filters';
import { serializeTimelineProject } from './timeline/serialization';
import { createEmptyProject, MAX_TIMELINE_SECONDS, type AudioTimelineItem, type EffectTimelineItem, type GuestMedia, type TextTimelineItem, type TimelineItem, type TimelineProject, type VideoTimelineItem } from './timeline/types';

type Props = { media: GuestMedia[]; uploadUsage?: { limits: { uploads: number }; remaining: { uploads: number } } | null };
const MAX_CLIPS = 12;
type WorkspaceTool = 'media' | 'audio' | 'text' | EffectSection;

export function GuestEditorWorkspace({ media: initialMedia, uploadUsage }: Props) {
  const [media, setMedia] = useState(initialMedia);
  const [project, setProject] = useState<TimelineProject>(() => createEmptyProject());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioTarget, setAudioTarget] = useState<'music' | 'sfx'>('music');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [deletingMediaIds, setDeletingMediaIds] = useState<Set<string>>(() => new Set());
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterPanelPosition, setFilterPanelPosition] = useState({ top: 80, left: 84 });
  const [timelineHeight, setTimelineHeight] = useState(260);
  const timelineResizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [hoveredMedia, setHoveredMedia] = useState<{ item: GuestMedia; top: number; left: number } | null>(null);
  const [effectSection, setEffectSection] = useState<EffectSection>('filters');
  const [filterPreview, setFilterPreview] = useState<EffectTimelineItem | undefined>();
  const [textPreview, setTextPreview] = useState<{ item: TextTimelineItem; targetId?: string }>();
  const [textPreviewTime, setTextPreviewTime] = useState(0);
  const [activeTool, setActiveTool] = useState<WorkspaceTool>('media');
  const [mobilePanel, setMobilePanel] = useState<'library' | 'inspector' | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportStatus, setExportStatus] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJobView | null>(null);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [remainingUploads, setRemainingUploads] = useState(uploadUsage?.remaining.uploads ?? 0);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const playbackStartedRef = useRef({ wallTime: 0, timelineTime: 0 });
  const downloadedExportIdsRef = useRef<Set<string>>(new Set());
  const lastProjectRef = useRef(project);
  const projectRevisionRef = useRef(0);
  const selectedItem = selectedItemId ? projectItem(project, selectedItemId) : undefined;
  const selectedText = selectedItem?.kind === 'text' ? selectedItem : undefined;
  const itemsAtPlayhead = useMemo(() => activeItems(project, playbackTime), [playbackTime, project]);
  const previewClip = itemsAtPlayhead.find((item): item is VideoTimelineItem => item.kind === 'video');
  const activeTexts = itemsAtPlayhead.filter((item): item is TextTimelineItem => item.kind === 'text');
  const activeEffects = itemsAtPlayhead.filter((item): item is EffectTimelineItem => item.kind === 'effect');
  const audioItems = project.tracks.flatMap((track) => track.items).filter((item): item is AudioTimelineItem => item.kind === 'audio');
  const clipCount = project.tracks.find((track) => track.id === 'video')?.items.length ?? 0;

  // A completed export represents a snapshot, not the current editable project.
  // Any timeline, aspect-ratio, or export-settings change makes that snapshot stale.
  useEffect(() => {
    if (lastProjectRef.current === project) return;
    lastProjectRef.current = project;
    projectRevisionRef.current += 1;
    setExportJob(null);
    setExportStatus('');
    setExportError('');
  }, [project]);

  useEffect(() => {
    if (!isPlaying) return;
    playbackStartedRef.current = { wallTime: performance.now(), timelineTime: playbackTime };
    let frame = 0;
    const tick = (now: number) => {
      const next = playbackStartedRef.current.timelineTime + (now - playbackStartedRef.current.wallTime) / 1000;
      if (next >= project.duration) { setPlaybackTime(project.duration); setIsPlaying(false); return; }
      setPlaybackTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, project.duration]);

  useEffect(() => {
    if (!textPreview) { setTextPreviewTime(0); return; }
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      setTextPreviewTime(((now - started) / 1000) % Math.max(0.25, textPreview.item.duration));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [textPreview]);

  useEffect(() => {
    if (!exportJob || !['queued', 'running'].includes(exportJob.status)) return;
    let cancelled = false;
    const revision = projectRevisionRef.current;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${getApiUrl()}/api/editor/exports/${exportJob.job_id}`, { credentials: 'include', cache: 'no-store' });
        const body = await response.json().catch(() => ({}));
        if (cancelled || revision !== projectRevisionRef.current) return;
        if (!response.ok) throw new Error(body.message || 'Export status is unavailable.');
        setExportJob(body as ExportJobView);
        if (body.status === 'completed') setExportStatus('Export completed.');
        if (body.status === 'failed') setExportStatus('Export failed.');
      } catch (error) {
        if (!cancelled && revision === projectRevisionRef.current) {
          setExportError(error instanceof Error ? error.message : 'Export status is unavailable.');
        }
      }
    }, 1500);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [exportJob?.job_id, exportJob?.status]);

  // Automatically download each successfully completed export once.
  // Keep the dialog's manual Download MP4 link as a fallback for browser restrictions.
  useEffect(() => {
    if (!exportJob || exportJob.status !== 'completed') return;

    const jobId = exportJob.job_id;
    if (downloadedExportIdsRef.current.has(jobId)) return;
    downloadedExportIdsRef.current.add(jobId);

    const link = document.createElement('a');
    link.href = `${getApiUrl()}/api/editor/exports/${encodeURIComponent(jobId)}/content`;
    link.download = exportJob.output?.filename || 'rangmanch-export.mp4';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, [exportJob]);

  // Keyboard shortcuts are scoped to the editor, never text fields or open dialogs.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing = target instanceof HTMLElement && (
        target.isContentEditable || Boolean(target.closest('input, textarea, select, button, a, [contenteditable="true"], [role="textbox"]'))
      );
      if (isEditing || event.altKey || event.ctrlKey || event.metaKey || exportOpen || showFilters || mobilePanel) return;
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        if (project.duration <= 0) return;
        if (!isPlaying && playbackTime >= project.duration) setPlaybackTime(0);
        setIsPlaying((current) => !current);
      } else if (event.key.toLowerCase() === 's' && selectedItemId && !event.repeat) {
        const item = projectItem(project, selectedItemId);
        if (item && (item.kind === 'video' || item.kind === 'audio')) {
          event.preventDefault();
          setIsPlaying(false);
          setProject(splitItem(project, selectedItemId, playbackTime, crypto.randomUUID()));
        }
      } else if (event.key === 'Home') {
        event.preventDefault(); setPlaybackTime(0); setIsPlaying(false);
      } else if (event.key === 'End') {
        event.preventDefault(); setPlaybackTime(project.duration); setIsPlaying(false);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); setIsPlaying(false);
        const step = event.shiftKey ? 5 : 1 / 30;
        setPlaybackTime((time) => Math.max(0, Math.min(project.duration,
          time + (event.key === 'ArrowRight' ? step : -step))));
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItemId) {
        event.preventDefault();
        setIsPlaying(false);
        const next = removeItem(project, selectedItemId);
        setProject(next);
        setPlaybackTime((time) => Math.min(time, next.duration));
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportOpen, showFilters, mobilePanel, project, selectedItemId, isPlaying, playbackTime]);

  function startTimelineResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    timelineResizeRef.current = { startY: event.clientY, startHeight: timelineHeight };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function moveTimelineResize(event: ReactPointerEvent<HTMLDivElement>) {
    const resize = timelineResizeRef.current;
    if (!resize) return;
    const maximum = Math.max(180, Math.min(600, window.innerHeight - 220));
    setTimelineHeight(Math.max(180, Math.min(maximum, resize.startHeight + resize.startY - event.clientY)));
  }

  function stopTimelineResize() { timelineResizeRef.current = null; }

  function togglePlayback() {
    if (project.duration <= 0) return;
    if (!isPlaying && playbackTime >= project.duration) setPlaybackTime(0);
    setIsPlaying((current) => !current);
  }

  function showMediaHover(item: GuestMedia, element: HTMLElement) {
    if (item.media_type === 'audio' || window.innerWidth < 768) return;
    const rect = element.getBoundingClientRect();
    setHoveredMedia({
      item,
      left: Math.max(8, Math.min(rect.right + 12, window.innerWidth - 328)),
      top: Math.max(8, Math.min(rect.top, window.innerHeight - 275)),
    });
  }

  function mutate(next: TimelineProject) {
    setProject(next);
    setPlaybackTime((time) => Math.min(time, Math.max(next.duration, 0)));
  }

  function addVisual(item: GuestMedia) {
    if (item.availability === 'unavailable' || !['image', 'video'].includes(item.media_type) || clipCount >= MAX_CLIPS || project.duration >= MAX_TIMELINE_SECONDS) return;
    const requested = item.media_type === 'image' ? 3 : Math.min(item.duration_seconds || 3, 8);
    const duration = Math.min(requested, MAX_TIMELINE_SECONDS - project.duration);
    if (duration < 0.25) return;
    const clip: VideoTimelineItem = { id: crypto.randomUUID(), kind: 'video', trackId: 'video', mediaId: item.media_id, contentType: item.content_type, label: item.original_filename, startTime: project.duration, duration, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 };
    mutate(addItem(project, clip)); setSelectedItemId(clip.id); setPlaybackTime(project.duration); setIsPlaying(false);
  }

  function addAudio(item: GuestMedia, trackId: 'music' | 'sfx' = audioTarget) {
    if (item.availability === 'unavailable' || item.media_type !== 'audio') return;
    const startTime = Math.min(playbackTime, MAX_TIMELINE_SECONDS - 0.25);
    const duration = Math.min(item.duration_seconds || 5, MAX_TIMELINE_SECONDS - startTime);
    const audio: AudioTimelineItem = { id: crypto.randomUUID(), kind: 'audio', trackId, mediaId: item.media_id, contentType: item.content_type, label: item.original_filename, startTime, duration, sourceStart: 0, muted: false, volume: trackId === 'music' ? 0.65 : 1 };
    mutate(addItem(project, audio)); setSelectedItemId(audio.id);
  }

  function openEffectPicker(section: EffectSection, anchor?: HTMLElement) {
    if (anchor && typeof window !== 'undefined') {
      const rect = anchor.getBoundingClientRect();
      setFilterPanelPosition({
        left: Math.max(8, Math.min(rect.right + 10, window.innerWidth - 540)),
        top: Math.max(8, Math.min(rect.top, window.innerHeight - 500)),
      });
    }
    setEffectSection(section); setFilterPreview(undefined); setShowFilters(true);
  }

  function chooseTool(tool: WorkspaceTool, anchor?: HTMLElement) {
    setActiveTool(tool);
    if (tool === 'text') { setTextPreview(undefined); setMobilePanel('library'); return; }
    if (tool === 'filters' || tool === 'effects' || tool === 'transitions') { openEffectPicker(tool, anchor); return; }
    setMobilePanel('library');
  }


  async function uploadVisualMedia(files: File[]) {
    if (!files.length || uploadingMedia) return;

    const allowedTypes = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'video/quicktime',
      'video/webm',
    ]);

    if (files.some((file) => !allowedTypes.has(file.type))) {
      setUploadError('Only JPG, PNG, WebP, MP4, MOV and WebM files are supported.');
      return;
    }

    if (files.length > remainingUploads) {
      setUploadError(
        `You can upload ${remainingUploads} more files in this guest session.`
      );
      return;
    }

    setUploadingMedia(true);
    setUploadError('');

    try {
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);

        const response = await fetch(
          `${getApiUrl()}/api/editor/media/upload`,
          {
            method: 'POST',
            credentials: 'include',
            headers: {
              'X-RangManch-Editor-CSRF': '1',
              'Idempotency-Key': crypto.randomUUID(),
            },
            body: form,
          }
        );

        if (!response.ok) {
          const body = await response.json().catch(() => ({}));

          throw new Error(
            body.error === 'guest_quota_exceeded'
              ? 'You have reached the guest upload limit.'
              : body.message || `Upload failed: ${file.name}`
          );
        }

        const uploaded = (await response.json()) as GuestMedia;

        setMedia((current) => [uploaded, ...current]);
        setRemainingUploads((current) => Math.max(0, current - 1));
      }
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Media upload failed.'
      );
    } finally {
      setUploadingMedia(false);
    }
  }


  async function uploadAudio(file: File) {
    setUploadingAudio(true); setUploadError('');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(`${getApiUrl()}/api/editor/media/upload`, { method: 'POST', credentials: 'include', headers: { 'X-RangManch-Editor-CSRF': '1', 'Idempotency-Key': crypto.randomUUID() }, body: form });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error === 'guest_quota_exceeded' ? 'You have reached the upload limit for this guest session.' : body.message || `Audio upload failed (${response.status})`); }
      const uploaded = await response.json() as GuestMedia;
      setMedia((current) => [uploaded, ...current]); setRemainingUploads((value) => Math.max(0, value - 1)); addAudio(uploaded, audioTarget);
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Audio upload failed.'); }
    finally { setUploadingAudio(false); }
  }

  function seek(time: number) { setPlaybackTime(Math.max(0, Math.min(time, MAX_TIMELINE_SECONDS))); if (isPlaying) playbackStartedRef.current = { wallTime: performance.now(), timelineTime: time }; }
  function selectItem(itemId: string) { setSelectedItemId(itemId); const item = projectItem(project, itemId); if (item) seek(item.startTime); setIsPlaying(false); }
  function patchSelected(updates: Partial<TimelineItem>) { if (!selectedItemId) return; mutate(updateItem(project, selectedItemId, updates)); }
  function removeSelected() { if (!selectedItemId) return; mutate(removeItem(project, selectedItemId)); setSelectedItemId(null); }
  function previewText(item?: TextTimelineItem) { setTextPreview(item ? { item, targetId: selectedText?.id } : undefined); }
  function applyTextDraft(item: TextTimelineItem, targetId?: string) {
    const committed = targetId ? { ...item, id: targetId } : item;
    const next = targetId ? updateItem(project, targetId, committed) : addItem(project, committed);
    mutate(next); setSelectedItemId(targetId ?? item.id); setTextPreview(undefined); setMobilePanel(null);
  }

  async function submitExport() {
    if (clipCount === 0) return;
    const unavailable = new Set(media.filter((item) => item.availability === 'unavailable').map((item) => item.media_id));
    const unavailableReference = project.tracks.some((track) => track.items.some((item) =>
      (item.kind === 'video' || item.kind === 'audio') && unavailable.has(item.mediaId)
    ));
    if (unavailableReference) {
      setExportError('Remove unavailable media from the timeline before exporting.');
      return;
    }
    const submittedRevision = projectRevisionRef.current;
    setExportSubmitting(true); setExportError(''); setExportStatus('Submitting export...'); setExportJob(null);
    try {
      const response = await fetch(`${getApiUrl()}/api/editor/exports`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-RangManch-Editor-CSRF': '1', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(serializeTimelineProject(project)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || `Export failed (${response.status})`);
      if (submittedRevision === projectRevisionRef.current) {
        setExportJob(body as ExportJobView); setExportStatus(`Export queued · ${body.job_id}`);
      }
    } catch (error) {
      if (submittedRevision === projectRevisionRef.current) {
        const message = error instanceof Error ? error.message : 'Export could not be submitted.';
        setExportError(message); setExportStatus(message);
      }
    }
    finally { setExportSubmitting(false); }
  }

  function isMediaReferenced(mediaId: string) {
    return project.tracks.some((track) => track.items.some((item) =>
      (item.kind === 'video' || item.kind === 'audio') && item.mediaId === mediaId
    ));
  }

  async function deleteMedia(item: GuestMedia) {
    if (isMediaReferenced(item.media_id) || deletingMediaIds.has(item.media_id)) return;
    if (!window.confirm(`Delete “${item.original_filename}” from this guest media library?`)) return;
    setDeletingMediaIds((current) => new Set(current).add(item.media_id));
    setUploadError('');
    try {
      const response = await fetch(`${getApiUrl()}/api/editor/media/${encodeURIComponent(item.media_id)}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-RangManch-Editor-CSRF': '1' },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Media deletion failed (${response.status})`);
      }
      invalidateGuestMediaUrl(item.media_id);
      setMedia((current) => current.filter((candidate) => candidate.media_id !== item.media_id));
      setHoveredMedia((current) => current?.item.media_id === item.media_id ? null : current);
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : 'Media deletion failed.');
    } finally {
      setDeletingMediaIds((current) => {
        const next = new Set(current); next.delete(item.media_id); return next;
      });
    }
  }

  const previewEffects = effectsWithTemporaryPreview(activeEffects, filterPreview ?? null);
  const previewStyle = browserEffectStyle(previewEffects, playbackTime);
  const vignette = vignetteOpacity(previewEffects);
  const visibleTexts = textPreview
    ? [...activeTexts.filter((text) => text.id !== textPreview.targetId), textPreview.item]
    : activeTexts;
  const tools: Array<{ id: WorkspaceTool; label: string; icon: typeof Film }> = [
    { id: 'media', label: 'Media', icon: Film }, { id: 'audio', label: 'Audio', icon: AudioLines },
    { id: 'text', label: 'Text', icon: Type }, { id: 'filters', label: 'Filters', icon: SlidersHorizontal },
    { id: 'effects', label: 'Effects', icon: Sparkles }, { id: 'transitions', label: 'Transitions', icon: BetweenHorizontalStart },
  ];
  const libraryItems = media.filter((item) => activeTool === 'audio' ? item.media_type === 'audio' : item.media_type !== 'audio');
  const mediaLibrary = <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold text-white">{activeTool === 'audio' ? 'Audio' : 'Media'}</h2><p className="mt-1 text-xs text-slate-400">{activeTool === 'audio' ? 'Music and sound effects' : 'Photos and video clips'}</p></div>
    {activeTool === 'audio' && <div className="flex gap-2 border-b border-white/10 p-3"><button type="button" onClick={() => setAudioTarget('music')} className={`min-h-9 flex-1 rounded-md text-xs font-semibold ${audioTarget === 'music' ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-300'}`}>Music</button><button type="button" onClick={() => setAudioTarget('sfx')} className={`min-h-9 flex-1 rounded-md text-xs font-semibold ${audioTarget === 'sfx' ? 'bg-amber-400 text-slate-950' : 'bg-white/5 text-slate-300'}`}>SFX</button></div>}
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
      {libraryItems.length === 0 && <div className="border border-dashed border-white/15 p-4 text-center text-xs leading-5 text-slate-400">No {activeTool === 'audio' ? 'audio' : 'visual media'} uploaded yet.</div>}
      {activeTool === 'media' && (
        <div className="border-b border-white/10 p-3">
          <button
            type="button"
            disabled={uploadingMedia || remainingUploads <= 0}
            onClick={() => mediaInputRef.current?.click()}
            className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-amber-400 px-3 text-xs font-semibold text-slate-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Upload className="h-4 w-4" />
            {uploadingMedia ? 'Uploading...' : 'Upload Photos & Videos'}
          </button>

          <p className="mt-2 text-center text-[11px] text-slate-500">
            {remainingUploads} uploads remaining
          </p>
        </div>
      )}
      {libraryItems.map((item) => (
        <div
          key={item.media_id}
          className="flex min-w-0 items-center gap-2 border-b border-white/10 py-2.5 last:border-0"
          onMouseEnter={(event) => showMediaHover(item, event.currentTarget)}
          onMouseLeave={() => setHoveredMedia(null)}
        >
          {item.media_type === 'audio' ? (
            <AudioLines className="h-10 w-10 shrink-0 rounded bg-white/5 p-2 text-slate-400" />
          ) : (
            <GuestMediaThumbnail mediaId={item.media_id} contentType={item.content_type} availability={item.availability} alt={item.original_filename} className="h-12 w-12 shrink-0 rounded-sm" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-medium text-slate-200" title={item.original_filename}>{item.original_filename}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-slate-500">
              {item.media_type}{item.duration_seconds ? ` · ${item.duration_seconds.toFixed(1)}s` : ''}
            </p>
            {item.media_type === 'audio' && item.availability !== 'unavailable' && (
              <audio
                controls
                preload="none"
                src={`${getApiUrl()}/api/editor/media/${encodeURIComponent(item.media_id)}/content`}
                aria-label={`Preview ${item.original_filename}`}
                className="mt-2 h-8 w-full max-w-[190px]"
              />
            )}
          </div>
          <button
            type="button"
            disabled={item.availability === 'unavailable' || (item.media_type !== 'audio' && (clipCount >= MAX_CLIPS || project.duration >= MAX_TIMELINE_SECONDS))}
            onClick={() => item.media_type === 'audio' ? addAudio(item, audioTarget) : addVisual(item)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-amber-400 text-slate-950 hover:bg-amber-300 disabled:opacity-40"
            aria-label={`Add ${item.original_filename} to timeline`}
            title="Add to timeline"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={isMediaReferenced(item.media_id) || deletingMediaIds.has(item.media_id)}
            onClick={() => void deleteMedia(item)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-red-500/10 hover:text-red-300 disabled:cursor-not-allowed disabled:opacity-35"
            aria-label={`Delete ${item.original_filename}`}
            title={isMediaReferenced(item.media_id) ? 'Remove this media from the timeline before deleting it' : 'Delete media'}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
    {activeTool === 'audio' && <div className="border-t border-white/10 p-3"><button type="button" disabled={uploadingAudio || remainingUploads <= 0} onClick={() => audioInputRef.current?.click()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-white disabled:opacity-40"><Upload className="h-4 w-4" />{uploadingAudio ? 'Uploading...' : 'Upload audio'}</button><p className="mt-2 text-[11px] leading-4 text-slate-500">Use audio you own or are licensed to use.</p></div>}
  </div>;
  return (
    <div className="flex min-h-dvh min-w-0 flex-col overflow-hidden bg-[#0a0a0f] text-slate-100 lg:h-dvh lg:min-h-0">
      <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAudio(file); event.target.value = ''; }} />
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        multiple
        hidden
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length) void uploadVisualMedia(files);
          event.target.value = '';
        }}
      />
      <header className="flex min-h-14 items-center gap-2 border-b border-white/10 bg-[#111118] px-3 sm:px-4">
        <button type="button" onClick={() => setSidebarOpen((value) => !value)} className="hidden h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 md:grid lg:hidden" aria-label={sidebarOpen ? 'Hide tools' : 'Show tools'}>{sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}</button>
        <div className="min-w-0"><p className="truncate text-sm font-semibold">Untitled reel</p><p className="hidden text-[11px] text-slate-500 sm:block">Guest project · saved for this session</p></div>
        <div className="ml-2 hidden items-center gap-1 sm:flex"><button type="button" disabled title="Undo history is not available yet" aria-label="Undo unavailable" className="grid h-9 w-9 place-items-center rounded-md text-slate-600"><Undo2 className="h-4 w-4" /></button><button type="button" disabled title="Redo history is not available yet" aria-label="Redo unavailable" className="grid h-9 w-9 place-items-center rounded-md text-slate-600"><Redo2 className="h-4 w-4" /></button></div>
        <div className="ml-auto flex items-center gap-2"><span className="hidden text-xs tabular-nums text-slate-400 md:block">{playbackTime.toFixed(1)} / {project.duration.toFixed(1)}s</span><button type="button" disabled={project.duration === 0} onClick={togglePlayback} className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-white disabled:opacity-40" aria-label={isPlaying ? 'Pause preview' : 'Play preview'}>{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}</button><button type="button" onClick={() => setMobilePanel('inspector')} className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 lg:hidden" aria-label="Open inspector"><PanelRight className="h-4 w-4" /></button><button type="button" disabled={!selectedItemId} onClick={() => { setIsPlaying(false); removeSelected(); }} title="Remove selected timeline item (Delete)" aria-label="Remove selected timeline item" className="grid h-9 w-9 place-items-center rounded-md text-rose-300 hover:bg-rose-500/10 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button><button type="button" disabled={clipCount === 0} onClick={() => { setExportError(''); setExportOpen(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-amber-400 px-3 text-xs font-bold text-slate-950 disabled:opacity-40 sm:px-4"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span></button></div>
      </header>
      {(uploadError || exportStatus) && <div className="border-b border-white/10 bg-[#111118] px-4 py-2 text-xs"><span role={uploadError ? 'alert' : 'status'} className={uploadError ? 'text-red-300' : 'text-amber-300'}>{uploadError || exportStatus}</span></div>}

      <div className={`grid min-h-0 min-w-0 flex-1 overflow-hidden ${sidebarOpen ? 'md:grid-cols-[240px_minmax(0,1fr)]' : 'md:grid-cols-[minmax(0,1fr)]'} lg:grid-cols-[352px_minmax(0,1fr)_288px]`}>
        <aside className={`${sidebarOpen ? 'hidden md:flex' : 'hidden'} min-h-0 min-w-0 overflow-hidden border-r border-white/10 bg-[#111118] lg:flex`}>
          <nav aria-label="Editor tools" className="flex w-[72px] shrink-0 flex-col border-r border-white/10 py-2">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={(event) => chooseTool(id, event.currentTarget)} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${activeTool === id ? 'bg-white/10 text-amber-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon className="h-5 w-5" />{label}</button>)}</nav>
          {(activeTool === 'media' || activeTool === 'audio') ? mediaLibrary : activeTool === 'text' ? <TextLibrary key={selectedText?.id ?? 'new-text'} selectedText={selectedText} startTime={Math.min(playbackTime, 55)} onPreview={previewText} onApply={applyTextDraft} onCancel={() => { setTextPreview(undefined); setActiveTool('media'); }} /> : <div className="p-4 text-xs leading-5 text-slate-400">Choose an option to open its editing panel.</div>}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-[#0d0d13]">
          <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-b border-white/10 px-3">
            <label htmlFor="editor-aspect-ratio" className="text-xs text-slate-400">Canvas</label>
            <select
              id="editor-aspect-ratio"
              value={project.aspectRatio}
              onChange={(event) => setProject((current) => ({ ...current, aspectRatio: event.target.value as TimelineProject['aspectRatio'] }))}
              className="rounded-md border border-white/15 bg-[#1c1c26] px-2 py-1 text-xs text-white"
              aria-label="Video aspect ratio"
            >
              <option value="9:16">9:16 · Reels / Shorts</option>
              <option value="16:9">16:9 · YouTube</option>
              <option value="1:1">1:1 · Square</option>
              <option value="4:5">4:5 · Portrait</option>
            </select>
          </div>
          <section className="flex min-h-[180px] min-w-0 flex-1 items-center justify-center overflow-hidden p-3 sm:min-h-[220px] sm:p-5 lg:min-h-0">
            <div className={`relative max-h-full max-w-full overflow-hidden bg-black shadow-2xl shadow-black/50 ${project.aspectRatio === '9:16' || project.aspectRatio === '4:5' ? 'h-full w-auto' : 'h-auto w-full'}`} style={{ aspectRatio: project.aspectRatio.replace(':', ' / ') }} data-testid="editor-preview-canvas" onPointerDown={() => setSelectedItemId(null)}>
              <div className="absolute inset-0 overflow-hidden" style={previewStyle}>{previewClip ? <GuestMediaPreview mediaId={previewClip.mediaId} contentType={previewClip.contentType} filename={previewClip.label} isPlaying={isPlaying} localTime={previewClip.sourceStart + playbackTime - previewClip.startTime} muted={previewClip.muted} volume={previewClip.volume} cropMode={previewClip.cropMode} /> : clipCount === 0 ? <div className="grid h-full place-items-center px-6 text-center text-sm text-white/60">Add photos or videos to begin</div> : null}</div>
              {vignette > 0 && <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 100px rgba(0,0,0,${vignette})` }} />}
              {visibleTexts.map((text) => <TextOverlayCanvas key={`${text.id}-${textPreview?.item === text ? 'preview' : 'saved'}`} item={text} selected={!textPreview && selectedItemId === text.id} animationTime={textPreview?.item === text ? textPreviewTime : playbackTime - text.startTime} onSelect={() => { if (textPreview) return; setSelectedItemId(text.id); setIsPlaying(false); }} onUpdate={(updates) => { if (textPreview?.item === text) setTextPreview({ ...textPreview, item: { ...text, ...updates } as TextTimelineItem }); else mutate(updateItem(project, text.id, updates)); }} />)}
            </div>
          </section>
          <div className="flex h-10 shrink-0 items-center justify-between border-t border-white/10 px-3 text-[11px] text-slate-500"><span>{remainingUploads}/{uploadUsage?.limits.uploads ?? 0} uploads · {clipCount}/{MAX_CLIPS} clips</span><span>{project.duration.toFixed(1)}/{MAX_TIMELINE_SECONDS}s</span></div>
          {audioItems.map((item) => <GuestAudioLayer key={item.id} item={item} playbackTime={playbackTime} isPlaying={isPlaying} />)}
        </main>

        <EditorInspector className="hidden min-h-0 overflow-y-auto border-l border-white/10 lg:block" item={selectedItem} onUpdate={patchSelected} onRemove={removeSelected} />
      </div>
      <div className="relative shrink-0 border-t border-white/10" style={{ height: timelineHeight }}>
        <div
          role="separator"
          aria-label="Resize timeline"
          aria-orientation="horizontal"
          aria-valuemin={180}
          aria-valuemax={600}
          aria-valuenow={timelineHeight}
          tabIndex={0}
          onPointerDown={startTimelineResize}
          onPointerMove={moveTimelineResize}
          onPointerUp={stopTimelineResize}
          onPointerCancel={stopTimelineResize}
          onLostPointerCapture={stopTimelineResize}
          onKeyDown={(event) => {
            if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              setTimelineHeight((height) => Math.max(180, Math.min(600, height + (event.key === 'ArrowUp' ? 30 : -30))));
            }
          }}
          className="group absolute inset-x-0 -top-2 z-20 flex h-4 cursor-row-resize touch-none items-center justify-center focus-visible:outline focus-visible:outline-amber-400"
        >
          <span className="flex items-center gap-1 rounded-md border border-white/20 bg-[#22222d] px-3 py-0.5 text-slate-300 opacity-60 shadow-lg transition-opacity group-hover:opacity-100 group-focus:opacity-100">
            <GripHorizontal className="h-4 w-4" /><Maximize2 className="h-3 w-3" />
          </span>
        </div>
        <div className="h-full overflow-hidden">
          <MultiTrackTimeline project={project} playbackTime={playbackTime} selectedItemId={selectedItemId} onSelectItem={selectItem} onSeek={seek} onMoveItem={(id, start) => mutate(moveItem(project, id, start))} onResizeItem={(id, edge, time) => mutate(resizeItem(project, id, edge, time))} onDeleteSelected={removeSelected} onSplitSelected={() => { if (selectedItemId) { setIsPlaying(false); mutate(splitItem(project, selectedItemId, playbackTime, crypto.randomUUID())); } }} />
        </div>
      </div>

      <nav aria-label="Mobile editor tools" className="flex shrink-0 gap-1 overflow-x-auto border-t border-white/10 bg-[#111118] px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => chooseTool(id)} className={`flex min-h-12 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-md text-[10px] ${activeTool === id ? 'bg-white/10 text-amber-300' : 'text-slate-400'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

      {mobilePanel && <div className="fixed inset-0 z-40 bg-black/55 lg:hidden" onPointerDown={() => { setTextPreview(undefined); setMobilePanel(null); }}><section data-testid="mobile-editor-sheet" className="absolute inset-x-0 bottom-0 flex max-h-[72vh] min-h-[280px] flex-col border-t border-white/10 bg-[#111118] pb-[env(safe-area-inset-bottom)] shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>{activeTool === 'text' && mobilePanel === 'library' ? <TextLibrary key={selectedText?.id ?? 'new-text-mobile'} selectedText={selectedText} startTime={Math.min(playbackTime, 55)} onPreview={previewText} onApply={applyTextDraft} onCancel={() => { setTextPreview(undefined); setMobilePanel(null); }} /> : <><div className="flex min-h-12 items-center justify-between border-b border-white/10 px-4"><span className="text-sm font-semibold">{mobilePanel === 'inspector' ? 'Inspector' : activeTool === 'audio' ? 'Audio' : 'Media'}</span><button type="button" onClick={() => setMobilePanel(null)} className="grid h-10 w-10 place-items-center rounded-md text-slate-300" aria-label="Close panel"><ChevronDown className="h-5 w-5" /></button></div>{mobilePanel === 'inspector' ? <EditorInspector className="min-h-0 flex-1 overflow-y-auto" item={selectedItem} onUpdate={patchSelected} onRemove={removeSelected} /> : mediaLibrary}</>}</section></div>}
      {hoveredMedia && !showFilters && (
        <div
          className="pointer-events-none fixed z-40 hidden w-[310px] rounded-lg border border-white/15 bg-[#171720] p-3 shadow-2xl md:block"
          style={{ top: hoveredMedia.top, left: hoveredMedia.left }}
        >
          {hoveredMedia.item.media_type === 'video' ? (
            <video
              key={hoveredMedia.item.media_id}
              src={`${getApiUrl()}/api/editor/media/${encodeURIComponent(hoveredMedia.item.media_id)}/content`}
              autoPlay muted loop playsInline preload="metadata"
              className="h-44 w-full rounded bg-black object-contain"
            />
          ) : (
            <GuestMediaThumbnail
              mediaId={hoveredMedia.item.media_id}
              contentType={hoveredMedia.item.content_type}
              alt={hoveredMedia.item.original_filename}
              className="h-44 w-full rounded bg-black object-contain"
            />
          )}
          <p className="mt-2 truncate text-xs text-slate-200">{hoveredMedia.item.original_filename}</p>
        </div>
      )}
      {showFilters && (
        <div className="fixed inset-0 z-50 bg-black/55 md:bg-transparent" onPointerDown={() => { setFilterPreview(undefined); setShowFilters(false); }}>
          <div
            className="absolute inset-x-0 bottom-0 max-h-[78vh] overflow-y-auto border-t border-white/10 bg-[#111118] pb-[env(safe-area-inset-bottom)] shadow-2xl md:fixed md:inset-auto md:top-[var(--filter-top)] md:left-[var(--filter-left)] md:max-h-[min(75vh,490px)] md:w-[min(520px,calc(100vw-2rem))] md:rounded-lg md:border md:pb-0"
            style={{ '--filter-top': `${filterPanelPosition.top}px`, '--filter-left': `${filterPanelPosition.left}px` } as CSSProperties}
            onPointerDown={(event) => event.stopPropagation()}
          >
            <FilterGallery
              key={effectSection}
              mediaId={previewClip?.mediaId}
              contentType={previewClip?.contentType}
              effectStartTime={previewClip?.startTime ?? 0}
              effectDuration={previewClip?.duration ?? project.duration}
              initialSection={effectSection}
              onPreview={setFilterPreview}
              onApply={(effect) => { mutate(addItem(project, effect)); setSelectedItemId(effect.id); setShowFilters(false); }}
              onCancel={() => { setFilterPreview(undefined); setShowFilters(false); }}
            />
          </div>
        </div>
      )}
      <ExportDialog open={exportOpen} aspectRatio={project.aspectRatio} settings={project.exportSettings} job={exportJob} submitting={exportSubmitting} error={exportError} onClose={() => setExportOpen(false)} onAspectRatio={(aspectRatio) => setProject((current) => ({ ...current, aspectRatio }))} onSettings={(exportSettings) => setProject((current) => ({ ...current, exportSettings }))} onExport={() => void submitExport()} onRetry={() => void submitExport()} downloadUrl={exportJob?.status === 'completed' ? `${getApiUrl()}/api/editor/exports/${exportJob.job_id}/content` : undefined} />
    </div>
  );
}
