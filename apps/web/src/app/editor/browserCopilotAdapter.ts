import { createBasicText } from './timeline/textTemplates.ts';
import { MAX_TIMELINE_SECONDS, type GuestMedia, type TimelineProject, type VideoTimelineItem } from './timeline/types.ts';
import { COPILOT_EDIT_PLAN_VERSION, type CopilotEditPlan } from './timeline/editPlan.ts';
import type { BrowserEditCommand } from '../../lib/browser-ai/webllmService.ts';
import { resolveBrowserIntent, type BrowserIntent } from '../../lib/browser-ai/browserIntent.ts';
import { addItem, visualTimelineEnd } from './timeline/model.ts';

export function buildBrowserCopilotPlan(
  project: TimelineProject,
  projectRevision: string,
  commands: BrowserEditCommand[],
  media: GuestMedia[],
  prompt = 'Local Browser AI edit',
): CopilotEditPlan {
  const operations: CopilotEditPlan['operations'] = [];
  for (const command of commands) {
    if (command.op === 'set_duration') {
      operations.push(...durationOperations(project, command.seconds, media));
    } else if (command.op === 'add_text') {
      operations.push({ op: 'add_text', item: textItem(command) });
    } else {
      throw new Error('The Browser AI command is unsupported by the editor adapter.');
    }
  }
  if (operations.length === 0) throw new Error('The Browser AI produced no editor operations.');
  return {
    schemaVersion: COPILOT_EDIT_PLAN_VERSION,
    requestId: crypto.randomUUID(),
    projectRevision,
    summary: prompt.trim().slice(0, 500) || 'Local Browser AI edit',
    warnings: ['Generated locally by Browser AI; no paid provider was used.'],
    operations,
  };
}

export function buildBrowserCopilotPlanFromIntents(
  project: TimelineProject,
  projectRevision: string,
  intents: BrowserIntent[],
  media: GuestMedia[],
  prompt = 'Local Browser AI edit',
): CopilotEditPlan {
  if (intents.some((intent) => intent.op === 'update_item')) {
    throw new Error('This compound request includes item updates that are not yet supported. Nothing was applied.');
  }
  const operations: CopilotEditPlan['operations'] = [];
  let working = project;
  for (const intent of intents) {
    if (intent.op === 'add_media') {
      const resolved = resolveBrowserIntent([intent], working, media)[0];
      const source = media.find((item) => item.media_id === resolved.resolvedMediaId);
      if (!source) throw new Error(`Missing uploaded media reference: ${intent.mediaReference}.`);
      const startTime = intent.start ?? visualTimelineEnd(working);
      const duration = intent.duration ?? 3;
      if (!Number.isFinite(startTime) || !Number.isFinite(duration) || startTime < 0 || duration <= 0 || startTime + duration > MAX_TIMELINE_SECONDS) {
        throw new Error('The requested image timing is outside the timeline bounds. Nothing was applied.');
      }
      const existingVisuals = working.tracks.find((track) => track.id === 'video')?.items.filter((entry): entry is VideoTimelineItem => entry.kind === 'video') ?? [];
      if (existingVisuals.some((entry) => startTime < entry.startTime + entry.duration - 1e-9 && startTime + duration > entry.startTime + 1e-9)) {
        throw new Error('The requested image would overlap an existing visual clip. Choose a gap or omit the start time. Nothing was applied.');
      }
      const item = { id: crypto.randomUUID(), kind: 'video' as const, trackId: 'video' as const, label: source.original_filename, mediaId: source.media_id, contentType: source.content_type, startTime, duration, sourceStart: 0, cropMode: 'cover' as const, muted: false, volume: 1 };
      operations.push({ op: 'add_media', item });
      working = addItem(working, item);
    } else if (intent.op === 'add_audio') {
      const resolved = resolveBrowserIntent([intent], working, media)[0] as Extract<ReturnType<typeof resolveBrowserIntent>[number], { op: 'add_audio' }>;
      const source = media.find((item) => item.media_id === resolved.resolvedMediaId);
      if (!source) throw new Error('Missing uploaded music reference.');
      const startTime = intent.start ?? 0;
      const duration = source.duration_seconds && source.duration_seconds > 0 ? Math.min(source.duration_seconds, MAX_TIMELINE_SECONDS - startTime) : 5;
      if (duration <= 0) throw new Error('The music timing is outside the timeline bounds.');
      const item = { id: crypto.randomUUID(), kind: 'audio' as const, trackId: 'music' as const, label: source.original_filename, mediaId: source.media_id, contentType: source.content_type, startTime, duration, sourceStart: 0, muted: intent.muted ?? false, volume: intent.volume };
      operations.push({ op: 'add_audio', item });
      working = addItem(working, item);
    } else if (intent.op === 'add_effect') {
      if (intent.target !== 'video') throw new Error('Text effects are not yet supported by Browser Copilot. Nothing was applied.');
      const resolved = resolveBrowserIntent([intent], working, media)[0] as Extract<ReturnType<typeof resolveBrowserIntent>[number], { op: 'add_effect' }>;
      if (!resolved.duration || resolved.duration <= 0 || (resolved.start ?? 0) + resolved.duration > MAX_TIMELINE_SECONDS) throw new Error('The effect timing is invalid.');
      operations.push({ op: 'add_effect', item: { id: crypto.randomUUID(), kind: 'effect', trackId: 'effects', label: resolved.preset, preset: resolved.preset, amount: 1, startTime: resolved.start ?? 0, duration: resolved.duration } });
    } else if (intent.op === 'add_text') {
      const resolved = resolveBrowserIntent([intent], working, media)[0] as Extract<ReturnType<typeof resolveBrowserIntent>[number], { op: 'add_text' }>;
      const command: BrowserEditCommand = { op: 'add_text', text: resolved.text, position: 'center', start: resolved.start ?? 0, duration: resolved.duration ?? 0, ...(resolved.animation && { animation: resolved.animation }), ...(resolved.animationDuration !== undefined && { animationDuration: resolved.animationDuration }) };
      operations.push({ op: 'add_text', item: textItem(command) });
    } else if (intent.op === 'set_duration') {
      operations.push(...durationOperations(working, intent.seconds, media));
    }
  }
  if (operations.length === 0) throw new Error('The Browser AI produced no editor operations.');
  return { schemaVersion: COPILOT_EDIT_PLAN_VERSION, requestId: crypto.randomUUID(), projectRevision, summary: prompt.trim().slice(0, 500) || 'Local Browser AI edit', warnings: ['Generated locally by Browser AI; no paid provider was used.'], operations };
}

