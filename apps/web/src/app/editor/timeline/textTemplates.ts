import type { TextTimelineItem } from './types.ts';

export type TextTemplate = {
  id: string;
  name: string;
  sample: string;
  style: Partial<TextTimelineItem>;
};

export const TEXT_TEMPLATES: readonly TextTemplate[] = [
  { id: 'bold-title', name: 'Bold Title', sample: 'BIG MOMENT', style: { fontFamily: 'Inter', fontSize: 64, color: '#ffffff', bold: true, alignment: 'center', outlineColor: '#000000', outlineWidth: 4, shadow: true, backgroundOpacity: 0 } },
  { id: 'minimal', name: 'Minimal', sample: 'Less, beautifully.', style: { fontFamily: 'Lato', fontSize: 42, color: '#ffffff', bold: false, alignment: 'center', outlineWidth: 0, shadow: false, backgroundOpacity: 0 } },
  { id: 'cinematic', name: 'Cinematic', sample: 'A STORY BEGINS', style: { fontFamily: 'Noto Serif', fontSize: 48, color: '#f4dfad', bold: true, alignment: 'center', outlineColor: '#000000', outlineWidth: 2, shadow: true, backgroundOpacity: 0 } },
  { id: 'neon', name: 'Neon', sample: 'NIGHT LIGHTS', style: { fontFamily: 'Roboto', fontSize: 52, color: '#67e8f9', bold: true, alignment: 'center', outlineColor: '#ec4899', outlineWidth: 2, shadow: true, backgroundColor: '#071d4a', backgroundOpacity: 0.35 } },
  { id: 'subtitle', name: 'Subtitle', sample: 'Every moment has a story.', style: { fontFamily: 'Noto Sans', fontSize: 34, color: '#ffffff', bold: true, alignment: 'center', outlineColor: '#000000', outlineWidth: 1, shadow: true, backgroundColor: '#000000', backgroundOpacity: 0.7, y: 0.84, width: 0.88 } },
  { id: 'elegant', name: 'Elegant', sample: 'Timeless', style: { fontFamily: 'Noto Serif', fontSize: 54, color: '#fff7df', bold: false, alignment: 'center', outlineWidth: 0, shadow: true, backgroundOpacity: 0 } },
] as const;

export function createBasicText(startTime: number): TextTimelineItem {
  return {
    id: crypto.randomUUID(), kind: 'text', trackId: 'text', label: 'Your text', text: 'Your text',
    startTime, duration: Math.min(5, 60 - startTime), fontFamily: 'Inter', fontSize: 44,
    color: '#ffffff', bold: true, x: 0.5, y: 0.5, width: 0.8, rotation: 0,
    alignment: 'center', outlineColor: '#000000', outlineWidth: 0, shadow: true,
    backgroundColor: '#000000', backgroundOpacity: 0,
    inAnimation: 'none', outAnimation: 'none', loopAnimation: 'none',
    inAnimationDuration: 0.5, outAnimationDuration: 0.5,
  };
}

export function applyTextTemplate(item: TextTimelineItem, template: TextTemplate): TextTimelineItem {
  return { ...item, ...template.style, label: item.text || template.sample };
}
