'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AudioLines, Download, Film, Image as ImageIcon, Pause, Play, Plus, SlidersHorizontal, Sparkles, Type, Upload, BetweenHorizontalStart } from 'lucide-react';
import { getApiUrl } from '@/lib/env';
import { EditorInspector } from './EditorInspector';
import { FilterGallery } from './FilterGallery';
import { GuestAudioLayer } from './GuestAudioLayer';
import { GuestMediaPreview } from './GuestMediaPreview';
import { TextOverlayCanvas } from './TextOverlayCanvas';
import { MultiTrackTimeline } from './timeline/MultiTrackTimeline';
import { activeItems, addItem, moveItem, projectItem, removeItem, reorderVideo, resizeItem, updateItem } from './timeline/model';
import { browserEffectStyle, effectsWithTemporaryPreview, vignetteOpacity } from './timeline/filters';
import type { EffectSection } from './timeline/filters';
import { serializeTimelineProject } from './timeline/serialization';
import { createEmptyProject, MAX_TIMELINE_SECONDS, type AudioTimelineItem, type EffectTimelineItem, type GuestMedia, type TextTimelineItem, type TimelineItem, type TimelineProject, type VideoTimelineItem } from './timeline/types';

type Props = { media: GuestMedia[]; uploadUsage?: { limits: { uploads: number }; remaining: { uploads: number } } | null };
const MAX_CLIPS = 12;

