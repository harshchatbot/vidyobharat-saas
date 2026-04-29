import creditEngine from '@/config/creditEngine';

type VideoCostInput = {
  modelKey: string;
  resolution: string;
  durationSeconds: number;
  quality: string;
  captionsEnabled?: boolean;
  narrationEnabled?: boolean;
  voiceKey?: string;
  sampleRateHz?: number;
  referenceImages?: number;
  audioMode?: 'silent' | 'auto_scene_sound';
  nativeAudioEnabled?: boolean;
  recipeId?: string;
  recipeInputs?: Record<string, unknown>;
  scriptText?: string;
};

export type OutputEstimate = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  perItemCredits: number;
  kind: 'image' | 'video';
};

export type PlanOutcomeRow = {
  plan: string;
  credits: number;
  affordable5sAds: string;
  affordable10sAds: string;
  standard5sAds: string;
  standardImages: string;
};

const FREE_VOICE_KEYS = new Set<string>((creditEngine.freeVoiceKeys ?? []) as string[]);
const IMAGE_MODEL_ALIASES = (creditEngine.imageModelAliases ?? {}) as Record<string, string>;
const VIDEO_MODEL_ALIASES = (creditEngine.videoModelAliases ?? {}) as Record<string, string>;
const IMAGE_MODEL_PRICING = (creditEngine.image.modelPricing ?? {}) as Record<string, Record<string, number>>;
const AVATAR_PRODUCT_FIXED_PRICING = (creditEngine.avatarProductFixedPricing ?? {}) as Record<string, Record<string, number>>;
const NORMAL_VIDEO_FIXED_PRICING = (creditEngine.normalVideoFixedPricing ?? {}) as Record<string, Record<string, number>>;
const VIDEO_ADD_ONS = (creditEngine.videoAddOns ?? {}) as Record<string, unknown>;

const BEST_FOR_COPY: Record<string, string> = {
  free: 'Best for testing and first outputs',
  activation: 'Best for unlocking your first real ad wins',
  starter: 'Best for solo creators making early ads',
  creator: 'Best for active creators shipping weekly content',
  growth: 'Best for teams and repeat campaign output',
  pro: 'Best for agencies and high-volume production',
};

const PLAN_OUTCOME_ROWS: Record<string, PlanOutcomeRow> = {
  free: {
    plan: 'Free',
    credits: 40,
    affordable5sAds: '0',
    affordable10sAds: '0',
    standard5sAds: '0',
    standardImages: '8–10',
  },
  activation: {
    plan: 'Activation',
    credits: 120,
    affordable5sAds: '2',
    affordable10sAds: '1',
    standard5sAds: '1',
    standardImages: '24–30',
  },
  starter: {
    plan: 'Starter',
    credits: 200,
    affordable5sAds: '4',
    affordable10sAds: '2',
    standard5sAds: '2',
    standardImages: '40–50',
  },
  creator: {
    plan: 'Creator',
    credits: 650,
    affordable5sAds: '13',
    affordable10sAds: '6',
    standard5sAds: '8',
    standardImages: '130–160',
  },
  growth: {
    plan: 'Growth',
    credits: 1400,
    affordable5sAds: '28',
    affordable10sAds: '14',
    standard5sAds: '17',
    standardImages: '280–350',
  },
  pro: {
    plan: 'Pro',
    credits: 3000,
    affordable5sAds: '61',
    affordable10sAds: '30',
    standard5sAds: '37',
    standardImages: '600–750',
  },
};

const PLAN_OUTCOME_EXAMPLES: Record<string, string[]> = {
  free: [
    'Not enough for a full Avatar Product ad',
    'About 8–10 standard images',
    'Useful for first tests and drafts',
  ],
  activation: [
    'About 2 affordable 5s ads',
    'About 1 affordable 10s ad',
    'About 24–30 standard images',
  ],
  starter: [
    'About 4 affordable 5s ads',
    'About 2 affordable 10s ads',
    'About 40–50 standard images',
  ],
  creator: [
    'About 13 affordable 5s ads',
    'About 6 affordable 10s ads',
    'About 130–160 standard images',
  ],
  growth: [
    'About 28 affordable 5s ads',
    'About 14 affordable 10s ads',
    'About 280–350 standard images',
  ],
  pro: [
    'About 61 affordable 5s ads',
    'About 30 affordable 10s ads',
    'About 600–750 standard images',
  ],
};

function normalizeVideoModelKey(modelKey: string): string {
  const normalized = String(modelKey || '').trim().toLowerCase();
  const resolved = VIDEO_MODEL_ALIASES[normalized] ?? normalized;
  if (resolved === 'ltx') return 'fal_ltx23_i2v';
  return resolved;
}

function normalizeImageModelKey(modelKey: string): string {
  const normalized = String(modelKey || '').trim().toLowerCase();
  return IMAGE_MODEL_ALIASES[normalized] ?? normalized;
}

function normalizeAvatarProductQuality(quality: string): string {
  const normalized = String(quality || '').trim().toLowerCase();
  if (normalized === 'high_quality') return 'high';
  if (normalized === 'high') return 'high';
  if (normalized === 'premium') return 'premium';
  if (normalized === 'affordable') return 'affordable';
  return 'standard';
}

function durationBucket(durationSeconds: number): '5' | '10' | '15' {
  if (durationSeconds <= 5) return '5';
  if (durationSeconds <= 10) return '10';
  return '15';
}

function getDurationAddOn(sectionKey: string, duration: '5' | '10' | '15'): number {
  const section = (VIDEO_ADD_ONS[sectionKey] ?? {}) as Record<string, number>;
  return Number(section[duration] ?? 0);
}

