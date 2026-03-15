import { Film, PlaySquare, Sparkles } from 'lucide-react';

export type VideoLaneKey = 'daily' | 'creator_pro' | 'premium';

export type VideoLaneDefinition = {
  key: VideoLaneKey;
  label: string;
  shortLabel: string;
  description: string;
  helper: string;
  accentClassName: string;
  pillClassName: string;
  icon: typeof PlaySquare;
};

export const VIDEO_LANES: readonly VideoLaneDefinition[] = [
  {
    key: 'daily',
    label: 'Daily Reels',
    shortLabel: 'Daily',
    description: 'Affordable, budget-safe, and tuned for frequent short-form posting.',
    helper: '',
    accentClassName:
      'border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-surface)/0.72),hsl(var(--color-bg)/0.92))] text-text',
    pillClassName:
      'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.42)] text-text',
    icon: PlaySquare,
  },
  {
    key: 'creator_pro',
    label: 'Creator Pro',
    shortLabel: 'Creator Pro',
    description: 'Balanced quality and credit efficiency for serious creators and growing brands.',
    helper: 'Recommended for most users. Better visual polish without jumping straight into premium cinema pricing.',
    accentClassName:
      'border-[hsl(var(--color-accent)/0.3)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.14),hsl(var(--color-surface)/0.9))] text-text',
    pillClassName:
      'border-[hsl(var(--color-accent)/0.28)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]',
    icon: Film,
  },
  {
    key: 'premium',
    label: 'Premium / Cinema',
    shortLabel: 'Premium',
    description: 'Highest-quality hero output for launches, ads, cinematic visuals, and flagship campaigns.',
    helper: 'Use this when quality matters most and you are comfortable with premium credit usage.',
    accentClassName:
      'border-[hsl(var(--color-accent)/0.4)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.2),hsl(var(--color-elevated)/0.9))] text-text',
    pillClassName:
      'border-[hsl(var(--color-accent)/0.4)] bg-[hsl(var(--color-accent)/0.18)] text-text',
    icon: Sparkles,
  },
] as const;

export function getVideoLaneDefinition(lane: VideoLaneKey): VideoLaneDefinition {
  return VIDEO_LANES.find((item) => item.key === lane) ?? VIDEO_LANES[1];
}
