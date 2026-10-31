
import { createBasicText } from './timeline/textTemplates.ts';
import {
  COPILOT_EDIT_PLAN_VERSION,
  type CopilotEditPlan,
} from './timeline/editPlan.ts';
import {
  MAX_TIMELINE_SECONDS,
  V1_TIMELINE_FPS,
  type GuestMedia,
  type TimelineProject,
} from './timeline/types.ts';
import { visualTimelineEnd } from './timeline/model.ts';
import {
  snapDurationsToBeats,
  type BeatCandidate,
} from './beatDetection.ts';

export type AutoEditStyle = 'elegant' | 'energetic' | 'cinematic';
export type AutoEditMode = 'replace' | 'add';

type TransitionType = 'crossfade' | 'slide-left' | 'slide-right';

export type AutoEditOptions = {
  style: AutoEditStyle;
  mode: AutoEditMode;
  title?: string;
  targetDuration?: number;
  musicVolume?: number;
  includeMusic?: boolean;
  transition?: TransitionType;
  beatCandidates?: BeatCandidate[];
  /** Validated local-AI choices. This is intentionally limited to supported primitives. */
  aiDirection?: {
    transition: TransitionType;
    effectPattern: Array<'zoom-in' | 'zoom-out' | 'none'>;
  };
};

const MIN_CLIP_DURATION = 1;
const MAX_CLIP_DURATION = 30;
const EPSILON = 1e-6;

const styleConfig: Record<
  AutoEditStyle,
  {
    duration: number;
    zoom: 'zoom-in' | 'zoom-out';
    amount: number;
    transition: 'crossfade' | 'slide-left';
  }
> = {
  elegant: {
    duration: 5,
    zoom: 'zoom-in',
    amount: 0.65,
    transition: 'crossfade',
  },
  energetic: {
    duration: 3,
    zoom: 'zoom-in',
    amount: 1.15,
    transition: 'slide-left',
  },
  cinematic: {
    duration: 6,
    zoom: 'zoom-out',
    amount: 0.55,
    transition: 'crossfade',
  },
};

const pacingWeights: Record<AutoEditStyle, number[]> = {
  elegant: [1, 1.05, 1, 1.05, 0.95],
  energetic: [0.78, 1.08, 1.05, 1.1, 0.99],
  cinematic: [1.2, 1, 1.15, 1, 0.65],
};

function assertDurationFeasible(
  total: number,
  count: number
): void {
  if (
    !Number.isFinite(total) ||
    total <= 0 ||
    total > MAX_TIMELINE_SECONDS
  ) {
    throw new Error(
      'The requested reel duration is invalid or exceeds the timeline limit.'
    );
  }

  if (
    total < count * MIN_CLIP_DURATION - EPSILON ||
    total > count * MAX_CLIP_DURATION + EPSILON
  ) {
    throw new Error(
      `Cannot create a ${total}-second reel with ${count} images. ` +
      `Each image must last between ${MIN_CLIP_DURATION} ` +
      `and ${MAX_CLIP_DURATION} seconds.`
    );
  }
}

/**
 * Allocate clip durations using weighted pacing.
 * Preserve the requested total while enforcing duration bounds.
 */
function allocateDurations(
  total: number,
  count: number,
  style: AutoEditStyle
): number[] {
  if (count <= 0) {
    throw new Error('At least one image is required.');
  }

  assertDurationFeasible(total, count);

  const weights = Array.from(
    { length: count },
    (_, index) =>
      pacingWeights[style][
        index % pacingWeights[style].length
      ]
  );

  const durations = Array(count).fill(MIN_CLIP_DURATION) as number[];
  let remaining = total - count * MIN_CLIP_DURATION;
  let active = Array.from({ length: count }, (_, index) => index);

  while (remaining > EPSILON && active.length > 0) {
    const weightSum = active.reduce(
      (sum, index) => sum + weights[index],
      0
    );

    let allocated = 0;
    const nextActive: number[] = [];

    for (const index of active) {
      const share =
        remaining * (weights[index] / weightSum);

      const capacity =
        MAX_CLIP_DURATION - durations[index];

      const addition = Math.min(share, capacity);

      durations[index] += addition;
      allocated += addition;

      if (
        durations[index] <
        MAX_CLIP_DURATION - EPSILON
      ) {
        nextActive.push(index);
      }
    }

    if (allocated <= EPSILON) {
      break;
    }

    remaining -= allocated;
    active = nextActive;
  }

  if (remaining > EPSILON) {
    throw new Error(
      'Unable to allocate the requested reel duration.'
    );
  }

  return durations;
}

