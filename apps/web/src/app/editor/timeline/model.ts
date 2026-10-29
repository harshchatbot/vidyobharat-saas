import { MAX_TIMELINE_SECONDS, MIN_ITEM_DURATION, V1_TIMELINE_FPS, type TimelineItem, type TimelineProject, type VideoTimelineItem } from './types.ts';

export function clampTime(value: number, minimum = 0, maximum = MAX_TIMELINE_SECONDS): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value * 100) / 100));
}

export function quantizeTimelineTime(
  value: number,
  minimum = 0,
  maximum = MAX_TIMELINE_SECONDS,
): number {
  if (!Number.isFinite(value)) return minimum;
  const bounded = Math.min(maximum, Math.max(minimum, value));
  return Math.min(maximum, Math.max(minimum, Math.round(bounded * V1_TIMELINE_FPS) / V1_TIMELINE_FPS));
}

export function snapTimelineTime(
  value: number,
  item: Pick<TimelineItem, 'startTime' | 'duration'>,
  mode: 'move' | 'left' | 'right',
  targets: readonly number[],
  thresholdSeconds: number,
): number {
  const quantized = quantizeTimelineTime(value);
  const ownStart = quantizeTimelineTime(item.startTime);
  const ownEnd = quantizeTimelineTime(item.startTime + item.duration);
  const available = targets
    .map((target) => quantizeTimelineTime(target))
    .filter((target) => target !== ownStart && target !== ownEnd);
  const candidates = mode === 'move'
    ? [quantized, quantizeTimelineTime(quantized + item.duration)]
    : [quantized];
  let bestDelta: number | undefined;
  for (const candidate of candidates) {
    for (const target of available) {
      const delta = target - candidate;
      if (Math.abs(delta) <= thresholdSeconds && (bestDelta === undefined || Math.abs(delta) < Math.abs(bestDelta))) {
        bestDelta = delta;
      }
    }
  }
  return quantizeTimelineTime(quantized + (bestDelta ?? 0));
}

export function projectItem(project: TimelineProject, itemId: string): TimelineItem | undefined {
  return project.tracks.flatMap((track) => track.items).find((item) => item.id === itemId);
}

export function updateItem(project: TimelineProject, itemId: string, updates: Partial<TimelineItem>): TimelineProject {
  const tracks = project.tracks.map((track) => ({ ...track, items: track.items.map((item) => item.id === itemId ? normalizeItem({ ...item, ...updates } as TimelineItem) : item) }));
  return normalizeProject({ ...project, tracks });
}

export function removeItem(project: TimelineProject, itemId: string): TimelineProject {
  return normalizeProject({ ...project, tracks: project.tracks.map((track) => ({ ...track, items: track.items.filter((item) => item.id !== itemId) })) });
}

export function addItem(project: TimelineProject, item: TimelineItem): TimelineProject {
  return normalizeProject({ ...project, tracks: project.tracks.map((track) => track.id === item.trackId ? { ...track, items: [...track.items, normalizeItem(item)] } : track) });
}

export function moveItem(project: TimelineProject, itemId: string, startTime: number): TimelineProject {
  const item = projectItem(project, itemId);
  if (!item) return project;
  if (item.kind === 'video') return updateItem(project, itemId, { startTime: nearestVideoStart(project, itemId, startTime, item.duration) });
  return updateItem(project, itemId, { startTime: quantizeTimelineTime(startTime, 0, MAX_TIMELINE_SECONDS - item.duration) });
}

export function resizeItem(project: TimelineProject, itemId: string, edge: 'left' | 'right', time: number): TimelineProject {
  const item = projectItem(project, itemId);
  if (!item) return project;
  if (edge === 'left' && item.kind !== 'video') {
    const end = item.startTime + item.duration;
    const startTime = quantizeTimelineTime(time, 0, end - MIN_ITEM_DURATION);
    return updateItem(project, itemId, { startTime, duration: end - startTime });
  }
  const nextVideo = item.kind === 'video'
    ? project.tracks.find((track) => track.id === 'video')?.items
        .filter((other) => other.id !== itemId && other.startTime >= item.startTime)
        .sort((a, b) => a.startTime - b.startTime)[0]
    : undefined;
  const end = quantizeTimelineTime(time, item.startTime + MIN_ITEM_DURATION,
    Math.min(MAX_TIMELINE_SECONDS, nextVideo?.startTime ?? MAX_TIMELINE_SECONDS));
  return updateItem(project, itemId, { duration: end - item.startTime });
}

export function reorderVideo(project: TimelineProject, itemId: string, targetIndex: number): TimelineProject {
  const track = project.tracks.find((entry) => entry.id === 'video');
  if (!track) return project;
  const videos = track.items.filter((item): item is VideoTimelineItem => item.kind === 'video');
  const sourceIndex = videos.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return project;
  const gaps = videos.map((item, index) => index === 0
    ? item.startTime
    : Math.max(0, item.startTime - (videos[index - 1].startTime + videos[index - 1].duration)));
  const reordered = [...videos];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(Math.max(0, Math.min(videos.length - 1, targetIndex)), 0, moved);
  let cursor = gaps[0] ?? 0;
  const sequential = reordered.map((item, index) => {
    const next = { ...item, startTime: quantizeTimelineTime(cursor) };
    cursor = next.startTime + item.duration + (gaps[index + 1] ?? 0);
    return next;
  });
  return normalizeProject({ ...project, tracks: project.tracks.map((entry) => entry.id === 'video' ? { ...entry, items: sequential } : entry) });
}

export function activeItems(project: TimelineProject, time: number): TimelineItem[] {
  return project.tracks.flatMap((track) => track.items).filter((item) => time >= item.startTime && time < item.startTime + item.duration);
}

