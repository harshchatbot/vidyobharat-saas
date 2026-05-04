import type { InspirationImage, InspirationVideo } from '@/types/api';

export type PublicInspirationFilter = 'all' | 'image' | 'video';
export type PublicInspirationItem = InspirationImage | InspirationVideo;

export function isVideoInspiration(item: PublicInspirationItem): item is InspirationVideo {
  return 'video_url' in item;
}

export function isImageInspiration(item: PublicInspirationItem): item is InspirationImage {
  return 'image_url' in item;
}

export function sortPublicInspiration<T extends { created_at: string; like_count?: number }>(
  items: T[],
  sort: 'newest' | 'liked' = 'newest',
): T[] {
  const ranked = [...items];
  ranked.sort((left, right) => {
    if (sort === 'liked') {
      const likeDelta = (right.like_count ?? 0) - (left.like_count ?? 0);
      if (likeDelta !== 0) return likeDelta;
    }
    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
  });
  return ranked;
}

export function mergeUniqueInspiration<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((item) => item.id));
  const next = [...current];
  for (const item of incoming) {
    if (seen.has(item.id)) continue;
    next.push(item);
    seen.add(item.id);
  }
  return next;
}

export function aspectRatioToCss(value: string | null | undefined, fallback = '9 / 16') {
  if (!value) return fallback;
  const normalized = value.replace(/\s+/g, '');
  const separator = normalized.includes(':') ? ':' : normalized.includes('/') ? '/' : null;
  if (!separator) return fallback;
  const [w, h] = normalized.split(separator);
  const width = Number(w);
  const height = Number(h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return fallback;
  }
  return `${width} / ${height}`;
}
