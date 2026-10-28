import type { TimelineProject } from './types.ts';

export type ExportTimelinePayload = {
  aspect_ratio: '9:16' | '16:9' | '1:1' | '4:5'; width: number; height: number; fps: 24 | 30 | 60;
  quality: 'standard' | 'high'; output_filename: string;
  clips: Array<{ media_id: string; order: number; start_seconds: number; timeline_start_seconds: number; duration_seconds: number; crop_mode: 'cover' | 'contain'; muted: boolean; volume: number }>;
  text_overlays: Array<{ id: string; text: string; start_seconds: number; duration_seconds: number; font_family: string; font_size: number; color: string; bold: boolean; x: number; y: number; width: number; rotation_degrees: number; alignment: 'left' | 'center' | 'right'; outline_color: string; outline_width: number; shadow: boolean; background_color: string; background_opacity: number; in_animation: string; out_animation: string; loop_animation: string; in_animation_duration: number; out_animation_duration: number }>;
  audio_items: Array<{ id: string; media_id: string; kind: 'music' | 'sfx' | 'voice'; start_seconds: number; duration_seconds: number; source_start_seconds: number; volume: number; muted: boolean }>;
  effects: Array<{ id: string; preset: string; start_seconds: number; duration_seconds: number; amount: number }>;
};

export function serializeTimelineProject(project: TimelineProject): ExportTimelinePayload {
  const items = project.tracks.flatMap((track) => track.items);
  const videos = items.filter((item) => item.kind === 'video').sort((a, b) => a.startTime - b.startTime);
  const dimensions = exportDimensions(project.aspectRatio, project.exportSettings.resolution);
  return {
    aspect_ratio: project.aspectRatio, ...dimensions, fps: project.exportSettings.fps,
    quality: project.exportSettings.quality, output_filename: normalizeExportFilename(project.exportSettings.filename),
    clips: videos.map((item, order) => ({ media_id: item.mediaId, order, start_seconds: item.sourceStart, timeline_start_seconds: item.startTime, duration_seconds: item.duration, crop_mode: item.cropMode, muted: item.muted, volume: item.volume })),
    text_overlays: items.filter((item) => item.kind === 'text').map((item) => ({ id: item.id, text: item.text, start_seconds: item.startTime, duration_seconds: item.duration, font_family: item.fontFamily, font_size: Math.round(item.fontSize), color: item.color, bold: item.bold, x: item.x, y: item.y, width: item.width, rotation_degrees: item.rotation, alignment: item.alignment, outline_color: item.outlineColor, outline_width: item.outlineWidth, shadow: item.shadow, background_color: item.backgroundColor, background_opacity: item.backgroundOpacity, in_animation: item.inAnimation, out_animation: item.outAnimation, loop_animation: item.loopAnimation, in_animation_duration: item.inAnimationDuration, out_animation_duration: item.outAnimationDuration })),
    audio_items: items.filter((item) => item.kind === 'audio').map((item) => ({ id: item.id, media_id: item.mediaId, kind: item.trackId, start_seconds: item.startTime, duration_seconds: item.duration, source_start_seconds: item.sourceStart, volume: item.volume, muted: item.muted })),
    effects: items.filter((item) => item.kind === 'effect').map((item) => ({ id: item.id, preset: item.preset, start_seconds: item.startTime, duration_seconds: item.duration, amount: item.amount })),
  };
}

export function exportDimensions(aspectRatio: TimelineProject['aspectRatio'], resolution: TimelineProject['exportSettings']['resolution']): { width: number; height: number } {
  const short = resolution === '1080p' ? 1080 : 720;
  return {
    '9:16': { width: short, height: resolution === '1080p' ? 1920 : 1280 },
    '16:9': { width: resolution === '1080p' ? 1920 : 1280, height: short },
    '1:1': { width: short, height: short },
    '4:5': { width: short, height: resolution === '1080p' ? 1350 : 900 },
  }[aspectRatio];
}

export function normalizeExportFilename(value: string): string {
  const cleaned = value.trim().replace(/[^A-Za-z0-9 _.-]/g, '').slice(0, 80) || 'rangmanch-export';
  return cleaned.toLowerCase().endsWith('.mp4') ? cleaned : `${cleaned}.mp4`;
}