function getGeminiNarrationAddOn(text: string): number {
  const section = (VIDEO_ADD_ONS.geminiTtsNarration ?? {}) as Record<string, number>;
  const per1000Chars = Number(section.per1000Chars ?? 0);
  const minimum = Number(section.minimum ?? 0);
  if (per1000Chars <= 0) return 0;
  const chars = Math.max(1, String(text || '').trim().length);
  return Math.max(minimum, Math.ceil(chars / 1000) * per1000Chars);
}

export function calculateVideoCredits(input: VideoCostInput): number {
  const duration = durationBucket(Math.max(1, Number(input.durationSeconds) || 1));
  const audioMode = input.audioMode === 'auto_scene_sound' || input.nativeAudioEnabled ? 'auto_scene_sound' : 'silent';

  if (input.recipeId === 'avatar_product') {
    const recipeInputs = input.recipeInputs ?? {};
    const quality = normalizeAvatarProductQuality(
      String(recipeInputs.quality_profile ?? recipeInputs.quality ?? input.quality ?? 'standard'),
    );
    const pricing = AVATAR_PRODUCT_FIXED_PRICING[quality]?.[duration];
    return Number(pricing ?? 0);
  }

  const normalizedModel = normalizeVideoModelKey(input.modelKey);
  const base = Number(NORMAL_VIDEO_FIXED_PRICING[normalizedModel]?.[duration] ?? 0);
  if (base <= 0) return 0;

  let total = base;
  if (audioMode === 'auto_scene_sound') total += getDurationAddOn('nativeAutoSceneSound', duration);
  if ((input.referenceImages ?? 0) > 0) total += Number(VIDEO_ADD_ONS.referenceConsistency ?? 0);
  if (input.narrationEnabled && !FREE_VOICE_KEYS.has(String(input.voiceKey ?? ''))) {
    total += getGeminiNarrationAddOn(String(input.scriptText ?? ''));
  }
  total += getDurationAddOn('infraBuffer', duration);
  return total;
}

export function calculateImageCredits(modelKey: string, resolution: string): number {
  const normalizedModel = normalizeImageModelKey(modelKey);
  return Number(IMAGE_MODEL_PRICING[normalizedModel]?.[resolution] ?? 0);
}

export function getBestForCopy(planKey: string): string {
  return BEST_FOR_COPY[planKey] ?? 'Best for mixed creative workflows';
}

function midpointFromRange(value: string): number {
  const normalized = value.trim();
  if (!normalized.includes('–')) return Number(normalized) || 0;
  const [start, end] = normalized.split('–').map((part) => Number(part));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.round((start + end) / 2);
}

function rowForCredits(credits: number): PlanOutcomeRow {
  if (credits <= 40) return PLAN_OUTCOME_ROWS.free;
  if (credits <= 120) return PLAN_OUTCOME_ROWS.activation;
  if (credits <= 200) return PLAN_OUTCOME_ROWS.starter;
  if (credits <= 650) return PLAN_OUTCOME_ROWS.creator;
  if (credits <= 1400) return PLAN_OUTCOME_ROWS.growth;
  return PLAN_OUTCOME_ROWS.pro;
}

export function getPlanOutputEstimates(credits: number, limit = 4): OutputEstimate[] {
  const row = rowForCredits(credits);
  const estimates: OutputEstimate[] = [
    {
      id: 'affordable-5s-ad',
      label: 'Affordable 5s Avatar Product ads',
      shortLabel: 'Affordable 5s ads',
      count: midpointFromRange(row.affordable5sAds),
      perItemCredits: 49,
      kind: 'video',
    },
    {
      id: 'affordable-10s-ad',
      label: 'Affordable 10s Avatar Product ads',
      shortLabel: 'Affordable 10s ads',
      count: midpointFromRange(row.affordable10sAds),
      perItemCredits: 99,
      kind: 'video',
    },
    {
      id: 'standard-5s-ad',
      label: 'Standard 5s Avatar Product ads',
      shortLabel: 'Standard 5s ads',
      count: midpointFromRange(row.standard5sAds),
      perItemCredits: 79,
      kind: 'video',
    },
    {
      id: 'standard-images',
      label: 'Standard images',
      shortLabel: 'Standard images',
      count: midpointFromRange(row.standardImages),
      perItemCredits: 4,
      kind: 'image',
    },
  ];

  return estimates.filter((estimate) => estimate.count > 0).slice(0, limit);
}

export function getPlanOutcomeExamples(planKey: string): string[] {
  return PLAN_OUTCOME_EXAMPLES[planKey] ?? PLAN_OUTCOME_EXAMPLES.creator;
}

export function getPlanOutcomeRows(): PlanOutcomeRow[] {
  return [
    PLAN_OUTCOME_ROWS.free,
    PLAN_OUTCOME_ROWS.activation,
    PLAN_OUTCOME_ROWS.starter,
    PLAN_OUTCOME_ROWS.creator,
    PLAN_OUTCOME_ROWS.growth,
    PLAN_OUTCOME_ROWS.pro,
  ];
}

export function getEstimateAssumptions(): string[] {
  return [
    'Examples are approximate. Actual credits vary by model, duration, audio mode, references, and add-ons.',
  ];
}

export function describeVideoEstimate(modelKey: string, estimatedCredits: number): string | null {
  const normalized = normalizeVideoModelKey(modelKey);
  if (normalized === 'kling_o3_4k_reference' && estimatedCredits >= 249) {
    return 'Kling O3 4K is an agency-tier option. Use it only when the output value clearly justifies the spend.';
  }
  if (normalized === 'kling_o3_pro_reference' && estimatedCredits >= 149) {
    return 'Kling O3 Pro is best for higher-value outputs where consistency matters more than cost.';
  }
  if (estimatedCredits >= 99) {
    return 'This setup is best for polished final outputs rather than high-volume testing.';
  }
  return null;
}
