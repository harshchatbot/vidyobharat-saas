import creditEngine from '@/config/creditEngine';
import { getVideoModelConfigs } from '@/config/videoModels';

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
};

export type OutputEstimate = {
  id: string;
  label: string;
  shortLabel: string;
  count: number;
  perItemCredits: number;
  kind: 'image' | 'video';
};

const FREE_VOICE_KEYS = new Set<string>((creditEngine.freeVoiceKeys ?? []) as string[]);

const IMAGE_EXAMPLE_PRIORITY: Array<{ id: string; label: string; shortLabel: string; modelKey: string; resolution: string }> = [
  { id: 'gemini-flash', label: 'Gemini Flash images', shortLabel: 'Gemini Flash images', modelKey: 'gemini_flash_image', resolution: '1536' },
  { id: 'recraft-studio', label: 'Recraft Studio images', shortLabel: 'Recraft images', modelKey: 'recraft_studio', resolution: '1536' },
  { id: 'openai-image', label: 'OpenAI Image renders', shortLabel: 'OpenAI Image renders', modelKey: 'openai_image', resolution: '1536' },
];

const VIDEO_EXAMPLE_PRIORITY: Array<{ id: string; label: string; shortLabel: string; modelKey: string; resolution: string; durationSeconds: number; quality: string }> = [
  { id: 'fal-ltx-clips', label: 'Fal LTX 2.3 I2V test clips', shortLabel: 'Fal LTX test clips', modelKey: 'fal_ltx23_i2v', resolution: '720p', durationSeconds: 4, quality: 'standard' },
  { id: 'sora-clips', label: 'Sora 2 premium clips', shortLabel: 'Sora 2 clips', modelKey: 'sora2', resolution: '720p', durationSeconds: 4, quality: 'standard' },
];

const EXAMPLE_ORDER = ['gemini-flash', 'fal-ltx-clips', 'sora-clips', 'recraft-studio', 'openai-image'] as const;

const BEST_FOR_COPY: Record<string, string> = {
  free: 'Best for testing workflows',
  starter: 'Best for images and fast draft videos',
  creator: 'Best for active creators mixing images and premium video',
  growth: 'Best for growing teams and repeat campaigns',
  pro: 'Best for production-heavy premium output',
};

function normalizeVideoModelKey(modelKey: string): string {
  const aliases = (creditEngine.videoModelAliases ?? {}) as Record<string, string>;
  return aliases[String(modelKey).toLowerCase()] ?? 'fal_ltx23_i2v';
}

function normalizeImageModelKey(modelKey: string): string {
  const aliases = (creditEngine.imageModelAliases ?? {}) as Record<string, string>;
  return aliases[String(modelKey).toLowerCase()] ?? String(modelKey).toLowerCase();
}

export function calculateVideoCredits(input: VideoCostInput): number {
  const normalizedModel = normalizeVideoModelKey(input.modelKey);
  const modelMultiplier = Number((creditEngine.video.modelMultiplier as Record<string, number>)[normalizedModel] ?? 0);
  const resolutionMultiplier = Number((creditEngine.video.resolutionMultiplier as Record<string, number>)[input.resolution] ?? 1);
  const qualityMultiplier = Number((creditEngine.video.qualityMultiplier as Record<string, number>)[input.quality] ?? 1);
  const baseCredits = Number(creditEngine.video.baseCredits ?? 0);
  const baseDuration = Number(creditEngine.video.baseDuration ?? 15);
  const duration = Math.max(1, Number(input.durationSeconds) || 1);
  const baseRaw = baseCredits * modelMultiplier * resolutionMultiplier * (duration / Math.max(baseDuration, 1)) * qualityMultiplier;

  let total = Math.max(1, Math.ceil(baseRaw));

  if (input.narrationEnabled) {
    const voiceKey = String(input.voiceKey ?? '');
    const provider = FREE_VOICE_KEYS.has(voiceKey) ? 'free' : 'sarvam';
    if (provider !== 'free') {
      const voiceBase = Number(creditEngine.voice.baseCredits ?? 0);
      const providerMul = Number((creditEngine.voice.providerMultiplier as Record<string, number>)[provider] ?? 0);
      const sampleRateKey = Number(input.sampleRateHz ?? 22050) >= 48000 ? '48000' : '22050';
      const sampleRateMul = Number((creditEngine.voice.sampleRateMultiplier as Record<string, number>)[sampleRateKey] ?? 1);
      total += Math.max(1, Math.ceil(voiceBase * providerMul * sampleRateMul));
    }
  }

  if (input.captionsEnabled) total += Number(creditEngine.fixedCosts.auto_caption ?? 0);
  if ((input.referenceImages ?? 0) > 0) total += Number(creditEngine.fixedCosts.character_consistency ?? 0);
  total += Number(creditEngine.fixedCosts.auto_tag ?? 0);

  return Math.max(0, Math.ceil(total));
}

