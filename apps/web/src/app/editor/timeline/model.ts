import { MAX_TIMELINE_SECONDS, MIN_ITEM_DURATION, type TimelineItem, type TimelineProject, type VideoTimelineItem } from './types.ts';

export function clampTime(value: number, minimum = 0, maximum = MAX_TIMELINE_SECONDS): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value * 100) / 100));
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
  return updateItem(project, itemId, { startTime: clampTime(startTime, 0, MAX_TIMELINE_SECONDS - item.duration) });
}

export function resizeItem(project: TimelineProject, itemId: string, edge: 'left' | 'right', time: number): TimelineProject {
  const item = projectItem(project, itemId);
  if (!item) return project;
  if (edge === 'left' && item.kind !== 'video') {
    const end = item.startTime + item.duration;
    const startTime = clampTime(time, 0, end - MIN_ITEM_DURATION);
    return updateItem(project, itemId, { startTime, duration: end - startTime });
  }
  const nextVideo = item.kind === 'video'
    ? project.tracks.find((track) => track.id === 'video')?.items
        .filter((other) => other.id !== itemId && other.startTime >= item.startTime)
        .sort((a, b) => a.startTime - b.startTime)[0]
    : undefined;
  const end = clampTime(time, item.startTime + MIN_ITEM_DURATION,
    Math.min(MAX_TIMELINE_SECONDS, nextVideo?.startTime ?? MAX_TIMELINE_SECONDS));
  return updateItem(project, itemId, { duration: end - item.startTime });
}

export function reorderVideo(project: TimelineProject, itemId: string, targetIndex: number): TimelineProject {
  const track = project.tracks.find((entry) => entry.id === 'video');
  if (!track) return project;
  const videos = track.items.filter((item): item is VideoTimelineItem => item.kind === 'video');
  const sourceIndex = videos.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return project;
  const reordered = [...videos];
  const [moved] = reordered.splice(sourceIndex, 1);
  reordered.splice(Math.max(0, Math.min(videos.length - 1, targetIndex)), 0, moved);
  let cursor = 0;
  const sequential = reordered.map((item) => { const next = { ...item, startTime: cursor }; cursor += item.duration; return next; });
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
  const duration = clampTime(Math.max(videoEnd, overlayEnd));
  return { ...project, tracks, duration, extensionExplicit: overlayEnd > videoEnd + 0.001 };
}

function normalizeItem<T extends TimelineItem>(item: T): T {
  const startTime = clampTime(item.startTime);
  const duration = clampTime(item.duration, MIN_ITEM_DURATION, MAX_TIMELINE_SECONDS - startTime);
  const common = { ...item, startTime, duration };
  if (item.kind === 'audio' || item.kind === 'video') return { ...common, sourceStart: clampTime(item.sourceStart), volume: clampTime(item.volume, 0, 1) } as T;
  if (item.kind === 'text') {
    const inAnimation = item.inAnimation ?? 'none';
    const outAnimation = item.outAnimation ?? 'none';
    let inAnimationDuration = clampTime(item.inAnimationDuration ?? 0.5, 0.1, Math.min(3, duration));
    let outAnimationDuration = clampTime(item.outAnimationDuration ?? 0.5, 0.1, Math.min(3, duration));
    if (inAnimation !== 'none' && outAnimation !== 'none' && inAnimationDuration + outAnimationDuration > duration) {
      const ratio = duration / (inAnimationDuration + outAnimationDuration);
      inAnimationDuration = clampTime(inAnimationDuration * ratio, 0.1, duration);
      outAnimationDuration = clampTime(duration - inAnimationDuration, 0.1, duration);
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
  const target = clampTime(requested, 0, maxStart);
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
  return clampTime(candidates.reduce((best, candidate) =>
    Math.abs(candidate - target) < Math.abs(best - target) ? candidate : best));
}

/** Split video or audio at a timeline time; returns unchanged project if invalid. */
export function splitItem(project: TimelineProject, itemId: string, time: number, newId: string): TimelineProject {
  const item = projectItem(project, itemId);
  if (!item || (item.kind !== 'video' && item.kind !== 'audio')) return project;
  const offset = clampTime(time - item.startTime);
  if (offset < MIN_ITEM_DURATION || item.duration - offset < MIN_ITEM_DURATION) return project;
  const left = { ...item, duration: offset };
  const right = { ...item, id: newId, startTime: clampTime(item.startTime + offset),
    duration: clampTime(item.duration - offset), sourceStart: clampTime(item.sourceStart + offset) };
  return normalizeProject({ ...project, tracks: project.tracks.map((track) => ({ ...track,
    items: track.items.flatMap((entry) => entry.id === itemId ? [left, right] : [entry])
  })) });
}
