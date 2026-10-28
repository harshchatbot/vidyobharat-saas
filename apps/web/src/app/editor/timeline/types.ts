export const MAX_TIMELINE_SECONDS = 60;
export const MIN_ITEM_DURATION = 0.25;

export type TrackType = 'video' | 'text' | 'effects' | 'music' | 'sfx' | 'voice';
export type CropMode = 'cover' | 'contain';
export type TextAlignment = 'left' | 'center' | 'right';
export type TextInAnimation = 'none' | 'fade-in' | 'slide-up' | 'pop-in';
export type TextOutAnimation = 'none' | 'fade-out' | 'slide-down';
export type TextLoopAnimation = 'none' | 'pulse' | 'float';
export type EffectPreset = 'fade-in' | 'fade-out' | 'zoom-in' | 'grayscale' | 'blur' | 'brightness' | 'contrast' | 'vibrance' | 'vignette' | 'saturation';
export type ProjectAspectRatio = '9:16' | '16:9' | '1:1' | '4:5';
export type ExportResolution = '720p' | '1080p';
export type ExportFrameRate = 24 | 30 | 60;
export type ExportQuality = 'standard' | 'high';
export type ProjectExportSettings = { filename: string; resolution: ExportResolution; fps: ExportFrameRate; quality: ExportQuality };

export type GuestMedia = {
  media_id: string;
  original_filename: string;
  media_type: 'image' | 'video' | 'audio';
  content_type: string;
  duration_seconds?: number | null;
  availability?: 'available' | 'unavailable' | 'unknown';
};

type BaseTimelineItem = { id: string; trackId: TrackType; startTime: number; duration: number; label: string };
export type VideoTimelineItem = BaseTimelineItem & { kind: 'video'; trackId: 'video'; mediaId: string; contentType: string; sourceStart: number; cropMode: CropMode; muted: boolean; volume: number };
export type TextTimelineItem = BaseTimelineItem & {
  kind: 'text'; trackId: 'text'; text: string; fontFamily: string; fontSize: number;
  color: string; bold: boolean; x: number; y: number; width: number; rotation: number;
  alignment: TextAlignment; outlineColor: string; outlineWidth: number; shadow: boolean;
  backgroundColor: string; backgroundOpacity: number;
  inAnimation: TextInAnimation; outAnimation: TextOutAnimation; loopAnimation: TextLoopAnimation;
  inAnimationDuration: number; outAnimationDuration: number;
};
export type AudioTimelineItem = BaseTimelineItem & { kind: 'audio'; trackId: 'music' | 'sfx' | 'voice'; mediaId: string; contentType: string; sourceStart: number; muted: boolean; volume: number };
export type EffectTimelineItem = BaseTimelineItem & { kind: 'effect'; trackId: 'effects'; preset: EffectPreset; amount: number };
export type TimelineItem = VideoTimelineItem | TextTimelineItem | AudioTimelineItem | EffectTimelineItem;
export type TimelineTrack = { id: TrackType; type: TrackType; name: string; items: TimelineItem[] };
export type TimelineProject = { id: string; duration: number; aspectRatio: ProjectAspectRatio; exportSettings: ProjectExportSettings; tracks: TimelineTrack[] };

export const EDITOR_FONTS = ['Inter', 'Lato', 'Roboto', 'Noto Sans', 'Noto Serif'] as const;
export const EFFECT_PRESETS: EffectPreset[] = ['fade-in', 'fade-out', 'zoom-in', 'grayscale', 'blur', 'brightness', 'contrast', 'vibrance', 'vignette', 'saturation'];

export function createEmptyProject(): TimelineProject {
  return {
    id: 'guest-reel', duration: 0, aspectRatio: '9:16',
    exportSettings: { filename: 'rangmanch-export.mp4', resolution: '720p', fps: 30, quality: 'high' },
    tracks: [
      { id: 'text', type: 'text', name: 'Text', items: [] },
      { id: 'video', type: 'video', name: 'Visuals', items: [] },
      { id: 'effects', type: 'effects', name: 'Effects', items: [] },
      { id: 'music', type: 'music', name: 'Music', items: [] },
      { id: 'sfx', type: 'sfx', name: 'SFX', items: [] },
      { id: 'voice', type: 'voice', name: 'Voice', items: [] },
    ],
  };
}
