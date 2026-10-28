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
  if (!item || item.kind === 'video') return project;
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
  const end = clampTime(time, item.startTime + MIN_ITEM_DURATION, MAX_TIMELINE_SECONDS);
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

export function normalizeProject(project: TimelineProject): TimelineProject {
  const tracks = project.tracks.map((track) => ({ ...track, items: track.items.map(normalizeItem) }));
  const videoTrack = tracks.find((track) => track.id === 'video');
  let cursor = 0;
  if (videoTrack) {
    videoTrack.items = videoTrack.items.map((item) => { const duration = Math.min(item.duration, MAX_TIMELINE_SECONDS - cursor); const next = { ...item, startTime: cursor, duration } as TimelineItem; cursor += duration; return next; }).filter((item) => item.duration >= MIN_ITEM_DURATION);
  }
  const furthestEnd = tracks.flatMap((track) => track.items).reduce((max, item) => Math.max(max, item.startTime + item.duration), 0);
  return { ...project, tracks, duration: clampTime(Math.max(cursor, furthestEnd)) };
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
