import type { AIVideoModel } from '@/types/api';

import videoModelsConfig from '../../../../shared/config/video-models.json';

type RawNormalVideoFamilyConfig = {
  key: string;
  modelFamily: string;
  displayName: string;
  tags: string[];
  description: string;
  supportsTextToVideo: boolean;
  supportsImageToVideo: boolean;
  supportsNativeAudio: boolean;
  nativeAudioDefault: boolean;
  nativeAudioNotes: string;
  supportedDurations: number[];
  supportedQualities: Array<{ key: string; label: string; resolution: string }>;
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  requiredInputsByGenerationMode: Record<string, string[]>;
  providerRoutesByGenerationModeAndQuality: Record<string, Record<string, string>>;
  payloadMapping: Record<string, unknown>;
  pricingType: string;
  pricingConfig: Record<string, unknown>;
  hidden?: boolean;
  devOnly?: boolean;
};

type RawVideoModelConfig = {
  key: string;
  lane: string;
  label: string;
  fullLabel: string;
  description: string;
  frontendHint: string;
  apiAdapter: string;
  tier: string;
  enabled: boolean;
  featured: boolean;
  featureGate: string | null;
  qualityBadge: string;
  speedBadge: string;
  creditBadge: string;
  resolutionLabels: string[];
  supportsNativeAudio?: boolean;
  supportedResolutions: string[];
  supportedAspectRatios: string[];
  sizes: Record<string, Record<string, string>>;
  durationPresets: number[];
  defaultDurationSeconds: number;
  seededDurationSeconds?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  durationHelperText: string;
};

export type VideoModelConfig = RawVideoModelConfig;
export type NormalVideoFamilyConfig = RawNormalVideoFamilyConfig;

export function getVideoModelConfigs(): VideoModelConfig[] {
  return (videoModelsConfig.models as unknown as RawVideoModelConfig[]).map((item) => ({ ...item }));
}

export function getNormalVideoFamilyConfigs(): NormalVideoFamilyConfig[] {
  return (videoModelsConfig.normalVideoFamilies as unknown as RawNormalVideoFamilyConfig[]).map((item) => ({ ...item }));
}

export function getNormalVideoFamilyMap(): Record<string, NormalVideoFamilyConfig> {
  return Object.fromEntries(getNormalVideoFamilyConfigs().map((family) => [family.key, family]));
}

export function getVideoModelMap(): Record<string, VideoModelConfig> {
  return Object.fromEntries(getVideoModelConfigs().map((model) => [model.key, model]));
}

export function buildVideoModelsForApiFallback(): AIVideoModel[] {
  return getVideoModelConfigs().map((model) => ({
    key: model.key,
    label: model.fullLabel,
    description: model.description,
    frontendHint: model.frontendHint,
    apiAdapter: model.apiAdapter,
    shortLabel: model.label,
    tier: model.tier,
    enabled: model.enabled,
    featured: model.featured,
    featureGate: model.featureGate,
    qualityBadge: model.qualityBadge,
    speedBadge: model.speedBadge,
    creditBadge: model.creditBadge,
    resolutionLabels: model.resolutionLabels,
    supportsNativeAudio: model.supportsNativeAudio ?? false,
  }));
}
