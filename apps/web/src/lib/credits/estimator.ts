import type { CreditEstimateResponse, EstimateBreakdownItem } from '@/types/api';

const VIDEO_MULTIPLIERS = {
  baseDuration: 15,
  baseCredits: 10,
  model: {
    kling: 1.0,
    veo: 1.3,
    sora: 1.8,
  },
  resolution: {
    '720p': 1.0,
    '1080p': 1.4,
  },
  quality: {
    standard: 1.0,
    high: 1.3,
  },
  cap: 150,
} as const;

const IMAGE_MULTIPLIERS = {
  baseCredits: 2,
  resolution: {
    '512': 1.0,
    '1024': 1.5,
    '1536': 1.75,
    '2048': 2.0,
  },
  model: {
    standard: 1.0,
    premium: 2.0,
  },
  cap: 50,
} as const;

const VOICE_MULTIPLIERS = {
  baseCredits: 1,
  provider: {
    free: 0.0,
    sarvam: 2.0,
    elevenlabs: 3.0,
  },
  sampleRate: {
    '22050': 1.0,
    '48000': 1.4,
  },
  cap: 20,
} as const;

const CREDIT_COSTS = {
  premium_voice: 3,
  premium_voice_preview: 1,
  voice_retry: 2,
  premium_image: 3,
  image_upscale: 1,
  premium_video_720p_15s: 12,
  premium_video_1080p_15s: 18,
  character_consistency: 5,
  influencer_reference_lock: 8,
  influencer_content_generate: 2,
  script_enhance: 1,
  auto_caption: 1,
  auto_tag: 1,
  audio_quality_48khz_modifier: 1,
} as const;

const FREE_VOICE_KEYS = new Set(['Aarav', 'Mira', 'Dev', 'Shubh', 'Priya']);
const FREE_IMAGE_MODELS = new Set(['nano_banana']);
const FREE_IMAGE_RESOLUTIONS = new Set(['1024']);

const VIDEO_MODEL_ALIASES: Record<string, 'sora' | 'veo' | 'kling'> = {
  sora2: 'sora',
  sora: 'sora',
  veo3: 'veo',
  veo: 'veo',
  kling3: 'kling',
  kling: 'kling',
};

const IMAGE_MODEL_TIERS: Record<string, 'standard' | 'premium'> = {
  nano_banana: 'standard',
  openai_image: 'premium',
  seedream: 'premium',
  flux_spark: 'premium',
  recraft_studio: 'premium',
};

function item(component: string, value: number, label?: string): EstimateBreakdownItem {
  return { component, value, label };
}

function safeInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

function normalizeVoiceProvider(payload: Record<string, unknown>): 'free' | 'sarvam' | 'elevenlabs' {
  const provided = String(payload.provider ?? '').trim().toLowerCase();
  if (provided === 'free' || provided === 'fallback tts') return 'free';
  if (provided === 'sarvam' || provided === 'sarvam ai') return 'sarvam';
  if (provided === 'elevenlabs') return 'elevenlabs';
  const voice = String(payload.voice ?? '').trim();
  return FREE_VOICE_KEYS.has(voice) ? 'free' : 'sarvam';
}

function normalizeSampleRate(payload: Record<string, unknown>): '22050' | '48000' {
  const direct = safeInt(payload.sampleRateHz ?? payload.sample_rate_hz, 22050);
  const nestedRaw = payload.audioSettings as { sampleRateHz?: unknown } | undefined;
  const nested = safeInt(nestedRaw?.sampleRateHz, direct);
  if (nested >= 48000) return '48000';
  return '22050';
}

function buildResponse(
  estimatedCredits: number,
  breakdown: EstimateBreakdownItem[],
  currentCredits: number,
): CreditEstimateResponse {
  return {
    estimatedCredits,
    breakdown,
    currentCredits,
    remainingCredits: Math.max(currentCredits - estimatedCredits, 0),
    sufficient: currentCredits >= estimatedCredits,
    premium: estimatedCredits > 0,
  };
}

