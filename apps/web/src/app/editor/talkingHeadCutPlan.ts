import { buildEditedSegments, type EditedSegment, type SourceInterval } from './talkingHeadTiming.ts';
import { MAX_TIMELINE_SECONDS, MIN_ITEM_DURATION, type AudioTimelineItem, type VideoTimelineItem } from './timeline/types.ts';

export type TalkingHeadCutPlan = {
  segments: EditedSegment[];
  video: VideoTimelineItem[];
  voice: AudioTimelineItem[];
  originalDuration: number;
  editedDuration: number;
  removedDuration: number;
};

/**
 * Prepare reviewable cuts from one source video and an optional separately
 * extracted speech track. No project state is changed.
 *
 * The caller must supply voiceMediaId only when it represents the same source
 * recording, with identical time origin. Audio extraction is not done here.
 */
export function buildTalkingHeadCutPlan(args: {
  video: VideoTimelineItem;
  sourceDuration: number;
  removals: readonly SourceInterval[];
  voiceMediaId?: string;
  voiceContentType?: string;
  minKeepSeconds?: number;
}): TalkingHeadCutPlan {
  const { video, sourceDuration, removals, voiceMediaId, voiceContentType } = args;
  if (video.startTime !== 0 || video.sourceStart !== 0) {
    throw new Error('Talking-head cut planning currently requires an untrimmed source clip at timeline zero.');
  }
  if (!Number.isFinite(sourceDuration) || sourceDuration <= 0 || sourceDuration > MAX_TIMELINE_SECONDS) {
    throw new Error('Source duration exceeds the current timeline limit.');
  }
  if (Math.abs(video.duration - sourceDuration) > 1 / 30) {
    throw new Error('Video clip duration must match the analyzed recording.');
  }
  const segments = buildEditedSegments(sourceDuration, removals, args.minKeepSeconds ?? MIN_ITEM_DURATION);
  if (!segments.length) throw new Error('No usable footage remains after removing silence.');
  const editedDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
  const makeVideo = (segment: EditedSegment, index: number): VideoTimelineItem => ({
    ...video,
    id: `${video.id}-cut-${index + 1}`,
    label: `${video.label} · ${index + 1}`,
    startTime: segment.timelineStart,
    sourceStart: segment.sourceStart,
    duration: segment.duration,
    transitionOut: undefined,
  });
  const voice: AudioTimelineItem[] = voiceMediaId ? segments.map((segment, index) => ({
    id: `${video.id}-voice-${index + 1}`,
    kind: 'audio',
    trackId: 'voice',
    label: `Original voice · ${index + 1}`,
    mediaId: voiceMediaId,
    contentType: voiceContentType ?? 'audio/wav',
    startTime: segment.timelineStart,
    sourceStart: segment.sourceStart,
    duration: segment.duration,
    muted: video.muted,
    volume: video.volume,
  })) : [];
  return {
    segments,
    video: segments.map(makeVideo),
    voice,
    originalDuration: sourceDuration,
    editedDuration,
    removedDuration: sourceDuration - editedDuration,
  };
}