/**
 * Validate durations returned by the beat-snapping algorithm.
 * If beat snapping produces an invalid allocation, retain
 * the original safe durations.
 */
function validateBeatDurations(
  snapped: number[],
  fallback: number[],
  target: number
): number[] {
  if (
    snapped.length !== fallback.length ||
    snapped.some(
      (duration) =>
        !Number.isFinite(duration) ||
        duration < MIN_CLIP_DURATION - EPSILON ||
        duration > MAX_CLIP_DURATION + EPSILON
    )
  ) {
    return fallback;
  }

  const actualTotal = snapped.reduce(
    (sum, duration) => sum + duration,
    0
  );

  if (Math.abs(actualTotal - target) > EPSILON) {
    return fallback;
  }

  return snapped;
}

/**
 * Align every clip boundary to the timeline frame grid.
 * Round cumulative boundaries rather than independent durations, so
 * adjacent clips cannot overlap after normalizeItem() quantizes them.
 */
function alignDurationsToFrames(durations: number[], target: number): number[] {
  const fps = V1_TIMELINE_FPS;
  const totalFrames = Math.round(target * fps);
  if (Math.abs(totalFrames / fps - target) > EPSILON) {
    throw new Error(`Reel duration must be a multiple of 1/${fps} second.`);
  }

  const minFrames = Math.ceil(MIN_CLIP_DURATION * fps);
  const maxFrames = Math.floor(MAX_CLIP_DURATION * fps);
  const frames: number[] = [];
  let previousBoundary = 0;
  let cumulative = 0;

  for (let index = 0; index < durations.length - 1; index++) {
    cumulative += durations[index];
    const remainingClips = durations.length - index - 1;
    const earliest = Math.max(
      previousBoundary + minFrames,
      totalFrames - remainingClips * maxFrames,
    );
    const latest = Math.min(
      previousBoundary + maxFrames,
      totalFrames - remainingClips * minFrames,
    );
    if (earliest > latest) {
      throw new Error('Cannot align the requested reel to timeline frames.');
    }
    const boundary = Math.max(earliest, Math.min(latest, Math.round(cumulative * fps)));
    frames.push(boundary - previousBoundary);
    previousBoundary = boundary;
  }

  frames.push(totalFrames - previousBoundary);
  if (frames.some((count) => count < minFrames || count > maxFrames)) {
    throw new Error('The requested clip durations exceed timeline limits.');
  }
  return frames.map((count) => count / fps);
}