function estimateTtsPreview(payload: Record<string, unknown>, currentCredits: number): CreditEstimateResponse {
  const provider = normalizeVoiceProvider(payload);
  if (provider === 'free') {
    return buildResponse(0, [item('provider_multiplier', 0, 'Free provider')], currentCredits);
  }
  const sampleRate = normalizeSampleRate(payload);
  const raw =
    VOICE_MULTIPLIERS.baseCredits *
    VOICE_MULTIPLIERS.provider[provider] *
    VOICE_MULTIPLIERS.sampleRate[sampleRate];
  const total = Math.min(VOICE_MULTIPLIERS.cap, Math.max(1, Math.ceil(raw)));
  return buildResponse(
    total,
    [
      item('base', VOICE_MULTIPLIERS.baseCredits, 'Base voice credits'),
      item('provider_multiplier', VOICE_MULTIPLIERS.provider[provider], `${provider} provider multiplier`),
      item('sample_rate_multiplier', VOICE_MULTIPLIERS.sampleRate[sampleRate], `${sampleRate} sample rate multiplier`),
    ],
    currentCredits,
  );
}

function estimateImageGenerate(payload: Record<string, unknown>, currentCredits: number): CreditEstimateResponse {
  const modelKey = String(payload.model_key ?? payload.modelKey ?? payload.model ?? '').trim();
  const resolution = String(payload.resolution ?? '1024').trim();
  const referenceUrls = (payload.reference_urls ?? payload.referenceUrls ?? []) as unknown;
  const hasReferences = Array.isArray(referenceUrls) && referenceUrls.length > 0;

  let total = 0;
  const breakdown: EstimateBreakdownItem[] = [];

  if (!(FREE_IMAGE_MODELS.has(modelKey) && FREE_IMAGE_RESOLUTIONS.has(resolution))) {
    const modelTier = IMAGE_MODEL_TIERS[modelKey] ?? 'premium';
    const resolutionMultiplier =
      IMAGE_MULTIPLIERS.resolution[resolution as keyof typeof IMAGE_MULTIPLIERS.resolution] ??
      IMAGE_MULTIPLIERS.resolution['1024'];
    const modelMultiplier = IMAGE_MULTIPLIERS.model[modelTier];
    const dynamic = Math.min(
      IMAGE_MULTIPLIERS.cap,
      Math.max(1, Math.ceil(IMAGE_MULTIPLIERS.baseCredits * resolutionMultiplier * modelMultiplier)),
    );
    total += dynamic;
    breakdown.push(item('base', IMAGE_MULTIPLIERS.baseCredits, 'Base image credits'));
    breakdown.push(item('resolution_multiplier', resolutionMultiplier, `${resolution} resolution multiplier`));
    breakdown.push(item('model_multiplier', modelMultiplier, `${modelTier} model multiplier`));
  }

  if (hasReferences) {
    total += CREDIT_COSTS.character_consistency;
    breakdown.push(item('character_consistency', CREDIT_COSTS.character_consistency, 'Character consistency add-on'));
  }

  return buildResponse(total, breakdown, currentCredits);
}

