import {
  Building2,
  Cpu,
  Landmark,
  Package2,
  Rocket,
  ScrollText,
  Sparkles,
  Crown,
  MonitorSmartphone,
  WandSparkles,
} from 'lucide-react';

import type { AIVideoModel } from '@/types/api';

export type TemplateOption = {
  key: string;
  label: string;
  description: string;
  icon: typeof ScrollText;
  scriptHint: string;
  topicHint: string;
};

export type VoiceOption = {
  key: string;
  label: string;
  tone: string;
  description: string;
};

export const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    key: 'history',
    label: 'History',
    description: 'Dramatic stories, timelines, and big turning points.',
    icon: Landmark,
    scriptHint: 'Open with a compelling moment, give context, explain why it mattered, and close with a memorable takeaway.',
    topicHint: 'The rise of the Maurya empire',
  },
  {
    key: 'mythology',
    label: 'Mythology',
    description: 'Epic stories, characters, and emotional retellings.',
    icon: Sparkles,
    scriptHint: 'Introduce the character, reveal the conflict, add emotion, and land the moral clearly.',
    topicHint: 'Lord Krishna guiding Arjuna on the battlefield',
  },
  {
    key: 'tech',
    label: 'Tech',
    description: 'Explainers, launches, AI tools, and product demos.',
    icon: Cpu,
    scriptHint: 'Start with the problem, simplify the concept, show the benefit, and end with a strong creator CTA.',
    topicHint: 'How AI voice cloning changes content creation',
  },
  {
    key: 'startup',
    label: 'Startup',
    description: 'Pitch-style content, founder stories, and launches.',
    icon: Rocket,
    scriptHint: 'Frame the market pain, your solution, traction, and why users should care right now.',
    topicHint: 'A startup helping local sellers create video ads',
  },
  {
    key: 'product',
    label: 'Product',
    description: 'Showcases, benefits, and polished marketing videos.',
    icon: Package2,
    scriptHint: 'Introduce the product, highlight core features, show outcomes, and close with a clear action.',
    topicHint: 'Premium ayurvedic skincare launch',
  },
  {
    key: 'real-estate',
    label: 'Real Estate',
    description: 'Property tours, amenities, and locality-focused reels.',
    icon: Building2,
    scriptHint: 'Open with the property value, walk through amenities, mention location, and close with a viewing CTA.',
    topicHint: 'Luxury 3BHK in Gurgaon with skyline views',
  },
];

export const LANGUAGE_OPTIONS = ['English', 'Hindi', 'Hinglish'] as const;

export const VOICE_OPTIONS: VoiceOption[] = [
  { key: 'Aarav', label: 'Aarav', tone: 'Warm male', description: 'Steady, confident narration for explainers and history.' },
  { key: 'Anaya', label: 'Anaya', tone: 'Bright female', description: 'Expressive delivery for social content and reels.' },
  { key: 'Dev', label: 'Dev', tone: 'Deep male', description: 'Strong cinematic tone for premium storytelling.' },
  { key: 'Mira', label: 'Mira', tone: 'Calm female', description: 'Balanced narration for polished brand videos.' },
];

export const CAPTION_STYLE_OPTIONS = ['Classic', 'Bold', 'Minimal'] as const;

export const ASPECT_OPTIONS = [
  { value: '9:16', label: 'Reels / Shorts', description: 'Vertical-first for Instagram, Shorts, and TikTok.' },
  { value: '16:9', label: 'YouTube / Landscape', description: 'Best for YouTube and presentation-style videos.' },
  { value: '1:1', label: 'Square', description: 'Balanced format for feeds and cross-platform posting.' },
] as const;

export const RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p', description: 'Faster generations for drafts and testing.' },
  { value: '1080p', label: '1080p', description: 'High quality final output for publishing.' },
] as const;

export const VIDEO_DURATION_RULES = {
  sora2: {
    defaultSeconds: 8,
    presetSeconds: [4, 8, 12],
    helperText: 'Sora 2 supports 4s, 8s, and 12s clips.',
  },
  veo3: {
    defaultSeconds: 8,
    presetSeconds: [4, 6, 8],
    seededSeconds: 8,
    helperText: 'Veo 3.1 supports 4s, 6s, and 8s clips. Image-seeded clips are fixed to 8s.',
  },
  kling3: {
    defaultSeconds: 5,
    presetSeconds: [3, 5, 8, 10],
    minSeconds: 3,
    maxSeconds: 10,
    helperText: 'Kling 3.0 supports flexible durations from 3s to 10s.',
  },
} as const;

export const FALLBACK_VIDEO_MODELS: AIVideoModel[] = [
  {
    key: 'sora2',
    label: 'Cinematic Storytelling (Sora 2)',
    description: 'Best for realistic narrative videos with synced audio.',
    frontendHint: 'Choose this for story-led videos with premium realism and motion continuity.',
    apiAdapter: 'generate_with_sora2',
  },
  {
    key: 'veo3',
    label: 'High-Quality Cinematics (Veo 3.1)',
    description: 'Best for polished videos with native audio.',
    frontendHint: 'Choose this for visually refined short-form videos with cinematic finish.',
    apiAdapter: 'generate_with_veo3',
  },
  {
    key: 'kling3',
    label: 'Stylized Rapid Drafts (Kling 3.0)',
    description: 'Best for expressive, stylized clips and fast iteration.',
    frontendHint: 'Choose this for shorter stylized videos where speed and experimentation matter.',
    apiAdapter: 'generate_with_kling3',
  },
];

export const MODEL_ICONS: Record<string, typeof Crown> = {
  sora2: Crown,
  veo3: MonitorSmartphone,
  kling3: WandSparkles,
};