export function calculateImageCredits(modelKey: string, resolution: string): number {
  const normalizedModel = normalizeImageModelKey(modelKey);
  const modelPricing = (creditEngine.image.modelPricing as Record<string, Record<string, number>>)[normalizedModel];
  if (!modelPricing) return 0;
  return Number(modelPricing[resolution] ?? 0);
}

export function getBestForCopy(planKey: string): string {
  return BEST_FOR_COPY[planKey] ?? 'Best for mixed creative workflows';
}

function getEnabledVideoExampleConfigs() {
  const enabledModels = new Set(
    getVideoModelConfigs()
      .filter((model) => model.enabled !== false)
      .map((model) => model.key.toLowerCase()),
  );

  return VIDEO_EXAMPLE_PRIORITY.filter((item) => enabledModels.has(item.modelKey.toLowerCase()));
}

export function getPlanOutputEstimates(credits: number, limit = 4): OutputEstimate[] {
  const estimatesById = new Map<string, OutputEstimate>();

  for (const item of IMAGE_EXAMPLE_PRIORITY) {
    const perItemCredits = calculateImageCredits(item.modelKey, item.resolution);
    if (perItemCredits <= 0) continue;
    const count = Math.floor(credits / perItemCredits);
    if (count <= 0) continue;
    estimatesById.set(item.id, {
      id: item.id,
      label: item.label,
      shortLabel: item.shortLabel,
      count,
      perItemCredits,
      kind: 'image',
    });
  }

  for (const item of getEnabledVideoExampleConfigs()) {
    const perItemCredits = calculateVideoCredits({
      modelKey: item.modelKey,
      resolution: item.resolution,
      durationSeconds: item.durationSeconds,
      quality: item.quality,
      captionsEnabled: false,
      narrationEnabled: false,
      referenceImages: 0,
    });
    if (perItemCredits <= 0) continue;
    const count = Math.floor(credits / perItemCredits);
    if (count <= 0) continue;
    estimatesById.set(item.id, {
      id: item.id,
      label: item.label,
      shortLabel: item.shortLabel,
      count,
      perItemCredits,
      kind: 'video',
    });
  }

  return EXAMPLE_ORDER
    .map((id) => estimatesById.get(id))
    .filter((item): item is OutputEstimate => Boolean(item))
    .slice(0, limit);
}

export function getEstimateAssumptions(): string[] {
  const assumptions = ['Gemini Flash images use 1536 resolution.'];

  const enabledVideoIds = new Set(getEnabledVideoExampleConfigs().map((item) => item.id));
  if (enabledVideoIds.has('fal-ltx-clips')) assumptions.push('Fal LTX 2.3 I2V examples use 720p, 4s, standard, free voice, captions off.');
  if (enabledVideoIds.has('sora-clips')) assumptions.push('Sora examples use 720p, 4s, standard.');
  assumptions.push('Voice, captions, reference images, and higher resolution increase credit usage.');

  return assumptions;
}

export function describeVideoEstimate(modelKey: string, estimatedCredits: number): string | null {
  const normalized = normalizeVideoModelKey(modelKey);
  if (normalized === 'sora2') {
    if (estimatedCredits >= 80) {
      return 'Sora 2 is a premium model. This setup can use a large share of Starter plan credits.';
    }
    if (estimatedCredits >= 50) {
      return 'Sora 2 is a premium model. Starter is best for a few polished clips, not high-volume output.';
    }
  }

  if (estimatedCredits >= 120) {
    return 'Premium-heavy setup. Consider Fal LTX 2.3 I2V or a shorter duration for faster draft generation.';
  }
  if (estimatedCredits >= 80) {
    return 'This setup uses a large share of Starter plan credits.';
  }
  if (estimatedCredits >= 50) {
    return 'Premium setup. Best for polished hero clips rather than high-volume drafts.';
  }

  return null;
}
