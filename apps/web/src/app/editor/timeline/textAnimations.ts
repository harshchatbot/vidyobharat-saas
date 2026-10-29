import type { CSSProperties } from 'react';
import type { TextTimelineItem } from './types.ts';

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function textAnimationStyle(item: TextTimelineItem, localTime: number): CSSProperties {
  const time = Math.max(0, localTime);
  const inProgress = clamp01(time / Math.max(0.1, item.inAnimationDuration));
  const outStart = Math.max(0, item.duration - item.outAnimationDuration);
  const outProgress = clamp01((time - outStart) / Math.max(0.1, item.outAnimationDuration));
  let opacity = 1;
  let translateY = 0;
  let scale = 1;

  if (item.inAnimation === 'fade-in') opacity *= inProgress;
  if (item.inAnimation === 'slide-up') translateY += (1 - easeOut(inProgress)) * 48;
  if (item.inAnimation === 'pop-in') {
    opacity *= inProgress;
    scale *= 0.72 + 0.28 * easeOutBack(inProgress);
  }
  if (item.outAnimation === 'fade-out') opacity *= 1 - outProgress;
  if (item.outAnimation === 'slide-down') translateY += easeIn(outProgress) * 48;
  if (item.loopAnimation === 'pulse') scale *= 1 + Math.sin(time * Math.PI * 2) * 0.04;
  if (item.loopAnimation === 'float') translateY += Math.sin(time * Math.PI * 1.5) * 8;

  return { opacity, transform: `translateY(${translateY}px) scale(${scale})` };
}

function easeIn(value: number) { return value * value; }
function easeOut(value: number) { return 1 - (1 - value) * (1 - value); }
function easeOutBack(value: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(value - 1, 3) + c1 * Math.pow(value - 1, 2);
}
