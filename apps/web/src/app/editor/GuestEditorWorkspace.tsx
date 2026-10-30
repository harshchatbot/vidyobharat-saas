'use client';

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { AudioLines, BetweenHorizontalStart, ChevronDown, Download, Film, GripHorizontal, Maximize2, Trash2, PanelLeftClose, PanelLeftOpen, PanelRight, Pause, Play, Plus, Redo2, SlidersHorizontal, Sparkles, Type, Undo2, Upload } from 'lucide-react';
import Link from 'next/link';
import { generateChatResponse } from '@/lib/browser-ai/webllmService';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { onAuthStateChanged } from 'firebase/auth';
import { getApiUrl } from '@/lib/env';
import { EditorInspector } from './EditorInspector';
import { CopilotPanel } from './CopilotPanel';
import { analyzeUploadedMusic, CopilotClientError, isAbortError, isBrowserCopilotEnabled, requestBrowserCopilotPlan, requestCopilotPlan, type CopilotHistoryMessage, type CopilotProposal } from './copilot';
import type { BrowserAiProgress } from '@/lib/browser-ai/webllmService';
import { ExportDialog, type ExportJobView } from './ExportDialog';
import { FilterGallery } from './FilterGallery';
import { GuestAudioLayer } from './GuestAudioLayer';
import { catalogMediaId, catalogPlaybackUrl, fetchAudioLibrary, type AudioLibraryEntry } from './audioLibrary';
import { GuestMediaPreview } from './GuestMediaPreview';
import { GuestMediaThumbnail } from './GuestMediaThumbnail';
import { invalidateGuestMediaUrl } from './useGuestMediaUrl';
import { TextOverlayCanvas } from './TextOverlayCanvas';
import { TextLibrary } from './TextLibrary';
import { MultiTrackTimeline } from './timeline/MultiTrackTimeline';
import { activeItems, addItem, moveItem, projectItem, quantizeTimelineTime, removeItem, reorderVideo, resizeItem, splitItem, updateItem, visualTimelineEnd } from './timeline/model';
import { browserEffectStyle, effectsWithTemporaryPreview, transitionProgress, vignetteOpacity } from './timeline/filters';
import type { EffectSection } from './timeline/filters';
import { normalizeExportFilename } from './timeline/serialization';
import { exportTimelineMp4, supportsBrowserMp4Export } from '@/lib/browser-ai/browserMp4Export';
import { buildAutoEditPlan, type AutoEditMode, type AutoEditStyle } from './autoEdit';
import { classifyBrowserConversation } from '@/lib/browser-ai/browserIntent';
import { applyProjectChange, beginProjectTransaction, canRedoProject, canUndoProject, commitProjectTransaction, createProjectHistory, redoProjectChange, undoProjectChange } from './timeline/history';
import { applyEditPlan, calculateProjectRevision } from './timeline/editPlan';
import { createEmptyProject, MAX_TIMELINE_SECONDS, type AudioTimelineItem, type EffectTimelineItem, type GuestMedia, type TextTimelineItem, type TimelineItem, type TimelineProject, type VideoTimelineItem } from './timeline/types';
import { IndeterminateProgress, StatusTransition } from '@/components/ui/MotionPrimitives';

type Props = { media: GuestMedia[]; uploadUsage?: { limits: { uploads: number }; remaining: { uploads: number } } | null };
const MAX_CLIPS = 12;
type WorkspaceTool = 'media' | 'audio' | 'text' | EffectSection;