function estimateVideoCreate(payload: Record<string, unknown>, currentCredits: number): CreditEstimateResponse {
  const modelKey = String(payload.modelKey ?? payload.selectedModel ?? payload.model ?? '').trim().toLowerCase();
  const model = VIDEO_MODEL_ALIASES[modelKey] ?? 'sora';
  const resolution = String(payload.resolution ?? '720p').trim() as '720p' | '1080p';
  const quality = String(payload.quality ?? 'standard').trim().toLowerCase() as 'standard' | 'high';
  const durationSeconds = safeInt(payload.durationSeconds, VIDEO_MULTIPLIERS.baseDuration);
  const captionsEnabled = Boolean(
    payload.captionsEnabled !== undefined ? payload.captionsEnabled : payload.captions_enabled,
  );
  const imageUrlsRaw = (payload.imageUrls ?? payload.image_urls ?? payload.reference_images ?? []) as unknown;
  const hasReferences = Array.isArray(imageUrlsRaw) && imageUrlsRaw.length > 0;

  const videoBaseRaw =
    VIDEO_MULTIPLIERS.baseCredits *
    VIDEO_MULTIPLIERS.model[model] *
    (VIDEO_MULTIPLIERS.resolution[resolution] ?? VIDEO_MULTIPLIERS.resolution['720p']) *
    Math.max(durationSeconds, 1) /
    VIDEO_MULTIPLIERS.baseDuration *
    (VIDEO_MULTIPLIERS.quality[quality] ?? VIDEO_MULTIPLIERS.quality.standard);
  const videoBase = Math.min(VIDEO_MULTIPLIERS.cap, Math.max(1, Math.ceil(videoBaseRaw)));

  const breakdown: EstimateBreakdownItem[] = [
    item('base', VIDEO_MULTIPLIERS.baseCredits, 'Base video credits'),
    item('model_multiplier', VIDEO_MULTIPLIERS.model[model], `${model} model multiplier`),
    item('resolution_multiplier', VIDEO_MULTIPLIERS.resolution[resolution] ?? 1, `${resolution} resolution multiplier`),
    item('duration_factor', Math.max(durationSeconds, 1) / VIDEO_MULTIPLIERS.baseDuration, 'Duration factor'),
    item('quality_multiplier', VIDEO_MULTIPLIERS.quality[quality] ?? 1, `${quality} quality multiplier`),
  ];

  const voiceEstimate = estimateTtsPreview(payload, currentCredits);
  let total = videoBase + voiceEstimate.estimatedCredits;
  breakdown.push(...voiceEstimate.breakdown);

  if (captionsEnabled) {
    total += CREDIT_COSTS.auto_caption;
    breakdown.push(item('auto_caption', CREDIT_COSTS.auto_caption, 'Auto captions'));
  }
  if (hasReferences) {
    total += CREDIT_COSTS.character_consistency;
    breakdown.push(item('character_consistency', CREDIT_COSTS.character_consistency, 'Character consistency add-on'));
  }
  total += CREDIT_COSTS.auto_tag;
  breakdown.push(item('auto_tag', CREDIT_COSTS.auto_tag, 'Auto tagging'));

  return buildResponse(total, breakdown, currentCredits);
}

export function estimateCreditsLocal(
  action: string,
  payload: Record<string, unknown>,
  currentCredits: number,
): CreditEstimateResponse {
  if (action === 'tts_preview') return estimateTtsPreview(payload, currentCredits);
  if (action === 'image_generate') return estimateImageGenerate(payload, currentCredits);
  if (action === 'video_create') return estimateVideoCreate(payload, currentCredits);
  if (action === 'script_generate') return buildResponse(0, [], currentCredits);
  if (action === 'script_enhance') {
    const total = CREDIT_COSTS.script_enhance + CREDIT_COSTS.auto_tag;
    return buildResponse(
      total,
      [
        item('script_enhance', CREDIT_COSTS.script_enhance, 'Script enhance'),
        item('auto_tag', CREDIT_COSTS.auto_tag, 'Auto tagging'),
      ],
      currentCredits,
    );
  }
  if (action === 'influencer_reference_lock') {
    return buildResponse(
      CREDIT_COSTS.influencer_reference_lock,
      [item('influencer_reference_lock', CREDIT_COSTS.influencer_reference_lock, 'Character identity lock')],
      currentCredits,
    );
  }
  if (action === 'influencer_content_generate') {
    const total = CREDIT_COSTS.influencer_content_generate + CREDIT_COSTS.auto_tag;
    return buildResponse(
      total,
      [
        item('influencer_content_generate', CREDIT_COSTS.influencer_content_generate, 'Influencer content generation'),
        item('auto_tag', CREDIT_COSTS.auto_tag, 'Auto tagging'),
      ],
      currentCredits,
    );
  }
  if (action === 'influencer_image_generate') {
    const base = estimateImageGenerate(payload, currentCredits);
    const total = base.estimatedCredits + CREDIT_COSTS.character_consistency;
    return buildResponse(
      total,
      [...base.breakdown, item('character_consistency', CREDIT_COSTS.character_consistency, 'Character lock')],
      currentCredits,
    );
  }

  return buildResponse(0, [], currentCredits);
}
