import type { CreditEstimateResponse, EstimateBreakdownItem } from '@/types/api';
import creditEngine from '@/config/creditEngine';
import { calculateImageCredits, calculateVideoCredits } from '@/lib/pricingEstimates';

const FREE_VOICE_KEYS = new Set(creditEngine.freeVoiceKeys as string[]);
const IMAGE_MODEL_ALIASES = (creditEngine.imageModelAliases ?? {}) as Record<string, string>;

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
  metadata?: Record<string, unknown>,
): CreditEstimateResponse {
  return {
    estimatedCredits,
    breakdown,
    currentCredits,
    remainingCredits: Math.max(currentCredits - estimatedCredits, 0),
    sufficient: currentCredits >= estimatedCredits,
    premium: estimatedCredits > 0,
    metadata,
  };
}

function estimateTtsPreview(payload: Record<string, unknown>, currentCredits: number): CreditEstimateResponse {
  const provider = normalizeVoiceProvider(payload);
  if (provider === 'free') {
    return buildResponse(0, [item('provider_multiplier', 0, 'Free provider')], currentCredits);
  }
  const sampleRate = normalizeSampleRate(payload);
  const voiceBase = Number(creditEngine.voice.baseCredits ?? 0);
  const providerMul = Number((creditEngine.voice.providerMultiplier as Record<string, number>)[provider] ?? 0);
  const sampleRateMul = Number((creditEngine.voice.sampleRateMultiplier as Record<string, number>)[sampleRate] ?? 1);
  const total = Math.min(Number(creditEngine.voice.maxCreditsCap ?? 20), Math.max(1, Math.ceil(voiceBase * providerMul * sampleRateMul)));
  return buildResponse(
    total,
    [
      item('base', voiceBase, 'Base voice credits'),
      item('provider_multiplier', providerMul, `${provider} provider multiplier`),
      item('sample_rate_multiplier', sampleRateMul, `${sampleRate} sample rate multiplier`),
    ],
    currentCredits,
  );
}

function estimateImageGenerate(payload: Record<string, unknown>, currentCredits: number): CreditEstimateResponse {
  const rawModelKey = String(payload.model_key ?? payload.modelKey ?? payload.model ?? '').trim();
  const modelKey = IMAGE_MODEL_ALIASES[rawModelKey] ?? rawModelKey;
  const resolution = String(payload.resolution ?? '1024').trim();
  const referenceUrls = (payload.reference_urls ?? payload.referenceUrls ?? []) as unknown;
  const hasReferences = Array.isArray(referenceUrls) && referenceUrls.length > 0;

  let total = calculateImageCredits(modelKey, resolution);
  const breakdown: EstimateBreakdownItem[] = [];
  if (total > 0) {
    breakdown.push(item('model_price', total, `${modelKey} ${resolution} pricing`));
  }

  if (hasReferences) {
    const addOn = Number(creditEngine.fixedCosts.character_consistency ?? 0);
    total += addOn;
    breakdown.push(item('character_consistency', addOn, 'Character consistency add-on'));
  }

  return buildResponse(total, breakdown, currentCredits);
}

function estimateVideoCreate(payload: Record<string, unknown>, currentCredits: number): CreditEstimateResponse {
  const modelKey = String(payload.modelKey ?? payload.selectedModel ?? payload.model ?? '').trim();
  const durationSeconds = safeInt(payload.durationSeconds, 10);
  const imageUrlsRaw = (payload.imageUrls ?? payload.image_urls ?? payload.reference_images ?? []) as unknown;
  const referenceImages = Array.isArray(imageUrlsRaw) ? imageUrlsRaw.length : 0;
  const audioSettings = (payload.audioSettings ?? {}) as { nativeAudioEnabled?: boolean };
  const estimatedCredits = calculateVideoCredits({
    modelKey,
    resolution: String(payload.resolution ?? '720p').trim(),
    durationSeconds,
    quality: String(payload.quality ?? 'standard').trim(),
    captionsEnabled: Boolean(payload.captionsEnabled ?? payload.captions_enabled ?? false),
    narrationEnabled: Boolean(payload.narrationEnabled ?? payload.narration_enabled ?? true),
    voiceKey: String(payload.voice ?? ''),
    sampleRateHz: safeInt(payload.sampleRateHz ?? undefined, 22050),
    referenceImages,
    audioMode: (payload.audioMode as 'silent' | 'auto_scene_sound' | undefined) ?? undefined,
    nativeAudioEnabled: Boolean(audioSettings.nativeAudioEnabled),
    recipeId: String(payload.recipeId ?? payload.recipe_id ?? ''),
    recipeInputs: (payload.inputs as Record<string, unknown> | undefined) ?? undefined,
    scriptText: String(payload.script ?? payload.text ?? ''),
  });

  const breakdown: EstimateBreakdownItem[] = [item('estimated_total', estimatedCredits, 'Estimated credits')];
  return buildResponse(estimatedCredits, breakdown, currentCredits, {
    audio_mode: String(payload.audioMode ?? 'silent'),
    selected_model: modelKey,
    duration_seconds: durationSeconds,
  });
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
    const total = Number(creditEngine.fixedCosts.script_enhance ?? 0) + Number(creditEngine.fixedCosts.auto_tag ?? 0);
    return buildResponse(
      total,
      [
        item('script_enhance', Number(creditEngine.fixedCosts.script_enhance ?? 0), 'Script enhance'),
        item('auto_tag', Number(creditEngine.fixedCosts.auto_tag ?? 0), 'Auto tagging'),
      ],
      currentCredits,
    );
  }
  if (action === 'influencer_reference_lock') {
    const total = Number(creditEngine.fixedCosts.influencer_reference_lock ?? 0);
    return buildResponse(total, [item('influencer_reference_lock', total, 'Character identity lock')], currentCredits);
  }
  if (action === 'influencer_content_generate') {
    const generateCost = Number(creditEngine.fixedCosts.influencer_content_generate ?? 0);
    const autoTag = Number(creditEngine.fixedCosts.auto_tag ?? 0);
    const total = generateCost + autoTag;
    return buildResponse(
      total,
      [
        item('influencer_content_generate', generateCost, 'Influencer content generation'),
        item('auto_tag', autoTag, 'Auto tagging'),
      ],
      currentCredits,
    );
  }
  if (action === 'influencer_image_generate') {
    const base = estimateImageGenerate(payload, currentCredits);
    const lockCost = Number(creditEngine.fixedCosts.character_consistency ?? 0);
    return buildResponse(
      base.estimatedCredits + lockCost,
      [...base.breakdown, item('character_consistency', lockCost, 'Character lock')],
      currentCredits,
    );
  }

  return buildResponse(0, [], currentCredits);
}