export function GuestEditorWorkspace({ media: initialMedia, uploadUsage }: Props) {
  const [media, setMedia] = useState(initialMedia);
  const [project, setProject] = useState<TimelineProject>(() => createEmptyProject());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioTarget, setAudioTarget] = useState<'music' | 'sfx'>('music');
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [effectSection, setEffectSection] = useState<EffectSection>('filters');
  const [filterPreview, setFilterPreview] = useState<EffectTimelineItem | undefined>();
  const [exportStatus, setExportStatus] = useState('');
  const [remainingUploads, setRemainingUploads] = useState(uploadUsage?.remaining.uploads ?? 0);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const playbackStartedRef = useRef({ wallTime: 0, timelineTime: 0 });
  const selectedItem = selectedItemId ? projectItem(project, selectedItemId) : undefined;
  const itemsAtPlayhead = useMemo(() => activeItems(project, playbackTime), [playbackTime, project]);
  const previewClip = itemsAtPlayhead.find((item): item is VideoTimelineItem => item.kind === 'video');
  const activeTexts = itemsAtPlayhead.filter((item): item is TextTimelineItem => item.kind === 'text');
  const activeEffects = itemsAtPlayhead.filter((item): item is EffectTimelineItem => item.kind === 'effect');
  const audioItems = project.tracks.flatMap((track) => track.items).filter((item): item is AudioTimelineItem => item.kind === 'audio');
  const clipCount = project.tracks.find((track) => track.id === 'video')?.items.length ?? 0;

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

  function mutate(next: TimelineProject) {
    setProject(next);
    setPlaybackTime((time) => Math.min(time, Math.max(next.duration, 0)));
  }

  function addVisual(item: GuestMedia) {
    if (!['image', 'video'].includes(item.media_type) || clipCount >= MAX_CLIPS || project.duration >= MAX_TIMELINE_SECONDS) return;
    const requested = item.media_type === 'image' ? 3 : Math.min(item.duration_seconds || 3, 8);
    const duration = Math.min(requested, MAX_TIMELINE_SECONDS - project.duration);
    if (duration < 0.25) return;
    const clip: VideoTimelineItem = { id: crypto.randomUUID(), kind: 'video', trackId: 'video', mediaId: item.media_id, contentType: item.content_type, label: item.original_filename, startTime: project.duration, duration, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 };
    mutate(addItem(project, clip)); setSelectedItemId(clip.id); setPlaybackTime(project.duration); setIsPlaying(false);
  }

  function addAudio(item: GuestMedia, trackId: 'music' | 'sfx' = audioTarget) {
    if (item.media_type !== 'audio') return;
    const startTime = Math.min(playbackTime, MAX_TIMELINE_SECONDS - 0.25);
    const duration = Math.min(item.duration_seconds || 5, MAX_TIMELINE_SECONDS - startTime);
    const audio: AudioTimelineItem = { id: crypto.randomUUID(), kind: 'audio', trackId, mediaId: item.media_id, contentType: item.content_type, label: item.original_filename, startTime, duration, sourceStart: 0, muted: false, volume: trackId === 'music' ? 0.65 : 1 };
    mutate(addItem(project, audio)); setSelectedItemId(audio.id);
  }

  function addText() {
    const startTime = Math.min(playbackTime, 55);
    const item: TextTimelineItem = { id: crypto.randomUUID(), kind: 'text', trackId: 'text', label: 'Your text', text: 'Your text', startTime, duration: Math.min(5, 60 - startTime), fontFamily: 'Inter', fontSize: 44, color: '#ffffff', bold: true, x: 0.5, y: 0.5, width: 0.8, rotation: 0, alignment: 'center', outlineColor: '#000000', outlineWidth: 0, shadow: true, backgroundColor: '#000000', backgroundOpacity: 0 };
    mutate(addItem(project, item)); setSelectedItemId(item.id);
  }

  function openEffectPicker(section: EffectSection) { setEffectSection(section); setFilterPreview(undefined); setShowFilters(true); }

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

  async function submitExport() {
    if (!previewClip && clipCount === 0) return;
    setExportStatus('Submitting export...');
    try {
      const response = await fetch(`${getApiUrl()}/api/editor/exports`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'X-RangManch-Editor-CSRF': '1', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify(serializeTimelineProject(project)),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || `Export failed (${response.status})`);
      setExportStatus(`Export queued · ${body.job_id}`);
    } catch (error) { setExportStatus(error instanceof Error ? error.message : 'Export could not be submitted.'); }
  }

  const previewEffects = effectsWithTemporaryPreview(activeEffects, filterPreview ?? null);
  const previewStyle = browserEffectStyle(previewEffects, playbackTime);
  const vignette = vignetteOpacity(previewEffects);
  return (
    <div className="mt-8 space-y-4">
      <input ref={audioInputRef} type="file" accept="audio/mpeg,audio/mp4,audio/aac,audio/wav,audio/ogg" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadAudio(file); event.target.value = ''; }} />
      <div className="sticky bottom-0 z-40 flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-[#d9d7ce] bg-white/95 p-3 pb-[calc(.75rem+env(safe-area-inset-bottom))] backdrop-blur md:static md:flex-wrap md:overflow-visible md:pb-3">
        <button type="button" onClick={addText} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[#071d4a] px-4 text-sm font-semibold text-white"><Type className="h-4 w-4" />Text</button>
        <button type="button" onClick={() => openEffectPicker('filters')} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d9d7ce] px-4 text-sm font-semibold"><SlidersHorizontal className="h-4 w-4" />Filters</button>
        <button type="button" onClick={() => openEffectPicker('effects')} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d9d7ce] px-4 text-sm font-semibold"><Sparkles className="h-4 w-4" />Effects</button>
        <button type="button" onClick={() => openEffectPicker('transitions')} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d9d7ce] px-4 text-sm font-semibold"><BetweenHorizontalStart className="h-4 w-4" />Transitions</button>
        <select aria-label="Audio track type" value={audioTarget} onChange={(event) => setAudioTarget(event.target.value as 'music' | 'sfx')} className="min-h-10 rounded-md border border-[#d9d7ce] bg-white px-3 text-sm"><option value="music">Music track</option><option value="sfx">SFX track</option></select>
        <button type="button" disabled={uploadingAudio || remainingUploads <= 0} onClick={() => audioInputRef.current?.click()} className="inline-flex min-h-10 items-center gap-2 rounded-md border border-[#d9d7ce] px-4 text-sm font-semibold disabled:opacity-50"><Upload className="h-4 w-4" />{uploadingAudio ? 'Uploading...' : 'Upload audio'}</button>
        <button type="button" disabled={clipCount === 0} onClick={() => void submitExport()} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-md bg-[#f4c30f] px-4 text-sm font-semibold text-[#071d4a] disabled:opacity-40"><Download className="h-4 w-4" />Export</button>
        <div className="shrink-0 text-xs text-[#526078]">{remainingUploads}/{uploadUsage?.limits.uploads ?? 0} uploads left · {clipCount}/{MAX_CLIPS} clips · {project.duration.toFixed(1)}/{MAX_TIMELINE_SECONDS}s</div>
      </div>
      {uploadError && <p role="alert" className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{uploadError}</p>}
      {exportStatus && <p role="status" className="rounded-md bg-[#fff8d8] px-4 py-3 text-sm text-[#725500]">{exportStatus}</p>}

      <div className="grid min-w-0 gap-4 md:grid-cols-[220px_minmax(0,1fr)] lg:grid-cols-[250px_minmax(0,1fr)_270px]">
        <aside className="order-2 rounded-lg border border-[#d9d7ce] bg-white p-4 md:order-1">
          <h2 className="font-semibold">Your media</h2><p className="mt-1 text-xs leading-5 text-[#526078]">Add visuals to the reel or place audio at the playhead.</p>
          <div className="mt-4 max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {media.map((item) => <div key={item.media_id} className="rounded-md border border-[#e3e0d7] p-3"><div className="flex items-start gap-2">{item.media_type === 'audio' ? <AudioLines className="mt-0.5 h-4 w-4" /> : item.media_type === 'video' ? <Film className="mt-0.5 h-4 w-4" /> : <ImageIcon className="mt-0.5 h-4 w-4" />}<span className="min-w-0 break-all text-xs font-semibold">{item.original_filename}</span></div>{item.media_type === 'audio' ? <div className="mt-3 flex gap-2"><button type="button" onClick={() => addAudio(item, 'music')} className="min-h-9 flex-1 rounded bg-[#f4c30f] px-2 text-xs font-semibold">Music</button><button type="button" onClick={() => addAudio(item, 'sfx')} className="min-h-9 flex-1 rounded border px-2 text-xs font-semibold">SFX</button></div> : <button type="button" disabled={clipCount >= MAX_CLIPS || project.duration >= 60} onClick={() => addVisual(item)} className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-1 rounded bg-[#f4c30f] px-3 text-xs font-semibold disabled:opacity-40"><Plus className="h-3.5 w-3.5" /> Add to reel</button>}</div>)}
          </div>
          <div className="mt-4 border-t border-[#e3e0d7] pt-4"><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#526078]">Licensed catalog</p><p className="mt-2 text-xs leading-5 text-[#526078]">No licensed tracks are connected. Upload music you own or have permission to use.</p></div>
        </aside>

        <section className="order-1 min-w-0 rounded-lg border border-[#d9d7ce] bg-white p-3 md:order-2 md:p-4">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Reel preview</h2><span className="text-xs tabular-nums text-[#526078]">{playbackTime.toFixed(1)}s / {project.duration.toFixed(1)}s</span></div>
          <div className="mt-4 flex min-h-[430px] items-center justify-center rounded-lg bg-[#071d4a] p-3 sm:min-h-[520px] sm:p-5">
            <div className="relative aspect-[9/16] h-[min(62vh,520px)] max-w-full overflow-hidden rounded-md bg-black" onPointerDown={() => setSelectedItemId(null)}>
              <div className="absolute inset-0 overflow-hidden" style={previewStyle}>{previewClip ? <GuestMediaPreview mediaId={previewClip.mediaId} contentType={previewClip.contentType} filename={previewClip.label} isPlaying={isPlaying} localTime={previewClip.sourceStart + playbackTime - previewClip.startTime} muted={previewClip.muted} volume={previewClip.volume} cropMode={previewClip.cropMode} /> : <div className="grid h-full place-items-center px-6 text-center text-sm text-white/60">Add photos or videos to begin</div>}</div>
              {vignette > 0 && <div className="pointer-events-none absolute inset-0" style={{ boxShadow: `inset 0 0 100px rgba(0,0,0,${vignette})` }} />}
              {activeTexts.map((text) => <TextOverlayCanvas key={text.id} item={text} selected={selectedItemId === text.id} onSelect={() => { setSelectedItemId(text.id); setIsPlaying(false); }} onUpdate={(updates) => mutate(updateItem(project, text.id, updates))} />)}
            </div>
          </div>
          <div className="mt-4 flex items-center justify-center gap-3"><button type="button" disabled={project.duration === 0} onClick={() => { if (playbackTime >= project.duration) setPlaybackTime(0); setIsPlaying((value) => !value); }} className="inline-flex min-h-11 min-w-28 items-center justify-center gap-2 rounded-md bg-[#f4c30f] px-5 font-semibold text-[#071d4a] disabled:opacity-40">{isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{isPlaying ? 'Pause' : 'Play'}</button></div>
          {audioItems.map((item) => <GuestAudioLayer key={item.id} item={item} playbackTime={playbackTime} isPlaying={isPlaying} />)}
        </section>

        <EditorInspector className="order-3 md:col-span-2 lg:col-span-1" item={selectedItem} onUpdate={patchSelected} onRemove={removeSelected} />
      </div>
      <MultiTrackTimeline project={project} playbackTime={playbackTime} selectedItemId={selectedItemId} onSelectItem={selectItem} onSeek={seek} onMoveItem={(id, start) => mutate(moveItem(project, id, start))} onResizeItem={(id, edge, time) => mutate(resizeItem(project, id, edge, time))} onReorderVideo={(id, index) => mutate(reorderVideo(project, id, index))} />
      {showFilters && <div className="fixed inset-x-0 bottom-0 z-50 max-h-[72vh] overflow-y-auto rounded-t-lg border-t border-[#d9d7ce] shadow-2xl md:static md:max-h-none md:overflow-visible md:rounded-lg md:border"><FilterGallery key={effectSection} mediaId={previewClip?.mediaId} contentType={previewClip?.contentType} timelineDuration={project.duration} initialSection={effectSection} onPreview={setFilterPreview} onApply={(effect) => { mutate(addItem(project, effect)); setSelectedItemId(effect.id); setShowFilters(false); }} onCancel={() => { setFilterPreview(undefined); setShowFilters(false); }} /></div>}
    </div>
  );
}
