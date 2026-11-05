import type { EditedSegment } from './talkingHeadTiming.ts';

export type FaceGuidance = {
  mediaId: string;
  captions: Array<{
    start: number;
    end: number;
    status: 'suggested' | 'review_required';
    x: number;
    y: number;
    width: number;
  }>;
  zooms: Array<{
    start: number;
    end: number;
    status: 'suggested' | 'review_required';
    maxScale: number;
  }>;
};

type UnknownRecord = Record<string, unknown>;
const obj = (v: unknown): v is UnknownRecord => v !== null && typeof v === 'object' && !Array.isArray(v);
const unit = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const time = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 65;

/** Ignore missing/malformed or mismatched reports, never infer face positions. */
export function parseFaceGuidance(value: unknown, expectedMediaId: string): FaceGuidance | null {
  if (!obj(value) || value.schema_version !== '2.0' || !obj(value.media) ||
    value.media.media_id !== expectedMediaId || !obj(value.creative_guidance) ||
    value.creative_guidance.auto_apply !== false || !obj(value.visual) ||
    value.visual.face_status !== 'complete') return null;
  const guidance = value.creative_guidance;
  if (!Array.isArray(guidance.caption_placements) || !Array.isArray(guidance.zoom_framing) ||
      !obj(value.speech) || !Array.isArray(value.speech.segments)) return null;
  const ranges = new Map<string, { start: number; end: number }>();
  for (const segment of value.speech.segments) {
    if (!obj(segment) || typeof segment.id !== 'string' || !time(segment.start) ||
      !time(segment.end) || segment.start >= segment.end) return null;
    ranges.set(segment.id, { start: segment.start, end: segment.end });
  }
  const captions: FaceGuidance['captions'] = [];
  for (const item of guidance.caption_placements) {
    if (!obj(item) || typeof item.segment_id !== 'string' || !ranges.has(item.segment_id) ||
        (item.status !== 'suggested' && item.status !== 'review_required') ||
        !unit(item.x) || !unit(item.y) || !unit(item.width) ||
        item.x < 0.02 || item.x > 0.98 || item.y < 0.02 || item.y > 0.98 ||
        item.width < 0.1 || item.width > 0.96) return null;
    captions.push({ ...ranges.get(item.segment_id)!, status: item.status, x: item.x, y: item.y, width: item.width });
  }
  const zooms: FaceGuidance['zooms'] = [];
  for (const item of guidance.zoom_framing) {
    if (!obj(item) || typeof item.segment_id !== 'string' || !ranges.has(item.segment_id) ||
        (item.status !== 'suggested' && item.status !== 'review_required') ||
        typeof item.max_scale !== 'number' || item.max_scale < 1 || item.max_scale > 1.15) return null;
    zooms.push({ ...ranges.get(item.segment_id)!, status: item.status, maxScale: item.max_scale });
  }
  return { mediaId: expectedMediaId, captions, zooms };
}

/** Source timestamp for a position on the edited timeline. */
export function sourceAtTimeline(timeSeconds: number, segments: readonly EditedSegment[]): number | null {
  const part = segments.find((s) => timeSeconds >= s.timelineStart - 1e-6 &&
    timeSeconds < s.timelineStart + s.duration + 1e-6);
  if (!part) return null;
  return Math.min(part.sourceEnd, part.sourceStart + timeSeconds - part.timelineStart);
}

export function captionPlacement(
  sourceTime: number, guidance: FaceGuidance,
): { x: number; y: number; width: number } | null {
  const relevant = guidance.captions.filter((p) => sourceTime >= p.start && sourceTime <= p.end);
  return relevant.length === 1 && relevant[0].status === 'suggested'
    ? { x: relevant[0].x, y: relevant[0].y, width: relevant[0].width }
    : null;
}

/** Existing renderer only has centered zoom; enforce <=1.06 max scale. */
export function centeredZoomAllowed(sourceTime: number, guidance: FaceGuidance): boolean {
  const matches = guidance.zooms.filter((z) => sourceTime >= z.start && sourceTime <= z.end);
  return matches.length === 1 && matches[0].status === 'suggested' && matches[0].maxScale >= 1.06;
}


/** Check the entire effect's sampled source span, not only its midpoint. */
export function centeredZoomAllowedForInterval(
  timelineStart: number,
  duration: number,
  segments: readonly EditedSegment[],
  guidance: FaceGuidance,
): boolean {
  if (!Number.isFinite(duration) || duration <= 0) return false;
  for (const fraction of [0, 0.25, 0.5, 0.75, 0.99]) {
    const sourceTime = sourceAtTimeline(timelineStart + duration * fraction, segments);
    if (sourceTime === null || !centeredZoomAllowed(sourceTime, guidance)) return false;
  }
  return true;
}
