import type { TimelineProject } from './types.ts';

export type ExportTimelinePayload = {
  aspect_ratio: '9:16'; width: 720; height: 1280; fps: 30;
  clips: Array<{ media_id: string; order: number; start_seconds: number; duration_seconds: number; crop_mode: 'cover' | 'contain'; muted: boolean; volume: number }>;
  text_overlays: Array<{ id: string; text: string; start_seconds: number; duration_seconds: number; font_family: string; font_size: number; color: string; bold: boolean; x: number; y: number; width: number; rotation_degrees: number; alignment: 'left' | 'center' | 'right'; outline_color: string; outline_width: number; shadow: boolean; background_color: string; background_opacity: number }>;
  audio_items: Array<{ id: string; media_id: string; kind: 'music' | 'sfx' | 'voice'; start_seconds: number; duration_seconds: number; source_start_seconds: number; volume: number; muted: boolean }>;
  effects: Array<{ id: string; preset: string; start_seconds: number; duration_seconds: number; amount: number }>;
};

export function serializeTimelineProject(project: TimelineProject): ExportTimelinePayload {
  const items = project.tracks.flatMap((track) => track.items);
  const videos = items.filter((item) => item.kind === 'video').sort((a, b) => a.startTime - b.startTime);
  return {
    aspect_ratio: '9:16', width: 720, height: 1280, fps: 30,
    clips: videos.map((item, order) => ({ media_id: item.mediaId, order, start_seconds: item.sourceStart, duration_seconds: item.duration, crop_mode: item.cropMode, muted: item.muted, volume: item.volume })),
    text_overlays: items.filter((item) => item.kind === 'text').map((item) => ({ id: item.id, text: item.text, start_seconds: item.startTime, duration_seconds: item.duration, font_family: item.fontFamily, font_size: Math.round(item.fontSize), color: item.color, bold: item.bold, x: item.x, y: item.y, width: item.width, rotation_degrees: item.rotation, alignment: item.alignment, outline_color: item.outlineColor, outline_width: item.outlineWidth, shadow: item.shadow, background_color: item.backgroundColor, background_opacity: item.backgroundOpacity })),
    audio_items: items.filter((item) => item.kind === 'audio').map((item) => ({ id: item.id, media_id: item.mediaId, kind: item.trackId, start_seconds: item.startTime, duration_seconds: item.duration, source_start_seconds: item.sourceStart, volume: item.volume, muted: item.muted })),
    effects: items.filter((item) => item.kind === 'effect').map((item) => ({ id: item.id, preset: item.preset, start_seconds: item.startTime, duration_seconds: item.duration, amount: item.amount })),
  };
}