export function visualTimelineEnd(project: TimelineProject): number {
  return project.tracks.find((track) => track.id === 'video')?.items.reduce(
    (end, item) => Math.max(end, item.startTime + item.duration), 0,
  ) ?? 0;
}

export function normalizeProject(project: TimelineProject): TimelineProject {
  const tracks = project.tracks.map((track) => ({ ...track, items: track.items.map(normalizeItem) }));
  const videoTrack = tracks.find((track) => track.id === 'video');
  // Video clips are positioned by absolute startTime. Never pack them together:
  // an empty interval represents black frames during preview.
  if (videoTrack) videoTrack.items = [...videoTrack.items]
    .sort((a, b) => a.startTime - b.startTime);
  const videoEnd = videoTrack?.items.reduce((end, item) =>
    Math.max(end, item.startTime + item.duration), 0) ?? 0;
  const overlayEnd = tracks.filter((track) => track.id !== 'video').flatMap((track) => track.items)
    .reduce((max, item) => Math.max(max, item.startTime + item.duration), 0);
  const duration = quantizeTimelineTime(Math.max(videoEnd, overlayEnd));
  return { ...project, tracks, duration, extensionExplicit: overlayEnd > videoEnd + 0.001 };
}

function normalizeItem<T extends TimelineItem>(item: T): T {
  const minimumDuration = Math.ceil(MIN_ITEM_DURATION * V1_TIMELINE_FPS) / V1_TIMELINE_FPS;
  const startTime = quantizeTimelineTime(item.startTime, 0, MAX_TIMELINE_SECONDS - minimumDuration);
  const duration = quantizeTimelineTime(item.duration, minimumDuration, MAX_TIMELINE_SECONDS - startTime);
  const common = { ...item, startTime, duration };
  if (item.kind === 'audio' || item.kind === 'video') return { ...common, sourceStart: quantizeTimelineTime(item.sourceStart), volume: clampTime(item.volume, 0, 1) } as T;
  if (item.kind === 'text') {
    const inAnimation = item.inAnimation ?? 'none';
    const outAnimation = item.outAnimation ?? 'none';
    let inAnimationDuration = quantizeTimelineTime(item.inAnimationDuration ?? 0.5, 0.1, Math.min(3, duration));
    let outAnimationDuration = quantizeTimelineTime(item.outAnimationDuration ?? 0.5, 0.1, Math.min(3, duration));
    if (inAnimation !== 'none' && outAnimation !== 'none' && inAnimationDuration + outAnimationDuration > duration) {
      const ratio = duration / (inAnimationDuration + outAnimationDuration);
      inAnimationDuration = quantizeTimelineTime(inAnimationDuration * ratio, 0.1, duration);
      outAnimationDuration = quantizeTimelineTime(duration - inAnimationDuration, 0.1, duration);
    }
    return {
      ...common,
      fontSize: clampTime(item.fontSize, 12, 120),
      x: clampTime(item.x, 0.02, 0.98),
      y: clampTime(item.y, 0.02, 0.98),
      width: clampTime(item.width, 0.1, 0.96),
      rotation: clampTime(item.rotation, -180, 180),
      outlineWidth: clampTime(item.outlineWidth, 0, 12),
      backgroundOpacity: clampTime(item.backgroundOpacity, 0, 1),
      inAnimation,
      outAnimation,
      loopAnimation: item.loopAnimation ?? 'none',
      inAnimationDuration,
      outAnimationDuration,
    } as T;
  }
  return { ...common, amount: clampTime(item.amount, 0, 2) } as T;
}


/** Find the closest non-overlapping location for a video clip. */
function nearestVideoStart(project: TimelineProject, itemId: string, requested: number, length: number): number {
  const maxStart = MAX_TIMELINE_SECONDS - length;
  const target = quantizeTimelineTime(requested, 0, maxStart);
  const occupied = (project.tracks.find((track) => track.id === 'video')?.items ?? [])
    .filter((item) => item.id !== itemId)
    .sort((a, b) => a.startTime - b.startTime);
  const candidates: number[] = [];
  let previousEnd = 0;
  for (const item of occupied) {
    const latestStart = Math.min(maxStart, item.startTime - length);
    if (latestStart >= previousEnd) candidates.push(Math.max(previousEnd, Math.min(target, latestStart)));
    previousEnd = Math.max(previousEnd, item.startTime + item.duration);
  }
  if (previousEnd <= maxStart) candidates.push(Math.max(previousEnd, target));
  if (!candidates.length) return projectItem(project, itemId)?.startTime ?? 0;
  return quantizeTimelineTime(candidates.reduce((best, candidate) =>
    Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best));
}

/** Split video or audio at a timeline time; returns unchanged project if invalid. */
export function splitItem(project: TimelineProject, itemId: string, time: number, newId: string): TimelineProject {
  const item = projectItem(project, itemId);
  if (!item || (item.kind !== 'video' && item.kind !== 'audio')) return project;
  const offset = quantizeTimelineTime(time - item.startTime);
  if (offset < MIN_ITEM_DURATION || item.duration - offset < MIN_ITEM_DURATION) return project;
  const left = { ...item, duration: offset };
  const right = { ...item, id: newId, startTime: quantizeTimelineTime(item.startTime + offset),
    duration: quantizeTimelineTime(item.duration - offset), sourceStart: quantizeTimelineTime(item.sourceStart + offset) };
  return normalizeProject({ ...project, tracks: project.tracks.map((track) => ({ ...track,
    items: track.items.flatMap((entry) => entry.id === itemId ? [left, right] : [entry])
  })) });
}