function durationOperations(project: TimelineProject, seconds: number, media: GuestMedia[]) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_TIMELINE_SECONDS) throw new Error('The requested image duration is outside the timeline bounds.');
  const metadata = new Map(media.map((item) => [item.media_id, item]));
  const visuals = (project.tracks.find((track) => track.id === 'video')?.items ?? [])
    .filter((item): item is VideoTimelineItem => item.kind === 'video')
    .sort((a, b) => a.startTime - b.startTime);
  const images = visuals.filter((item) => {
    const itemMedia = metadata.get(item.mediaId);
    if (!itemMedia) throw new Error(`Missing media metadata for image item ${item.id}.`);
    return itemMedia.media_type === 'image';
  });
  if (images.length === 0) throw new Error('No image items were found for the requested duration change.');

  const starts = new Map<string, number>();
  let previousImage: VideoTimelineItem | undefined;
  for (const image of images) {
    const gap = previousImage ? Math.max(0, image.startTime - (previousImage.startTime + previousImage.duration)) : 0;
    const desiredStart = previousImage ? (starts.get(previousImage.id)! + seconds + gap) : image.startTime;
    const precedingVisual = [...visuals].reverse().find((item) => item.startTime < image.startTime);
    if (precedingVisual && !images.some((candidate) => candidate.id === precedingVisual.id) && desiredStart < precedingVisual.startTime + precedingVisual.duration - 1e-9) {
      throw new Error('The requested image duration would overlap a preceding video item.');
    }
    const nextVisual = visuals.find((item) => item.startTime > image.startTime);
    if (nextVisual && nextVisual.kind === 'video' && !images.some((candidate) => candidate.id === nextVisual.id) && desiredStart + seconds > nextVisual.startTime + 1e-9) {
      throw new Error('The requested image duration would overlap a video item.');
    }
    if (desiredStart < 0 || desiredStart + seconds > MAX_TIMELINE_SECONDS + 1e-9) throw new Error('The requested image duration exceeds the timeline bounds.');
    starts.set(image.id, desiredStart);
    previousImage = image;
  }
  return [...images].reverse().map((image) => ({
    op: 'update_item' as const,
    itemId: image.id,
    changes: { startTime: starts.get(image.id), duration: seconds },
  }));
}

function textItem(command: Extract<BrowserEditCommand, { op: 'add_text' }>) {
  if (!Number.isFinite(command.start) || !Number.isFinite(command.duration) || command.start < 0 || command.duration <= 0 || command.start + command.duration > MAX_TIMELINE_SECONDS) throw new Error('The requested title timing is outside the timeline bounds.');
  if (command.animationDuration !== undefined && command.animationDuration > command.duration) throw new Error('The title fade-in duration cannot exceed the title duration.');
  const item = createBasicText(command.start);
  return {
    ...item,
    label: command.text,
    text: command.text,
    duration: command.duration,
    alignment: 'center' as const,
    inAnimation: command.animation === 'fade-in' ? 'fade-in' as const : 'none' as const,
    inAnimationDuration: command.animationDuration ?? item.inAnimationDuration,
  };
}