export function buildAutoEditPlan(
  project: TimelineProject,
  media: GuestMedia[],
  revision: string,
  options: AutoEditOptions
): CopilotEditPlan {
  const images = media.filter(
    (item) =>
      item.media_type === 'image' &&
      item.availability !== 'unavailable'
  );

  if (images.length === 0) {
    throw new Error(
      'Upload at least one available image before using Auto Edit.'
    );
  }

  const config = styleConfig[options.style];

  const operations: CopilotEditPlan['operations'] = [];

  const videoTrack = project.tracks.find(
    (track) => track.id === 'video'
  );

  const existingVisuals = [
    ...(videoTrack?.items ?? []),
  ]
    .filter((item) => item.kind === 'video')
    .sort((a, b) => a.startTime - b.startTime);

  // Detect actual overlap between consecutive visual clips.
  if (options.mode === 'add') {
    const hasOverlap = existingVisuals.some(
      (item, index) =>
        index > 0 &&
        item.startTime <
          existingVisuals[index - 1].startTime +
            existingVisuals[index - 1].duration -
            EPSILON
    );

    if (hasOverlap) {
      throw new Error(
        'The current timeline contains overlapping visual clips. ' +
        'Choose Replace current to generate a valid Auto Edit proposal.'
      );
    }
  }

  const appendStart =
    options.mode === 'add'
      ? visualTimelineEnd(project)
      : 0;

  const targetDuration =
    options.targetDuration ??
    config.duration * images.length;

  assertDurationFeasible(
    targetDuration,
    images.length
  );

  if (
    appendStart + targetDuration >
    MAX_TIMELINE_SECONDS + EPSILON
  ) {
    throw new Error(
      'The generated reel would exceed the timeline limit.'
    );
  }

  const baseDurations = allocateDurations(
    targetDuration,
    images.length,
    options.style
  );

  const snappedDurations = options.beatCandidates?.length
    ? snapDurationsToBeats(
        baseDurations,
        options.beatCandidates,
        targetDuration
      )
    : baseDurations;

  const clipDurations = alignDurationsToFrames(
    validateBeatDurations(snappedDurations, baseDurations, targetDuration),
    targetDuration,
  );

  if (project.aspectRatio !== '9:16') {
    operations.push({
      op: 'set_aspect_ratio',
      aspectRatio: '9:16',
    });
  }

  if (options.mode === 'replace') {
    for (const item of project.tracks.flatMap(
      (track) => track.items
    )) {
      operations.push({
        op: 'remove_item',
        itemId: item.id,
      });
    }
  }

  const clipIds: string[] = [];
  const appendStartFrame = Math.round(appendStart * V1_TIMELINE_FPS);
  let cursorFrame = appendStartFrame;
  let cursor = appendStartFrame / V1_TIMELINE_FPS;

  images.forEach((image, index) => {
    const durationFrames = Math.round(clipDurations[index] * V1_TIMELINE_FPS);
    const duration = durationFrames / V1_TIMELINE_FPS;
    cursor = cursorFrame / V1_TIMELINE_FPS;

    if (
      duration <= 0 ||
      cursor + duration >
        MAX_TIMELINE_SECONDS + EPSILON
    ) {
      throw new Error(
        'The generated reel exceeds the timeline limit.'
      );
    }

    const id = crypto.randomUUID();
    clipIds.push(id);

    operations.push({
      op: 'add_media',
      item: {
        id,
        kind: 'video',
        trackId: 'video',
        label: image.original_filename,
        mediaId: image.media_id,
        contentType: image.content_type,
        startTime: cursor,
        duration,
        sourceStart: 0,
        cropMode: 'cover',
        muted: false,
        volume: 1,
        ...(index < images.length - 1
          ? {
              transitionOut: {
                type: options.aiDirection?.transition ?? options.transition ?? config.transition,
                duration: Math.min(
                  0.6,
                  duration / 2
                ),
              },
            }
          : {}),
      },
    });

    const effectPreset = options.aiDirection?.effectPattern[index] ??
      // Alternating the deterministic movement avoids a row of identical zooms.
      (index % 2 === 0 ? config.zoom : (config.zoom === 'zoom-in' ? 'zoom-out' : 'zoom-in'));
    const zoomDuration = Math.min(
      duration,
      options.style === 'energetic'
        ? 2.5
        : 3.5
    );

    if (effectPreset !== 'none') operations.push({
      op: 'add_effect',
      item: {
        id: crypto.randomUUID(), kind: 'effect', trackId: 'effects',
        label: effectPreset, preset: effectPreset, amount: config.amount,
        startTime: cursor, duration: zoomDuration,
      },
    });

    cursorFrame += durationFrames;
    cursor = cursorFrame / V1_TIMELINE_FPS;
  });

  // Add intro and outro effects.
  if (clipIds.length > 0) {
    const firstDuration = clipDurations[0];

    operations.push({
      op: 'add_effect',
      item: {
        id: crypto.randomUUID(),
        kind: 'effect',
        trackId: 'effects',
        label: 'fade-in',
        preset: 'fade-in',
        amount: 1,
        startTime: appendStart,
        duration: Math.min(1, firstDuration),
      },
    });

    const lastDuration =
      clipDurations[clipDurations.length - 1];

    operations.push({
      op: 'add_effect',
      item: {
        id: crypto.randomUUID(),
        kind: 'effect',
        trackId: 'effects',
        label: 'fade-out',
        preset: 'fade-out',
        amount: 1,
        startTime: cursor - Math.min(1, lastDuration),
        duration: Math.min(1, lastDuration),
      },
    });
  }

  // Add title when explicitly requested.
  if (options.title?.trim()) {
    const titleText = options.title.trim();
    const titleLength = titleText.length;

    const titleStyle =
      options.style === 'cinematic'
        ? {
            y: 0.18,
            color: '#f4dfad',
            fontSize: titleLength > 24 ? 44 : 56,
            bold: true,
          }
        : options.style === 'energetic'
          ? {
              y: 0.22,
              color: '#ffffff',
              fontSize: titleLength > 24 ? 42 : 52,
              bold: true,
            }
          : {
              y: 0.18,
              color: '#ffffff',
              fontSize: titleLength > 24 ? 44 : 54,
              bold: true,
            };

    const title = {
      ...createBasicText(appendStart),
      ...titleStyle,
      id: crypto.randomUUID(),
      label: titleText,
      text: titleText,
      width: 0.84,
      x: 0.5,
      duration: Math.min(
        clipDurations[0],
        4
      ),
      alignment: 'center' as const,
      inAnimation: 'fade-in' as const,
      inAnimationDuration: Math.min(
        1,
        clipDurations[0]
      ),
    };

    operations.push({
      op: 'add_text',
      item: title,
    });
  }

  // Only add background music when requested.
  // Default preserves existing caller behavior.
  const includeMusic =
    options.includeMusic ?? true;

  if (includeMusic) {
    const audio = media.filter(
      (item) =>
        item.media_type === 'audio' &&
        item.availability !== 'unavailable'
    );

    if (audio.length > 1) {
      throw new Error(
        'Multiple audio files are available. ' +
        'Please select one music track.'
      );
    }

    if (audio.length === 1) {
      const volume =
        options.musicVolume ?? 0.5;

      if (
        !Number.isFinite(volume) ||
        volume < 0 ||
        volume > 1
      ) {
        throw new Error(
          'Music volume must be between 0 and 1.'
        );
      }

      const audioDuration = Math.min(
        audio[0].duration_seconds ??
          targetDuration,
        targetDuration
      );

      if (
        !Number.isFinite(audioDuration) ||
        audioDuration < 0.25
      ) {
        throw new Error(
          'The selected audio is too short.'
        );
      }

      operations.push({
        op: 'add_audio',
        item: {
          id: crypto.randomUUID(),
          kind: 'audio',
          trackId: 'music',
          label: audio[0].original_filename,
          mediaId: audio[0].media_id,
          contentType: audio[0].content_type,
          startTime: appendStart,
          duration: audioDuration,
          sourceStart: 0,
          muted: false,
          volume,
        },
      });
    }
  }

  return {
    schemaVersion: COPILOT_EDIT_PLAN_VERSION,
    requestId: crypto.randomUUID(),
    projectRevision: revision,
    summary: `Auto Edit · ${options.style}`,
    warnings: [
      'Generated deterministically in the browser.',
    ],
    operations,
  };
}
