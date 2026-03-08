import { Clapperboard, Crown, Sparkles, Zap } from 'lucide-react';

export type VideoLaneKey = 'daily' | 'creator_pro' | 'premium';

export const VIDEO_LANES: Array<{
  key: VideoLaneKey;
  label: string;
  title: string;
  description: string;
  helper: string;
  icon: typeof Zap;
  softCreditCap: number;
  estimatedTime: string;
  accentClass: string;
}> = [
  {
    key: 'daily',
    label: 'Daily Reels',
    title: 'Daily Reels',
    description: 'Affordable, budget-safe, and tuned for frequent posting.',
    helper: 'Best for fast daily posting and cost-controlled short-form workflows.',
    icon: Zap,
    softCreditCap: 18,
    estimatedTime: '1-2 min',
    accentClass: 'text-[hsl(var(--color-success))]',
  },
  {
    key: 'creator_pro',
    label: 'Creator Pro',
    title: 'Creator Pro',
    description: 'Balanced quality and cost for most serious creators.',
    helper: 'Recommended for educators, brands, coaches, and steady publishing cadence.',
    icon: Clapperboard,
    softCreditCap: 40,
    estimatedTime: '2-4 min',
    accentClass: 'text-[hsl(var(--color-accent))]',
  },
  {
    key: 'premium',
    label: 'Premium / Cinema',
    title: 'Premium / Cinema',
    description: 'Highest quality for ads, launches, and hero visuals.',
    helper: 'Use when visual polish matters more than credit efficiency.',
    icon: Crown,
    softCreditCap: 90,
    estimatedTime: '3-6 min',
    accentClass: 'text-text',
  },
];

export const DEFAULT_VIDEO_LANE: VideoLaneKey = 'creator_pro';

export function getVideoLaneMeta(key: VideoLaneKey) {
  return VIDEO_LANES.find((lane) => lane.key === key) ?? VIDEO_LANES[1];
}
