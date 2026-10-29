import type { CSSProperties } from 'react';
import type { EffectPreset, EffectTimelineItem } from './types.ts';

export type FilterCategory = 'Natural' | 'Cinematic' | 'Vintage' | 'Creative';
export type EffectSection = 'filters' | 'effects' | 'transitions';
export type FilterDefinition = {
  id: string;
  name: string;
  category: FilterCategory;
  section: EffectSection;
  preset: EffectPreset;
  defaultIntensity: number;
};

export function transitionProgress(boundary: number, duration: number, time: number): number {
  if (!Number.isFinite(duration) || duration <= 0) return 1;
  return Math.max(0, Math.min(1, (time - (boundary - duration / 2)) / duration));
}

export const FILTER_DEFINITIONS: readonly FilterDefinition[] = [
  { id: 'natural-pop', name: 'Natural Pop', section: 'filters', category: 'Natural', preset: 'vibrance', defaultIntensity: 1.25 },
  { id: 'clean-light', name: 'Clean Light', section: 'filters', category: 'Natural', preset: 'brightness', defaultIntensity: 1.08 },
  { id: 'cinema-depth', name: 'Cinema Depth', section: 'filters', category: 'Cinematic', preset: 'contrast', defaultIntensity: 1.22 },
  { id: 'cinema-edge', name: 'Cinema Edge', section: 'filters', category: 'Cinematic', preset: 'vignette', defaultIntensity: 1.05 },
  { id: 'vintage-fade', name: 'Vintage Fade', section: 'filters', category: 'Vintage', preset: 'saturation', defaultIntensity: 0.72 },
  { id: 'silver', name: 'Silver', section: 'filters', category: 'Vintage', preset: 'grayscale', defaultIntensity: 1 },
  { id: 'color-punch', name: 'Color Punch', section: 'filters', category: 'Creative', preset: 'saturation', defaultIntensity: 1.45 },
  { id: 'high-key', name: 'High Key', section: 'filters', category: 'Creative', preset: 'brightness', defaultIntensity: 1.18 },
  { id: 'warm-glow', name: 'Warm Glow', section: 'filters', category: 'Natural', preset: 'warm', defaultIntensity: 1 },
  { id: 'cool-air', name: 'Cool Air', section: 'filters', category: 'Cinematic', preset: 'cool', defaultIntensity: 1 },
  { id: 'classic-sepia', name: 'Classic Sepia', section: 'filters', category: 'Vintage', preset: 'sepia', defaultIntensity: 0.75 },
  { id: 'hue-shift', name: 'Hue Shift', section: 'filters', category: 'Creative', preset: 'hue-rotate', defaultIntensity: 0.15 },
  { id: 'negative', name: 'Negative', section: 'effects', category: 'Creative', preset: 'invert', defaultIntensity: 1 },
  { id: 'soft-blur', name: 'Soft Blur', section: 'effects', category: 'Creative', preset: 'blur', defaultIntensity: 0.45 },
  { id: 'slow-zoom', name: 'Slow Zoom', section: 'effects', category: 'Cinematic', preset: 'zoom-in', defaultIntensity: 1 },
  { id: 'slow-zoom-out', name: 'Slow Zoom Out', section: 'effects', category: 'Cinematic', preset: 'zoom-out', defaultIntensity: 1 },
  { id: 'fade-in', name: 'Fade In', section: 'transitions', category: 'Cinematic', preset: 'fade-in', defaultIntensity: 1 },
  { id: 'fade-out', name: 'Fade Out', section: 'transitions', category: 'Cinematic', preset: 'fade-out', defaultIntensity: 1 },
] as const;

export function validateFilterAmount(preset: EffectPreset, amount: number): number {
  if (!Number.isFinite(amount)) return 1;
  if (preset === 'grayscale' || preset === 'sepia' || preset === 'invert') return Math.max(0, Math.min(1, amount));
  return Math.max(0, Math.min(2, amount));
}

export function browserEffectStyle(effects: EffectTimelineItem[], time: number): CSSProperties {
  const state = browserEffectState(effects, time);
  return { opacity: state.opacity, transform: `scale(${state.scale})`, filter: state.filter || undefined };
}

export function browserEffectState(effects: EffectTimelineItem[], time: number): { opacity: number; scale: number; filter: string } {
  const filters: string[] = [];
  let opacity = 1;
  let scale = 1;
  for (const effect of effects) {
    const amount = validateFilterAmount(effect.preset, effect.amount);
    const progress = Math.max(0, Math.min(1, (time - effect.startTime) / effect.duration));
    if (effect.preset === 'fade-in') opacity *= progress;
    if (effect.preset === 'fade-out') opacity *= 1 - progress;
    if (effect.preset === 'zoom-in') scale *= 1 + 0.12 * amount * progress;
    if (effect.preset === 'zoom-out') scale *= 1.12 - 0.12 * amount * progress;
    if (effect.preset === 'grayscale') filters.push(`grayscale(${amount})`);
    if (effect.preset === 'blur') filters.push(`blur(${amount * 5}px)`);
    if (effect.preset === 'brightness') filters.push(`brightness(${amount})`);
    if (effect.preset === 'contrast') filters.push(`contrast(${amount})`);
    if (effect.preset === 'saturation') filters.push(`saturate(${amount})`);
    if (effect.preset === 'vibrance') filters.push(`saturate(${amount}) contrast(${1 + (amount - 1) * 0.12})`);
    if (effect.preset === 'sepia') filters.push(`sepia(${amount})`);
    if (effect.preset === 'hue-rotate') filters.push(`hue-rotate(${amount * 180}deg)`);
    if (effect.preset === 'invert') filters.push(`invert(${amount})`);
    if (effect.preset === 'warm') filters.push(`sepia(${Math.min(0.3, amount * 0.12)}) saturate(${1 + amount * 0.15}) hue-rotate(${-amount * 8}deg)`);
    if (effect.preset === 'cool') filters.push(`saturate(${1 + amount * 0.08}) hue-rotate(${amount * 12}deg)`);
  }
  return { opacity, scale, filter: filters.join(' ') };
}

export function vignetteOpacity(effects: EffectTimelineItem[]): number {
  return Math.max(0, ...effects.filter((effect) => effect.preset === 'vignette').map((effect) => Math.min(0.72, effect.amount * 0.36)));
}

export function effectsWithTemporaryPreview(
  committed: readonly EffectTimelineItem[],
  preview: EffectTimelineItem | null,
): EffectTimelineItem[] {
  return preview ? [...committed, preview] : [...committed];
}