export function GuestEditorWorkspace({ media: initialMedia, uploadUsage }: Props) {
  const [media, setMedia] = useState(initialMedia);
  const [projectHistory, setProjectHistory] = useState(() => createProjectHistory(createEmptyProject()));
  const project = projectHistory.present;
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioTarget, setAudioTarget] = useState<'music' | 'sfx'>('music');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [audioLibrary, setAudioLibrary] = useState<AudioLibraryEntry[]>([]);
  const [audioLibraryQuery, setAudioLibraryQuery] = useState('');
  const [audioLibraryLoading, setAudioLibraryLoading] = useState(false);
  const [audioLibraryError, setAudioLibraryError] = useState('');
  const [audioLibraryTab, setAudioLibraryTab] = useState<'music' | 'sfx'>('music');
  const [previewingCatalogId, setPreviewingCatalogId] = useState<string | null>(null);
  const catalogAudioRef = useRef<HTMLAudioElement | null>(null);
  const [deletingMediaIds, setDeletingMediaIds] = useState<Set<string>>(() => new Set());
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState('');
  const [uploadNotice, setUploadNotice] = useState('');
  const [uploadingFilename, setUploadingFilename] = useState('');
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
  const [mobilePanel, setMobilePanel] = useState<'library' | 'inspector' | 'copilot' | null>(null);
  const [rightPanel, setRightPanel] = useState<'inspector' | 'copilot'>('inspector');
  const [copilotHistory, setCopilotHistory] = useState<CopilotHistoryMessage[]>([]);
  const [copilotProposal, setCopilotProposal] = useState<CopilotProposal | null>(null);
  const [copilotError, setCopilotError] = useState<CopilotClientError | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [copilotProgress, setCopilotProgress] = useState<BrowserAiProgress | null>(null);
  const [serverVerifiedAdmin, setServerVerifiedAdmin] = useState(false);
  const [authenticatedCreator, setAuthenticatedCreator] = useState(false);
  const [authHydrated, setAuthHydrated] = useState(false);
  const copilotEpochRef = useRef(0);
  const copilotAbortRef = useRef<AbortController | null>(null);
  const copilotSubmittingRef = useRef(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [exportStatus, setExportStatus] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportJob, setExportJob] = useState<ExportJobView | null>(null);
  const [exportSubmitting, setExportSubmitting] = useState(false);
  const exportAbortRef = useRef<AbortController | null>(null);
  const [exportError, setExportError] = useState('');
  const [localExportUrl, setLocalExportUrl] = useState<string | null>(null);
  const [autoEditOpen, setAutoEditOpen] = useState(false);
  const [autoEditStyle, setAutoEditStyle] = useState<AutoEditStyle>('elegant');
  const [autoEditMode, setAutoEditMode] = useState<AutoEditMode>('add');
  const [autoEditTitle, setAutoEditTitle] = useState('');
  const [autoEditError, setAutoEditError] = useState('');
  const localExportUrlRef = useRef<string | null>(null);
  localExportUrlRef.current = localExportUrl;
  const [remainingUploads, setRemainingUploads] = useState(uploadUsage?.remaining.uploads ?? 0);
  const [exportUsage] = useState<{
    remaining: { exports: number };
    limits: { exports: number };
  } | null>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const playbackStartedRef = useRef({ wallTime: 0, timelineTime: 0 });
  const downloadedExportIdsRef = useRef<Set<string>>(new Set());
  const lastProjectRef = useRef(project);
  const projectRevisionRef = useRef(0);
  const committedProjectRef = useRef(project);
  committedProjectRef.current = project;
  const displayProject = copilotProposal?.applied.project ?? project;
  const proposalActive = Boolean(copilotProposal);
  const selectedItem = selectedItemId ? projectItem(displayProject, selectedItemId) : undefined;
  const selectedText = selectedItem?.kind === 'text' ? selectedItem : undefined;
  const itemsAtPlayhead = useMemo(() => activeItems(displayProject, playbackTime), [playbackTime, displayProject]);
  const visuals = displayProject.tracks.find((track) => track.id === 'video')?.items.filter((item): item is VideoTimelineItem => item.kind === 'video') ?? [];
  const visualEnd = visualTimelineEnd(displayProject);
  const heldFinalClip = displayProject.extensionExplicit && playbackTime >= visualEnd
    ? [...visuals].sort((a, b) => a.startTime - b.startTime).at(-1)
    : undefined;
  const previewClip = itemsAtPlayhead.find((item): item is VideoTimelineItem => item.kind === 'video') ?? heldFinalClip;
  const activeTexts = itemsAtPlayhead.filter((item): item is TextTimelineItem => item.kind === 'text');
  const activeEffects = itemsAtPlayhead.filter((item): item is EffectTimelineItem => item.kind === 'effect');
  const audioItems = displayProject.tracks.flatMap((track) => track.items).filter((item): item is AudioTimelineItem => item.kind === 'audio');
  useEffect(() => {
    if (activeTool !== 'audio') return;
    let cancelled = false;
    setAudioLibraryLoading(true); setAudioLibraryError('');
    void fetchAudioLibrary(undefined, audioLibraryQuery).then((items) => { if (!cancelled) setAudioLibrary(items); }).catch((error) => { if (!cancelled) setAudioLibraryError(error instanceof Error ? error.message : 'Audio library unavailable.'); }).finally(() => { if (!cancelled) setAudioLibraryLoading(false); });
    return () => { cancelled = true; };
  }, [activeTool, audioLibraryQuery, audioLibraryTab]);
  const clipCount = displayProject.tracks.find((track) => track.id === 'video')?.items.length ?? 0;

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

  useEffect(() => () => {
    copilotEpochRef.current += 1;
    copilotAbortRef.current?.abort();
    if (localExportUrlRef.current) URL.revokeObjectURL(localExportUrlRef.current);
  }, []);

  useEffect(() => {
    let active = true;
    try {
      const unsubscribe = onAuthStateChanged(getFirebaseAuth(), (user) => {
        if (active) { setAuthenticatedCreator(Boolean(user)); setAuthHydrated(true); }
      });
      return () => { active = false; unsubscribe(); };
    } catch {
      setAuthenticatedCreator(false); setAuthHydrated(true);
      return () => { active = false; };
    }
  }, []);

  useEffect(() => {
    let active = true;
    fetch('/api/admin/session', { cache: 'no-store' })
      .then((response) => response.ok ? response.json() : null)
      .then((body) => { if (active) setServerVerifiedAdmin(Boolean(body?.admin)); })
      .catch(() => { if (active) setServerVerifiedAdmin(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    playbackStartedRef.current = { wallTime: performance.now(), timelineTime: playbackTime };
    let frame = 0;
    const tick = (now: number) => {
      const next = playbackStartedRef.current.timelineTime + (now - playbackStartedRef.current.wallTime) / 1000;
      if (next >= displayProject.duration) { setPlaybackTime(displayProject.duration); setIsPlaying(false); return; }
      setPlaybackTime(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, displayProject.duration]);

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
        if (body.status === 'completed' || body.status === 'failed') {
        }
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
      const key = event.key.toLowerCase();
      const commandKey = event.metaKey || event.ctrlKey;
      const undoShortcut = commandKey && key === 'z' && !event.shiftKey;
      const redoShortcut = commandKey && ((key === 'z' && event.shiftKey) || (event.ctrlKey && key === 'y'));
      if (!event.altKey && (undoShortcut || redoShortcut)) {
        event.preventDefault();
        if (proposalActive) return;
        if (redoShortcut) redoProject(); else undoProject();
        return;
      }
      if (isEditing || event.altKey || commandKey || exportOpen || showFilters || mobilePanel) return;
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault();
        if (displayProject.duration <= 0) return;
        if (!isPlaying && playbackTime >= displayProject.duration) setPlaybackTime(0);
        setIsPlaying((current) => !current);
      } else if (event.key.toLowerCase() === 's' && selectedItemId && !event.repeat && !proposalActive) {
        const item = projectItem(project, selectedItemId);
        if (item && (item.kind === 'video' || item.kind === 'audio')) {
          event.preventDefault();
          setIsPlaying(false);
          mutate(splitItem(project, selectedItemId, playbackTime, crypto.randomUUID()));
        }
      } else if (event.key === 'Home') {
        event.preventDefault(); setPlaybackTime(0); setIsPlaying(false);
      } else if (event.key === 'End') {
        event.preventDefault(); setPlaybackTime(displayProject.duration); setIsPlaying(false);
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); setIsPlaying(false);
        const step = event.shiftKey ? 5 : 1 / 30;
        setPlaybackTime((time) => Math.max(0, Math.min(displayProject.duration,
          time + (event.key === 'ArrowRight' ? step : -step))));
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && selectedItemId && !proposalActive) {
        event.preventDefault();
        setIsPlaying(false);
        const next = removeItem(project, selectedItemId);
        mutate(next);
        setPlaybackTime((time) => Math.min(time, next.duration));
        setSelectedItemId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exportOpen, showFilters, mobilePanel, project, displayProject, selectedItemId, isPlaying, playbackTime, proposalActive]);

  useEffect(() => {
    setPlaybackTime((time) => Math.min(time, Math.max(displayProject.duration, 0)));
    if (selectedItemId && !projectItem(displayProject, selectedItemId)) setSelectedItemId(null);
  }, [displayProject, selectedItemId]);

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
    if (displayProject.duration <= 0) return;
    if (!isPlaying && playbackTime >= displayProject.duration) setPlaybackTime(0);
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

  function mutate(next: TimelineProject | ((current: TimelineProject) => TimelineProject), transactionKey?: string) {
    if (proposalActive) return;
    invalidateCopilot();
    setProjectHistory((history) => applyProjectChange(history,
      typeof next === 'function' ? next(history.present) : next,
      transactionKey));
  }

  function beginProjectEdit(key: string) {
    if (proposalActive) return;
    setProjectHistory((history) => beginProjectTransaction(history, key));
  }

  function endProjectEdit(key: string) {
    if (proposalActive) return;
    setProjectHistory((history) => commitProjectTransaction(history, key));
  }

  function clearProjectPreviews() {
    setFilterPreview(undefined);
    setTextPreview(undefined);
    setIsPlaying(false);
  }

  function undoProject() {
    if (proposalActive) return;
    invalidateCopilot();
    clearProjectPreviews();
    setProjectHistory((history) => undoProjectChange(history));
  }

  function redoProject() {
    if (proposalActive) return;
    invalidateCopilot();
    clearProjectPreviews();
    setProjectHistory((history) => redoProjectChange(history));
  }

  function invalidateCopilot(reason?: 'stale') {
    copilotEpochRef.current += 1;
    copilotAbortRef.current?.abort();
    copilotAbortRef.current = null;
    setCopilotLoading(false);
    setCopilotProposal(null);
    if (reason === 'stale') {
      setCopilotError(new CopilotClientError('stale', 'The project changed. Generate a new proposal.', true));
    }
  }

  async function submitCopilotPrompt(prompt: string) {
    if (copilotSubmittingRef.current) return;
    copilotSubmittingRef.current = true;
    invalidateCopilot();
    const conversational = classifyBrowserConversation(prompt, committedProjectRef.current, media);
    if (conversational && isBrowserCopilotEnabled) {
      const epoch = copilotEpochRef.current;
      const history = [
        ...copilotHistory.slice(-8),
        { role: 'user' as const, content: prompt },
      ];

      setCopilotError(null);
      setCopilotProgress(null);
      setCopilotLoading(true);
      setCopilotHistory(history);

      try {
        const answer = await generateChatResponse(history);

        if (epoch !== copilotEpochRef.current) return;

        setCopilotHistory((current) => [
          ...current,
          { role: 'assistant' as const, content: answer },
        ].slice(-12));
      } catch (error) {
        if (epoch !== copilotEpochRef.current) return;

        setCopilotError(
          new CopilotClientError(
            'invalid',
            error instanceof Error
              ? error.message
              : 'RangManch AI could not respond.'
          )
        );
      } finally {
        if (epoch === copilotEpochRef.current) {
          setCopilotLoading(false);
          setCopilotProgress(null);
        }
        copilotSubmittingRef.current = false;
      }

      return;
    }
    if (conversational) {
      setCopilotError(null);
      setCopilotProgress(null);
      setCopilotHistory((current) => [
        ...current,
        { role: 'user' as const, content: prompt },
        { role: 'assistant' as const, content: conversational.message },
      ].slice(-12));
      copilotSubmittingRef.current = false;
      return;
    }
    const epoch = copilotEpochRef.current;
    const baseProject = committedProjectRef.current;
    const controller = new AbortController();
    copilotAbortRef.current = controller;
    setCopilotError(null);
    setCopilotProgress(null);
    setCopilotLoading(true);
    setCopilotHistory((current) => [...current, { role: 'user' as const, content: prompt }].slice(-12));
    try {
      const baseRevision = await calculateProjectRevision(baseProject);
      if (epoch !== copilotEpochRef.current || committedProjectRef.current !== baseProject) return;
      const response = isBrowserCopilotEnabled
        ? await requestBrowserCopilotPlan({ project: baseProject, projectRevision: baseRevision, prompt, media, onProgress: setCopilotProgress })
        : await requestCopilotPlan({
          project: baseProject,
          projectRevision: baseRevision,
          prompt,
          history: copilotHistory.slice(-6),
          signal: controller.signal,
        });
      if (epoch !== copilotEpochRef.current || committedProjectRef.current !== baseProject) return;
      const applied = await applyEditPlan(baseProject, response.plan);
      if (epoch !== copilotEpochRef.current || committedProjectRef.current !== baseProject || applied.previousRevision !== baseRevision) return;
      setCopilotProposal({ epoch, baseProject, baseRevision, applied, response });
      setCopilotHistory((current) => [...current, { role: 'assistant' as const, content: response.plan.summary }].slice(-12));
      setPlaybackTime((time) => Math.min(time, applied.project.duration));
      setIsPlaying(false);
    } catch (error) {
      if (epoch !== copilotEpochRef.current || isAbortError(error)) return;
      setCopilotError(error instanceof CopilotClientError
        ? error
        : new CopilotClientError('invalid', error instanceof Error ? error.message : 'Copilot could not create a safe proposal.'));
    } finally {
      if (epoch === copilotEpochRef.current) {
        setCopilotLoading(false);
        setCopilotProgress(null);
        copilotAbortRef.current = null;
      }
      copilotSubmittingRef.current = false;
    }
  }

  async function applyCopilotProposal() {
    const proposal = copilotProposal;
    if (!proposal || proposal.epoch !== copilotEpochRef.current) return;
    const latest = committedProjectRef.current;
    try {
      const applied = await applyEditPlan(latest, proposal.response.plan);
      if (proposal.epoch !== copilotEpochRef.current || committedProjectRef.current !== latest) {
        invalidateCopilot('stale');
        return;
      }
      let committed = false;
      flushSync(() => {
        setProjectHistory((history) => {
          if (proposal.epoch !== copilotEpochRef.current || history.present !== latest) return history;
          committed = true;
          return applyProjectChange(history, applied.project);
        });
      });
      if (!committed) {
        invalidateCopilot('stale');
        return;
      }
      copilotEpochRef.current += 1;
      setCopilotProposal(null);
      setCopilotError(null);
      setPlaybackTime((time) => Math.min(time, applied.project.duration));
    } catch {
      invalidateCopilot('stale');
    }
  }

  function addVisual(item: GuestMedia) {
    if (item.availability === 'unavailable' || !['image', 'video'].includes(item.media_type) || clipCount >= MAX_CLIPS || visualTimelineEnd(project) >= MAX_TIMELINE_SECONDS) return;
    const requested = item.media_type === 'image' ? 3 : Math.min(item.duration_seconds || 3, 8);
    const startTime = visualTimelineEnd(project);
    const duration = Math.min(requested, MAX_TIMELINE_SECONDS - startTime);
    if (duration < 0.25) return;
    const clip: VideoTimelineItem = { id: crypto.randomUUID(), kind: 'video', trackId: 'video', mediaId: item.media_id, contentType: item.content_type, label: item.original_filename, startTime, duration, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 };
    mutate(addItem(project, clip)); setSelectedItemId(clip.id); setPlaybackTime(startTime); setIsPlaying(false);
  }

  function addAudio(item: GuestMedia, trackId: 'music' | 'sfx' = audioTarget) {
    if (item.availability === 'unavailable' || item.media_type !== 'audio') return;
    const startTime = Math.min(playbackTime, MAX_TIMELINE_SECONDS - 0.25);
    const id = crypto.randomUUID();
    mutate((current) => {
      const boundary = visualTimelineEnd(current) || MAX_TIMELINE_SECONDS;
      const duration = Math.min(item.duration_seconds || 5, Math.max(0.25, boundary - startTime));
      const audio: AudioTimelineItem = { id, kind: 'audio', trackId, mediaId: item.media_id, contentType: item.content_type, label: item.original_filename, startTime, duration, sourceStart: 0, muted: false, volume: trackId === 'music' ? 0.65 : 1 };
      return addItem(current, audio);
    });
    setSelectedItemId(id);
  }

  function addCatalogAudio(entry: AudioLibraryEntry) {
    const startTime = Math.min(playbackTime, MAX_TIMELINE_SECONDS - 0.25);
    const duration = Math.min(entry.duration_seconds, Math.max(0.25, (visualTimelineEnd(project) || MAX_TIMELINE_SECONDS) - startTime));
    if (duration < 0.25) return;
    mutate((current) => addItem(current, { id: crypto.randomUUID(), kind: 'audio', trackId: entry.type, mediaId: catalogMediaId(entry.id), contentType: entry.content_type, label: entry.title, startTime, duration, sourceStart: 0, muted: false, volume: entry.type === 'music' ? 0.65 : 1 }));
  }

  function toggleCatalogPreview(entry: AudioLibraryEntry) {
    if (!catalogAudioRef.current) catalogAudioRef.current = new Audio();
    if (previewingCatalogId === entry.id) { catalogAudioRef.current.pause(); setPreviewingCatalogId(null); return; }
    catalogAudioRef.current.src = catalogPlaybackUrl(entry); catalogAudioRef.current.currentTime = 0;
    void catalogAudioRef.current.play().then(() => setPreviewingCatalogId(entry.id)).catch(() => setAudioLibraryError('Audio preview could not start.'));
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
    setUploadError(''); setUploadNotice('');

    try {
      for (const file of files) {
        setUploadingFilename(file.name);
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
      setUploadNotice(`${files.length} ${files.length === 1 ? 'file' : 'files'} uploaded and ready.`);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : 'Media upload failed.'
      );
    } finally {
      setUploadingMedia(false); setUploadingFilename('');
    }
  }


  async function uploadAudio(file: File) {
    if (uploadingAudio) return;
    setUploadingAudio(true); setUploadingFilename(file.name); setUploadError(''); setUploadNotice('');
    try {
      const form = new FormData(); form.append('file', file);
      const response = await fetch(`${getApiUrl()}/api/editor/media/upload`, { method: 'POST', credentials: 'include', headers: { 'X-RangManch-Editor-CSRF': '1', 'Idempotency-Key': crypto.randomUUID() }, body: form });
      if (!response.ok) { const body = await response.json().catch(() => ({})); throw new Error(body.error === 'guest_quota_exceeded' ? 'You have reached the upload limit for this guest session.' : body.message || `Audio upload failed (${response.status})`); }
      const uploaded = await response.json() as GuestMedia;
      setMedia((current) => [uploaded, ...current]); setRemainingUploads((value) => Math.max(0, value - 1)); addAudio(uploaded, audioTarget); setUploadNotice(`${file.name} uploaded and added to the ${audioTarget} track.`);
    } catch (error) { setUploadError(error instanceof Error ? error.message : 'Audio upload failed.'); }
    finally { setUploadingAudio(false); setUploadingFilename(''); }
  }

  function seek(time: number) { const next = quantizeTimelineTime(time, 0, MAX_TIMELINE_SECONDS); setPlaybackTime(next); if (isPlaying) playbackStartedRef.current = { wallTime: performance.now(), timelineTime: next }; }
  function selectItem(itemId: string) { setSelectedItemId(itemId); const item = projectItem(displayProject, itemId); if (item) seek(item.startTime); setIsPlaying(false); }
  function patchSelected(updates: Partial<TimelineItem>) { if (!selectedItemId) return; mutate((current) => updateItem(current, selectedItemId, updates), `inspector:${selectedItemId}`); }
  function setSelectedTransition(type: 'none' | 'crossfade' | 'slide-left' | 'slide-right', duration = 0.6) {
    if (!selectedItemId) return;
    const selected = projectItem(project, selectedItemId);
    if (!selected || selected.kind !== 'video') return;
    const visuals = project.tracks.find((track) => track.id === 'video')?.items.filter((item): item is VideoTimelineItem => item.kind === 'video').sort((a, b) => a.startTime - b.startTime) ?? [];
    const index = visuals.findIndex((item) => item.id === selected.id);
    const next = visuals[index + 1];
    if (!next || Math.abs(selected.startTime + selected.duration - next.startTime) > 1e-6) return;
    if (type !== 'none' && duration <= 0 || duration > Math.min(2, selected.duration, next.duration)) return;
    mutate((current) => updateItem(current, selected.id, { transitionOut: type === 'none' ? undefined : { type, duration } }));
  }
  function removeSelected() { if (!selectedItemId) return; mutate((current) => removeItem(current, selectedItemId)); setSelectedItemId(null); }
  function reorderSelectedVisual(direction: -1 | 1) {
    if (!selectedItemId) return;
    mutate((current) => {
      const visuals = current.tracks.find((track) => track.id === 'video')?.items ?? [];
      const index = visuals.findIndex((item) => item.id === selectedItemId);
      return index < 0 ? current : reorderVideo(current, selectedItemId, index + direction);
    });
  }
  function previewText(item?: TextTimelineItem) { setTextPreview(item ? { item, targetId: selectedText?.id } : undefined); }
  function applyTextDraft(item: TextTimelineItem, targetId?: string) {
    const boundary = visualTimelineEnd(project) || project.duration || MAX_TIMELINE_SECONDS;
    const committed = targetId
      ? { ...item, id: targetId }
      : { ...item, duration: Math.max(0.25, Math.min(item.duration, boundary - item.startTime)) };
    mutate((current) => targetId ? updateItem(current, targetId, committed) : addItem(current, committed));
    setSelectedItemId(targetId ?? item.id); setTextPreview(undefined); setMobilePanel(null);
  }

  async function submitExport() {
    if (exportSubmitting || exportAbortRef.current) return;
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
    const controller = new AbortController();
    exportAbortRef.current = controller;
    setExportSubmitting(true); setExportError(''); setExportStatus('Preparing local export...'); setExportJob(null);
    if (localExportUrl) { URL.revokeObjectURL(localExportUrl); setLocalExportUrl(null); }
    try {
      const support = supportsBrowserMp4Export();
      if (!support.mediaRecorder) throw new Error('This browser cannot encode MP4 locally. Use a browser with video/mp4 MediaRecorder support.');
      const referencedMedia = project.tracks.flatMap((track) => track.items)
        .filter((item) => item.kind === 'video' || item.kind === 'audio')
        .map((item) => item.mediaId);
      const urls: string[] = [];
      try {
        const images: Record<string, HTMLImageElement> = {};
        const audio: Record<string, HTMLAudioElement> = {};
        for (const mediaId of referencedMedia) {
          const entry = media.find((item) => item.media_id === mediaId);
          const catalogEntry = mediaId.startsWith('catalog:') ? audioLibrary.find((item) => catalogMediaId(item.id) === mediaId) : undefined;
          if (catalogEntry) {
            const url = catalogPlaybackUrl(catalogEntry);
            audio[mediaId] = await new Promise<HTMLAudioElement>((resolve, reject) => { const element = new Audio(); element.onloadedmetadata = () => resolve(element); element.onerror = () => reject(new Error(`Catalog audio ${catalogEntry.title} could not be loaded.`)); element.src = url; });
            continue;
          }
          if (!entry || !['image', 'audio'].includes(entry.media_type)) throw new Error('This browser export supports image and audio media only; remove unsupported timeline media.');
          const response = await fetch(`${getApiUrl()}/api/editor/media/${encodeURIComponent(mediaId)}/content`, { credentials: 'include', cache: 'no-store' });
          if (!response.ok) throw new Error(`Media request failed (${response.status}).`);
          const url = URL.createObjectURL(await response.blob()); urls.push(url);
          if (entry.media_type === 'image') images[mediaId] = await new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Image ${entry.original_filename} could not be loaded.`)); image.src = url; });
          else audio[mediaId] = await new Promise<HTMLAudioElement>((resolve, reject) => { const element = new Audio(); element.onloadedmetadata = () => resolve(element); element.onerror = () => reject(new Error(`Audio ${entry.original_filename} could not be loaded.`)); element.src = url; });
        }
        const blob = await exportTimelineMp4(project, { media, images, audio }, { signal: controller.signal, onProgress: (progress) => setExportStatus(`Rendering locally… ${Math.round(progress * 100)}%`) });
        if (submittedRevision !== projectRevisionRef.current) throw new Error('The project changed during export. Please export again.');
        const downloadUrl = URL.createObjectURL(blob); setLocalExportUrl(downloadUrl);
        setExportJob({ job_id: `browser-${crypto.randomUUID()}`, status: 'completed', progress_stage: 'completed', output: { filename: normalizeExportFilename(project.exportSettings.filename), width: 720, height: 1280, fps: 30, file_size: blob.size }, message: 'Export completed locally.' });
        setExportStatus('Export completed locally.');
      } finally { urls.forEach((url) => URL.revokeObjectURL(url)); }
    } catch (error) {
      if (submittedRevision === projectRevisionRef.current) {
        const message = error instanceof Error ? error.message : 'Export could not be submitted.';
        setExportError(message); setExportStatus(message);
      }
    }
    finally { exportAbortRef.current = null; setExportSubmitting(false); }
  }

  function cancelExport() {
    exportAbortRef.current?.abort();
    setExportStatus('Export cancelled.');
    setExportError('Export cancelled. You can try again.');
  }

  async function previewAutoEdit() {
    setAutoEditError('');
    try {
      const revision = await calculateProjectRevision(project);
      const music = media.filter((item) => item.media_type === 'audio' && item.availability !== 'unavailable');
      const beatCandidates = music.length === 1 ? await analyzeUploadedMusic(music[0].media_id) : undefined;
      const plan = buildAutoEditPlan(project, media, revision, { style: autoEditStyle, mode: autoEditMode, title: autoEditTitle, beatCandidates });
      const applied = await applyEditPlan(project, plan);
      setCopilotProposal({ epoch: copilotEpochRef.current, baseProject: project, baseRevision: revision, applied, response: { plan, usage: { inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0 } } });
      setAutoEditOpen(false); setPlaybackTime(0); setIsPlaying(false);
    } catch (error) { setAutoEditError(error instanceof Error ? error.message : 'Auto Edit could not create a safe proposal.'); }
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
  const previewTransition = (() => {
    const boundary = visuals.find((item, index) => {
      const next = visuals[index + 1];
      return Boolean(next && item.transitionOut && Math.abs(item.startTime + item.duration - next.startTime) < 1e-6 && playbackTime >= next.startTime - item.transitionOut.duration / 2 && playbackTime <= next.startTime + item.transitionOut.duration / 2);
    });
    if (!boundary) return null;
    const index = visuals.findIndex((item) => item.id === boundary.id);
    const next = visuals[index + 1]!;
    const progress = transitionProgress(next.startTime, boundary.transitionOut!.duration, playbackTime);
    return { previous: boundary, next, type: boundary.transitionOut!.type, progress };
  })();
  const vignette = vignetteOpacity(previewEffects);
  const visibleTexts = textPreview
    ? [...activeTexts.filter((text) => text.id !== textPreview.targetId), textPreview.item]
    : activeTexts;
  const tools: Array<{ id: WorkspaceTool; label: string; icon: typeof Film }> = [
    { id: 'media', label: 'Media', icon: Film }, { id: 'audio', label: 'Audio', icon: AudioLines },
    { id: 'text', label: 'Text', icon: Type }, { id: 'filters', label: 'Filters', icon: SlidersHorizontal },
    { id: 'effects', label: 'Effects', icon: Sparkles }, { id: 'transitions', label: 'Fades', icon: BetweenHorizontalStart },
  ];
  const libraryItems = media.filter((item) => activeTool === 'audio' ? item.media_type === 'audio' : item.media_type !== 'audio');
  const mediaLibrary = <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
    <div className="border-b border-white/10 px-4 py-3"><h2 className="text-sm font-semibold text-white">{activeTool === 'audio' ? 'My Audio' : 'Media'}</h2><p className="mt-1 text-xs text-slate-400">{activeTool === 'audio' ? 'Upload and arrange your own licensed audio' : 'Photos and video clips'}</p></div>
    {activeTool === 'audio' && <label className="border-b border-white/10 px-3 py-3 text-[11px] text-slate-400">Add uploaded audio to<select aria-label="Uploaded audio destination" value={audioTarget} onChange={(event) => setAudioTarget(event.target.value as 'music' | 'sfx')} className="mt-2 h-9 w-full rounded-md border border-white/10 bg-[#1a1a2e] px-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300"><option value="music">Music track</option><option value="sfx">Sound effects track</option></select></label>}
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
          {uploadingMedia && <IndeterminateProgress label={`Uploading ${uploadingFilename || 'media'}…`} className="mt-3" />}
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
    {activeTool === 'audio' && <div className="border-t border-white/10 p-3"><button type="button" disabled={uploadingAudio || remainingUploads <= 0} onClick={() => audioInputRef.current?.click()} className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md border border-white/15 text-xs font-semibold text-white transition hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40"><Upload className="h-4 w-4" />{uploadingAudio ? 'Uploading…' : 'Upload audio'}</button>{uploadingAudio && <IndeterminateProgress label={`Uploading ${uploadingFilename || 'audio'}…`} className="mt-3" />}<p className="mt-2 text-[11px] leading-4 text-slate-500">Use audio you own or are licensed to use.</p><div className="mt-4 border-t border-white/10 pt-3"><div><h3 className="text-xs font-semibold text-white">Sound Library</h3><p className="mt-1 text-[10px] leading-4 text-slate-500">Server-reviewed audio cleared for use.</p></div><div className="mt-3 flex gap-1" role="tablist" aria-label="Sound library category"><button type="button" role="tab" aria-selected={audioLibraryTab === 'music'} onClick={() => setAudioLibraryTab('music')} className={`min-h-9 flex-1 rounded px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${audioLibraryTab === 'music' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>Music</button><button type="button" role="tab" aria-selected={audioLibraryTab === 'sfx'} onClick={() => setAudioLibraryTab('sfx')} className={`min-h-9 flex-1 rounded px-2 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 ${audioLibraryTab === 'sfx' ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-white'}`}>Sound effects</button></div><input aria-label="Search sound library" value={audioLibraryQuery} onChange={(event) => setAudioLibraryQuery(event.target.value)} placeholder="Search sound library" className="mt-2 h-9 w-full rounded border border-white/10 bg-black/20 px-2 text-xs text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400" />{audioLibraryLoading ? <IndeterminateProgress label="Loading sound library…" className="mt-3" /> : audioLibraryError ? <p role="alert" className="mt-3 text-xs text-rose-300">{audioLibraryError}</p> : audioLibrary.filter((entry) => entry.type === audioLibraryTab).length === 0 ? <p className="mt-3 text-xs leading-5 text-slate-500">No licensed {audioLibraryTab === 'music' ? 'music' : 'sound effects'} available yet. Assets appear only after licensing is verified.</p> : <div className="mt-2 space-y-2">{audioLibrary.filter((entry) => entry.type === audioLibraryTab).map((entry) => <div key={entry.id} className="rounded border border-white/10 bg-white/[0.03] p-2"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-xs text-white">{entry.title}</p><p className="text-[10px] text-slate-500">{entry.duration_seconds.toFixed(1)}s · {entry.license}</p></div><button type="button" onClick={() => toggleCatalogPreview(entry)} className="min-h-8 rounded px-2 py-1 text-[10px] text-amber-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">{previewingCatalogId === entry.id ? 'Pause' : 'Preview'}</button><button type="button" onClick={() => addCatalogAudio(entry)} className="min-h-8 rounded bg-amber-400 px-2 py-1 text-[10px] font-semibold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">Add</button></div></div>)}</div>}</div></div>}
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
        <div className="min-w-0"><p className="truncate text-sm font-semibold">Untitled reel</p><p className="hidden text-[11px] text-slate-500 sm:block">Guest project · saved for this session</p>{authenticatedCreator && <Link href="/dashboard" className="text-[10px] text-slate-400 hover:text-white">Account</Link>}</div>
        <div className="ml-2 flex items-center gap-1"><button type="button" disabled={proposalActive || !canUndoProject(projectHistory)} onClick={undoProject} title="Undo (Cmd/Ctrl+Z)" aria-label="Undo" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:text-slate-600 disabled:hover:bg-transparent"><Undo2 className="h-4 w-4" /></button><button type="button" disabled={proposalActive || !canRedoProject(projectHistory)} onClick={redoProject} title="Redo (Cmd/Ctrl+Shift+Z or Ctrl+Y)" aria-label="Redo" className="grid h-9 w-9 place-items-center rounded-md text-slate-300 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:text-slate-600 disabled:hover:bg-transparent"><Redo2 className="h-4 w-4" /></button></div>
        <div className="ml-auto flex items-center gap-2"><span className="hidden text-xs tabular-nums text-slate-400 md:block">{playbackTime.toFixed(1)} / {displayProject.duration.toFixed(1)}s</span><button type="button" disabled={displayProject.duration === 0} onClick={togglePlayback} className="grid h-9 w-9 place-items-center rounded-md bg-white/10 text-white transition-transform hover:bg-white/15 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40" aria-label={isPlaying ? 'Pause preview' : 'Play preview'}>{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-current" />}</button><button type="button" disabled={proposalActive || media.filter((item) => item.media_type === 'image').length === 0} onClick={() => { setAutoEditError(''); setAutoEditOpen(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-violet-500 px-3 text-xs font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300 disabled:opacity-40"><Sparkles className="h-4 w-4" /><span className="hidden sm:inline">Auto Edit</span></button><button type="button" onClick={() => setMobilePanel('copilot')} className="grid h-9 w-9 place-items-center rounded-md text-amber-300 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 lg:hidden" aria-label="Open AI Copilot"><Sparkles className="h-4 w-4" /></button><button type="button" onClick={() => setMobilePanel('inspector')} className="grid h-9 w-9 place-items-center rounded-md text-slate-300 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 lg:hidden" aria-label="Open inspector"><PanelRight className="h-4 w-4" /></button><button type="button" disabled={proposalActive || !selectedItemId} onClick={() => { setIsPlaying(false); removeSelected(); }} title="Remove selected timeline item (Delete)" aria-label="Remove selected timeline item" className="grid h-9 w-9 place-items-center rounded-md text-rose-300 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-30"><Trash2 className="h-4 w-4" /></button><button type="button" disabled={proposalActive || clipCount === 0} onClick={() => { setExportError(''); setExportOpen(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-md bg-amber-400 px-3 text-xs font-bold text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 disabled:opacity-40 sm:px-4"><Download className="h-4 w-4" /><span className="hidden sm:inline">Export</span></button>{authHydrated && !authenticatedCreator && <Link href="/login?next=%2Feditor" className="hidden min-h-9 items-center rounded-md border border-white/15 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:inline-flex">Sign in</Link>}{serverVerifiedAdmin && <Link href="/admin" className="hidden min-h-9 items-center rounded-md border border-amber-400/30 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 sm:inline-flex">Admin</Link>}</div>
      </header>
      {(uploadError || uploadNotice || exportStatus) && <div className="border-b border-white/10 bg-[#111118] px-4 py-2 text-xs">{uploadError ? <StatusTransition tone="error" label="Upload failed" detail={uploadError} /> : uploadNotice ? <StatusTransition tone="success" label="Upload ready" detail={uploadNotice} /> : <StatusTransition tone={exportError ? 'error' : exportStatus.includes('completed') ? 'success' : 'loading'} label={exportError ? 'Export failed' : exportStatus.includes('completed') ? 'Export ready' : 'Export status'} detail={exportStatus} />}</div>}

      <div className={`grid min-h-0 min-w-0 flex-1 overflow-hidden ${sidebarOpen ? 'md:grid-cols-[240px_minmax(0,1fr)]' : 'md:grid-cols-[minmax(0,1fr)]'} lg:grid-cols-[352px_minmax(0,1fr)_288px]`}>
        <aside inert={proposalActive ? true : undefined} aria-disabled={proposalActive} className={`${sidebarOpen ? 'hidden md:flex' : 'hidden'} min-h-0 min-w-0 overflow-hidden border-r border-white/10 bg-[#111118] lg:flex ${proposalActive ? 'opacity-50' : ''}`}>
          <nav aria-label="Editor tools" className="flex w-[72px] shrink-0 flex-col border-r border-white/10 py-2">{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={(event) => chooseTool(id, event.currentTarget)} className={`flex min-h-[58px] flex-col items-center justify-center gap-1 text-[10px] font-medium ${activeTool === id ? 'bg-white/10 text-amber-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon className="h-5 w-5" />{label}</button>)}</nav>
          {(activeTool === 'media' || activeTool === 'audio') ? mediaLibrary : activeTool === 'text' ? <TextLibrary key={selectedText?.id ?? 'new-text'} selectedText={selectedText} startTime={Math.min(playbackTime, 55)} onPreview={previewText} onApply={applyTextDraft} onCancel={() => { setTextPreview(undefined); setActiveTool('media'); }} /> : <div className="p-4 text-xs leading-5 text-slate-400">Choose an option to open its editing panel.</div>}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col bg-[#0d0d13]">
          <div className="flex h-11 shrink-0 items-center justify-center gap-2 border-b border-white/10 px-3">
            <label htmlFor="editor-aspect-ratio" className="text-xs text-slate-400">Canvas</label>
            <select
              id="editor-aspect-ratio"
              value={displayProject.aspectRatio}
              disabled={proposalActive}
              onChange={(event) => mutate((current) => ({ ...current, aspectRatio: event.target.value as TimelineProject['aspectRatio'] }))}
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
            <div className={`relative max-h-full max-w-full overflow-hidden bg-black shadow-2xl shadow-black/50 ${displayProject.aspectRatio === '9:16' || displayProject.aspectRatio === '4:5' ? 'h-full w-auto' : 'h-auto w-full'}`} style={{ aspectRatio: displayProject.aspectRatio.replace(':', ' / ') }} data-testid="editor-preview-canvas" onPointerDown={() => setSelectedItemId(null)}>
              <div className="absolute inset-0 overflow-hidden" style={previewStyle}>{previewTransition ? <><div className="absolute inset-0" style={{ opacity: 1 - previewTransition.progress, transform: previewTransition.type === 'slide-left' ? `translateX(${-100 * previewTransition.progress}%)` : previewTransition.type === 'slide-right' ? `translateX(${100 * previewTransition.progress}%)` : undefined }}><GuestMediaPreview mediaId={previewTransition.previous.mediaId} contentType={previewTransition.previous.contentType} filename={previewTransition.previous.label} isPlaying={false} localTime={previewTransition.previous.sourceStart + previewTransition.previous.duration} muted={previewTransition.previous.muted} volume={previewTransition.previous.volume} cropMode={previewTransition.previous.cropMode} /></div><div className="absolute inset-0" style={{ opacity: previewTransition.progress, transform: previewTransition.type === 'slide-left' ? `translateX(${100 * (1 - previewTransition.progress)}%)` : previewTransition.type === 'slide-right' ? `translateX(${-100 * (1 - previewTransition.progress)}%)` : undefined }}><GuestMediaPreview mediaId={previewTransition.next.mediaId} contentType={previewTransition.next.contentType} filename={previewTransition.next.label} isPlaying={false} localTime={previewTransition.next.sourceStart} muted={previewTransition.next.muted} volume={previewTransition.next.volume} cropMode={previewTransition.next.cropMode} /></div></> : previewClip ? <GuestMediaPreview mediaId={previewClip.mediaId} contentType={previewClip.contentType} filename={previewClip.label} isPlaying={isPlaying && !heldFinalClip} localTime={heldFinalClip ? previewClip.sourceStart + Math.max(0, previewClip.duration - 1 / displayProject.exportSettings.fps) : previewClip.sourceStart + playbackTime - previewClip.startTime} muted={previewClip.muted} volume={previewClip.volume} cropMode={previewClip.cropMode} /> : clipCount === 0 ? <div className="grid h-full place-items-center px-6 text-center text-sm text-white/60">Add photos or videos to begin</div> : null}</div>
              {vignette > 0 && <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 100px rgba(0,0,0,${vignette})` }} />}
              {visibleTexts.map((text) => <TextOverlayCanvas key={`${text.id}-${textPreview?.item === text ? 'preview' : 'saved'}`} item={text} selected={!proposalActive && !textPreview && selectedItemId === text.id} animationTime={textPreview?.item === text ? textPreviewTime : playbackTime - text.startTime} onSelect={() => { if (textPreview) return; setSelectedItemId(text.id); setIsPlaying(false); }} onUpdate={(updates, transactionKey) => { if (proposalActive) return; if (textPreview?.item === text) setTextPreview({ ...textPreview, item: { ...text, ...updates } as TextTimelineItem }); else mutate((current) => updateItem(current, text.id, updates), transactionKey); }} onEditStart={beginProjectEdit} onEditEnd={endProjectEdit} />)}
            </div>
          </section>
          <div className="flex h-10 shrink-0 items-center justify-between border-t border-white/10 px-3 text-[11px] text-slate-500"><span>{proposalActive ? 'Temporary Copilot preview · ' : ''}{remainingUploads}/{uploadUsage?.limits.uploads ?? 0} uploads · {clipCount}/{MAX_CLIPS} clips</span><span>{displayProject.extensionExplicit ? 'Extended · final frame held · ' : ''}{displayProject.duration.toFixed(1)}/{MAX_TIMELINE_SECONDS}s</span></div>
          {audioItems.map((item) => <GuestAudioLayer key={item.id} item={item} playbackTime={playbackTime} isPlaying={isPlaying} catalogEntry={item.mediaId.startsWith('catalog:') ? audioLibrary.find((entry) => catalogMediaId(entry.id) === item.mediaId) : undefined} />)}
        </main>

        <aside className="hidden min-h-0 overflow-hidden border-l border-white/10 bg-[#111118] lg:flex lg:flex-col" aria-label="Editor side panel">
          <div className="grid h-11 shrink-0 grid-cols-2 border-b border-white/10 p-1">
            <button type="button" onClick={() => setRightPanel('inspector')} className={`rounded-md text-xs font-semibold ${rightPanel === 'inspector' ? 'bg-white/10 text-white' : 'text-slate-500 hover:text-slate-200'}`}>Inspector</button>
            <button type="button" onClick={() => setRightPanel('copilot')} className={`rounded-md text-xs font-semibold ${rightPanel === 'copilot' ? 'bg-amber-400/15 text-amber-300' : 'text-slate-500 hover:text-slate-200'}`}>AI Copilot</button>
          </div>
          {rightPanel === 'copilot' ? <CopilotPanel history={copilotHistory} loading={copilotLoading} progress={copilotProgress} proposal={copilotProposal} error={copilotError} browserProvider={isBrowserCopilotEnabled} onSubmit={(prompt) => void submitCopilotPrompt(prompt)} onAbort={() => invalidateCopilot()} onCancel={() => invalidateCopilot()} onApply={() => void applyCopilotProposal()} /> : <EditorInspector className="min-h-0 flex-1 overflow-y-auto" item={selectedItem} onUpdate={patchSelected} onRemove={removeSelected} onEditStart={beginProjectEdit} onEditEnd={endProjectEdit} />}
        </aside>
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
        {selectedItem?.kind === 'video' && <div className="flex items-center gap-2 border-b border-white/10 bg-[#111118] px-3 py-2 text-xs"><span className="text-slate-400">Transition to next</span>{(['none', 'crossfade', 'slide-left', 'slide-right'] as const).map((type) => <button key={type} type="button" onClick={() => setSelectedTransition(type)} className="rounded border border-white/10 px-2 py-1 capitalize text-slate-300 hover:bg-white/10">{type === 'none' ? 'None' : type.replace('-', ' ')}</button>)}<select defaultValue="0.6" onChange={(event) => setSelectedTransition(selectedItem.transitionOut?.type ?? 'crossfade', Number(event.target.value))} className="rounded border border-white/10 bg-black/20 px-2 py-1 text-slate-300"><option value="0.4">0.4s</option><option value="0.6">0.6s</option><option value="0.8">0.8s</option></select></div>}
        <div className="h-full overflow-hidden">
          <MultiTrackTimeline project={displayProject} playbackTime={playbackTime} selectedItemId={selectedItemId} onSelectItem={selectItem} onSeek={seek} onMoveItem={(id, start, transactionKey) => { if (!proposalActive) mutate((current) => moveItem(current, id, start), transactionKey); }} onResizeItem={(id, edge, time, transactionKey) => { if (!proposalActive) mutate((current) => resizeItem(current, id, edge, time), transactionKey); }} onDeleteSelected={() => { if (!proposalActive) removeSelected(); }} onReorderSelected={(direction) => { if (!proposalActive) reorderSelectedVisual(direction); }} onSplitSelected={() => { if (!proposalActive && selectedItemId) { setIsPlaying(false); mutate((current) => splitItem(current, selectedItemId, playbackTime, crypto.randomUUID())); } }} onEditStart={(key) => { if (!proposalActive) beginProjectEdit(key); }} onEditEnd={(key) => { if (!proposalActive) endProjectEdit(key); }} />
        </div>
      </div>

      <nav inert={proposalActive ? true : undefined} aria-disabled={proposalActive} aria-label="Mobile editor tools" className={`flex shrink-0 gap-1 overflow-x-auto border-t border-white/10 bg-[#111118] px-2 pb-[calc(.5rem+env(safe-area-inset-bottom))] pt-2 md:hidden ${proposalActive ? 'opacity-50' : ''}`}>{tools.map(({ id, label, icon: Icon }) => <button key={id} type="button" onClick={() => chooseTool(id)} className={`flex min-h-12 min-w-[64px] flex-1 flex-col items-center justify-center gap-1 rounded-md text-[10px] ${activeTool === id ? 'bg-white/10 text-amber-300' : 'text-slate-400'}`}><Icon className="h-4 w-4" />{label}</button>)}</nav>

      {mobilePanel && <div className="fixed inset-0 z-40 bg-black/25 lg:hidden" onPointerDown={() => { if (mobilePanel === 'copilot' && copilotProposal) return; setTextPreview(undefined); setMobilePanel(null); }}><section data-testid="mobile-editor-sheet" className={`absolute inset-x-0 bottom-0 flex min-h-[280px] flex-col border-t border-white/10 bg-[#111118] pb-[env(safe-area-inset-bottom)] shadow-2xl ${mobilePanel === 'copilot' ? 'max-h-[62dvh]' : 'max-h-[72vh]'}`} onPointerDown={(event) => event.stopPropagation()}>{mobilePanel === 'copilot' ? <><div className="flex min-h-12 items-center justify-between border-b border-white/10 px-4"><span className="text-sm font-semibold text-amber-300">AI Copilot</span><button type="button" onClick={() => setMobilePanel(null)} className="grid h-10 w-10 place-items-center rounded-md text-slate-300" aria-label="Close panel"><ChevronDown className="h-5 w-5" /></button></div><div className="min-h-0 flex-1"><CopilotPanel history={copilotHistory} loading={copilotLoading} proposal={copilotProposal} error={copilotError} onSubmit={(prompt) => void submitCopilotPrompt(prompt)} onAbort={() => invalidateCopilot()} onCancel={() => invalidateCopilot()} onApply={() => void applyCopilotProposal()} /></div></> : activeTool === 'text' && mobilePanel === 'library' ? <TextLibrary key={selectedText?.id ?? 'new-text-mobile'} selectedText={selectedText} startTime={Math.min(playbackTime, 55)} onPreview={previewText} onApply={applyTextDraft} onCancel={() => { setTextPreview(undefined); setMobilePanel(null); }} /> : <><div className="flex min-h-12 items-center justify-between border-b border-white/10 px-4"><span className="text-sm font-semibold">{mobilePanel === 'inspector' ? 'Inspector' : activeTool === 'audio' ? 'Audio' : 'Media'}</span><button type="button" onClick={() => setMobilePanel(null)} className="grid h-10 w-10 place-items-center rounded-md text-slate-300" aria-label="Close panel"><ChevronDown className="h-5 w-5" /></button></div>{mobilePanel === 'inspector' ? <EditorInspector className="min-h-0 flex-1 overflow-y-auto" item={selectedItem} onUpdate={patchSelected} onRemove={removeSelected} onEditStart={beginProjectEdit} onEditEnd={endProjectEdit} /> : mediaLibrary}</>}</section></div>}
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
              effectDuration={previewClip?.duration ?? displayProject.duration}
              initialSection={effectSection}
              onPreview={setFilterPreview}
              onApply={(effect) => { mutate((current) => addItem(current, effect)); setSelectedItemId(effect.id); setShowFilters(false); }}
              onCancel={() => { setFilterPreview(undefined); setShowFilters(false); }}
            />
          </div>
        </div>
      )}
      {autoEditOpen && <div className="fixed inset-0 z-[160] grid place-items-center bg-black/70 p-4"><section className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-5 text-white"><h2 className="text-base font-semibold">Auto Edit</h2><p className="mt-1 text-xs text-slate-400">Choose a style and preview a polished, editable reel.</p><div className="mt-4 grid gap-2">{(['elegant', 'energetic', 'cinematic'] as AutoEditStyle[]).map((style) => <button key={style} type="button" onClick={() => setAutoEditStyle(style)} className={`rounded-lg border px-3 py-3 text-left text-sm capitalize ${autoEditStyle === style ? 'border-violet-400 bg-violet-400/10' : 'border-white/10 bg-white/5'}`}>{style}<span className="mt-1 block text-xs text-slate-400">{style === 'elegant' ? 'Slower pacing and subtle movement' : style === 'energetic' ? 'Faster pacing and dynamic zoom' : 'Longer shots with smooth opening and ending'}</span></button>)}</div><label className="mt-4 block text-xs text-slate-400">Optional opening title<input value={autoEditTitle} onChange={(event) => setAutoEditTitle(event.target.value)} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-white" placeholder="Your title" /></label>{project.duration > 0 && <div className="mt-4"><p className="text-xs text-amber-200">This project already has timeline content.</p><div className="mt-2 grid grid-cols-2 gap-2"><button type="button" onClick={() => setAutoEditMode('add')} className={`min-h-10 rounded-lg border text-xs ${autoEditMode === 'add' ? 'border-violet-400 bg-violet-400/10' : 'border-white/10'}`}>Add to current</button><button type="button" onClick={() => setAutoEditMode('replace')} className={`min-h-10 rounded-lg border text-xs ${autoEditMode === 'replace' ? 'border-violet-400 bg-violet-400/10' : 'border-white/10'}`}>Replace current</button></div></div>}{autoEditError && <p role="alert" className="mt-3 text-xs text-red-300">{autoEditError}</p>}<div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => setAutoEditOpen(false)} className="min-h-10 rounded-lg px-4 text-sm text-slate-300">Cancel</button><button type="button" onClick={() => void previewAutoEdit()} className="min-h-10 rounded-lg bg-violet-500 px-4 text-sm font-semibold">Preview Auto Edit</button></div></section></div>}
      <ExportDialog open={exportOpen} aspectRatio={project.aspectRatio} settings={project.exportSettings} job={exportJob} submitting={exportSubmitting} error={exportError} exportUsage={exportUsage} onClose={() => setExportOpen(false)} onCancel={cancelExport} onAspectRatio={(aspectRatio) => mutate((current) => ({ ...current, aspectRatio }))} onSettings={(exportSettings) => mutate((current) => ({ ...current, exportSettings }), 'export:filename')} onEditStart={beginProjectEdit} onEditEnd={endProjectEdit} onExport={() => void submitExport()} onRetry={() => void submitExport()} downloadUrl={localExportUrl ?? undefined} />
    </div>
  );
}
