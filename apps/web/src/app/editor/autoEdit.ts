import { createBasicText } from './timeline/textTemplates.ts';
import { COPILOT_EDIT_PLAN_VERSION, type CopilotEditPlan } from './timeline/editPlan.ts';
import { MAX_TIMELINE_SECONDS, type GuestMedia, type TimelineProject } from './timeline/types.ts';
import { visualTimelineEnd } from './timeline/model.ts';
import { snapDurationsToBeats, type BeatCandidate } from './beatDetection.ts';

export type AutoEditStyle = 'elegant' | 'energetic' | 'cinematic';
export type AutoEditMode = 'replace' | 'add';

const styleConfig: Record<AutoEditStyle, { duration: number; zoom: 'zoom-in' | 'zoom-out'; amount: number; transition: 'crossfade' | 'slide-left' }> = {
  elegant: { duration: 5, zoom: 'zoom-in', amount: 0.65, transition: 'crossfade' },
  energetic: { duration: 3, zoom: 'zoom-in', amount: 1.15, transition: 'slide-left' },
  cinematic: { duration: 6, zoom: 'zoom-out', amount: 0.55, transition: 'crossfade' },
};

const pacingWeights: Record<AutoEditStyle, number[]> = {
  elegant: [1, 1.05, 1, 1.05, 0.95],
  energetic: [0.78, 1.08, 1.05, 1.1, 0.99],
  cinematic: [1.2, 1, 1.15, 1, 0.65],
};

function allocateDurations(total: number, count: number, style: AutoEditStyle): number[] {
  const weights = Array.from({ length: count }, (_, index) => pacingWeights[style][index % pacingWeights[style].length]);
  const sum = weights.reduce((value, weight) => value + weight, 0);
  const durations = weights.map((weight) => Math.max(1, Math.min(30, total * weight / sum))).map((duration) => Math.round(duration * 30) / 30);
  const correction = total - durations.reduce((value, duration) => value + duration, 0);
  durations[durations.length - 1] = Math.max(1, Math.min(30, durations[durations.length - 1] + correction));
  return durations;
}

export function buildAutoEditPlan(project: TimelineProject, media: GuestMedia[], revision: string, options: { style: AutoEditStyle; mode: AutoEditMode; title?: string; targetDuration?: number; musicVolume?: number; transition?: 'crossfade' | 'slide-left' | 'slide-right'; beatCandidates?: BeatCandidate[] }): CopilotEditPlan {
  const images = media.filter((item) => item.media_type === 'image' && item.availability !== 'unavailable');
  if (images.length === 0) throw new Error('Upload at least one available image before using Auto Edit.');
  const config = styleConfig[options.style];
  const operations: CopilotEditPlan['operations'] = [];
  let cursor = options.mode === 'add' ? visualTimelineEnd(project) : 0;
  const targetDuration = options.targetDuration ?? config.duration * images.length;
  if (!Number.isFinite(targetDuration) || targetDuration <= 0 || targetDuration > MAX_TIMELINE_SECONDS) throw new Error('The requested reel duration is invalid or exceeds the timeline limit.');
  const baseDurations = allocateDurations(targetDuration, images.length, options.style);
  const clipDurations = snapDurationsToBeats(baseDurations, options.beatCandidates ?? [], targetDuration);
  if (project.aspectRatio !== '9:16') operations.push({ op: 'set_aspect_ratio', aspectRatio: '9:16' });
  if (options.mode === 'replace') {
    for (const item of project.tracks.flatMap((track) => track.items)) operations.push({ op: 'remove_item', itemId: item.id });
  }
  const clipIds: string[] = [];
  images.forEach((image, index) => {
    const duration = Math.min(clipDurations[index], MAX_TIMELINE_SECONDS - cursor);
    if (duration <= 0) throw new Error('The generated reel exceeds the timeline limit.');
    const id = crypto.randomUUID(); clipIds.push(id);
    operations.push({ op: 'add_media', item: { id, kind: 'video', trackId: 'video', label: image.original_filename, mediaId: image.media_id, contentType: image.content_type, startTime: cursor, duration, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1, ...(index < images.length - 1 ? { transitionOut: { type: options.transition ?? config.transition, duration: Math.min(0.6, duration / 2) } } : {}) } });
    operations.push({ op: 'add_effect', item: { id: crypto.randomUUID(), kind: 'effect', trackId: 'effects', label: config.zoom, preset: config.zoom, amount: config.amount, startTime: cursor, duration } });
    cursor += duration;
  });
  if (clipIds.length > 0) {
    operations.push({ op: 'add_effect', item: { id: crypto.randomUUID(), kind: 'effect', trackId: 'effects', label: 'fade-in', preset: 'fade-in', amount: 1, startTime: clipStart(operations, clipIds[0]), duration: Math.min(1, config.duration) } });
    const last = clipIds[clipIds.length - 1];
    const lastClip = operations.find((operation) => operation.op === 'add_media' && operation.item.id === last);
    if (lastClip?.op === 'add_media') operations.push({ op: 'add_effect', item: { id: crypto.randomUUID(), kind: 'effect', trackId: 'effects', label: 'fade-out', preset: 'fade-out', amount: 1, startTime: lastClip.item.startTime + lastClip.item.duration - Math.min(1, lastClip.item.duration), duration: Math.min(1, lastClip.item.duration) } });
  }
  if (options.title?.trim()) {
    const titleLength = options.title.trim().length;
    const titleStyle = options.style === 'cinematic'
      ? { y: 0.18, color: '#f4dfad', fontSize: titleLength > 24 ? 44 : 56, bold: true }
      : options.style === 'energetic'
        ? { y: 0.22, color: '#ffffff', fontSize: titleLength > 24 ? 42 : 52, bold: true }
        : { y: 0.18, color: '#ffffff', fontSize: titleLength > 24 ? 44 : 54, bold: true };
    const title = { ...createBasicText(options.mode === 'add' ? visualTimelineEnd(project) : 0), ...titleStyle, id: crypto.randomUUID(), label: options.title.trim(), text: options.title.trim(), width: 0.84, x: 0.5, duration: Math.min(clipDurations[0], 4), alignment: 'center' as const, inAnimation: 'fade-in' as const, inAnimationDuration: Math.min(1, clipDurations[0]) };
    operations.push({ op: 'add_text', item: title });
  }
  const audio = media.filter((item) => item.media_type === 'audio' && item.availability !== 'unavailable');
  if (audio.length === 1) operations.push({ op: 'add_audio', item: { id: crypto.randomUUID(), kind: 'audio', trackId: 'music', label: audio[0].original_filename, mediaId: audio[0].media_id, contentType: audio[0].content_type, startTime: options.mode === 'add' ? visualTimelineEnd(project) : 0, duration: Math.min(audio[0].duration_seconds ?? targetDuration, Math.max(0.25, targetDuration)), sourceStart: 0, muted: false, volume: options.musicVolume ?? 0.5 } });
  return { schemaVersion: COPILOT_EDIT_PLAN_VERSION, requestId: crypto.randomUUID(), projectRevision: revision, summary: `Auto Edit · ${options.style}`, warnings: ['Generated deterministically in the browser.'], operations };
}

function clipStart(operations: CopilotEditPlan['operations'], id: string): number {
  const operation = operations.find((entry) => entry.op === 'add_media' && entry.item.id === id);
  return operation?.op === 'add_media' ? operation.item.startTime : 0;
}
