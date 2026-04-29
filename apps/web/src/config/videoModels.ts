import type { AIVideoModel } from '@/types/api';

import videoModelsConfig from '../../../../shared/config/video-models.json';

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

export function getVideoModelConfigs(): VideoModelConfig[] {
  return (videoModelsConfig.models as unknown as RawVideoModelConfig[]).map((item) => ({ ...item }));
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
