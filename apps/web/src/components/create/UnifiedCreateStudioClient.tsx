'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Box,
  Check,
  ChevronDown,
  LayoutTemplate,
  Lock,
  Play,
  Plus,
  RectangleHorizontal,
  Sparkles,
  Upload,
  UserRound,
  Video,
  Wand2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ImageDetailModal } from '@/components/ui/ImageDetailModal';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { buildVideoModelsForApiFallback, getVideoModelMap } from '@/config/videoModels';
import creditEngine from '@/config/creditEngine';
import { TEMPLATE_OPTIONS } from '@/components/videos/create/constants';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type {
  AIVideoModel,
  Avatar,
  AvatarProductAssistResponse,
  AvatarLibraryResponse,
  GeneratedImage,
  ImageModel,
  InspirationImage,
  RecipeCatalog,
  TTSLanguageOption,
  TTSVoiceOption,
  VideoCreateRequest,
} from '@/types/api';

import CreateCustomAvatarModal from '@/components/avatars/CreateCustomAvatarModal';

type ComposerMode = 'image' | 'video';
type ResolvedMode = 'image' | 'video';
type QualityProfile = 'fast_social' | 'creator_quality' | 'creator_pro' | 'premium';
type RecipeTab = 'all' | 'ads' | 'explainer' | 'inspiration_photos';
type OpenMenu = 'assets' | 'model' | 'aspect' | 'more' | null;
type RecentEntryKind = 'recipe' | 'draft';
type RecipeSlotKind = 'text' | 'upload' | 'avatar' | 'select' | 'reference-image';
type RecipeSourceKind = 'recipe';
type VideoIntent = 'explainer' | 'cinematic' | 'quick_reel' | 'generic';

const CHITRAKALA_PERSONA_ID = process.env.NEXT_PUBLIC_CHITRAKALA_PERSONA_ID ?? 'av-chitrakala';
const CHITRAKALA_NAME = process.env.NEXT_PUBLIC_CHITRAKALA_AVATAR_NAME ?? 'Chitrakala';
const CHITRAKALA_IMAGE_URL = process.env.NEXT_PUBLIC_CHITRAKALA_AVATAR_IMAGE_URL ?? '';
const CHITRAKALA_PREVIEW_VIDEO_URL = process.env.NEXT_PUBLIC_CHITRAKALA_AVATAR_PREVIEW_VIDEO_URL ?? '';

type RecipeComposerFragment =
  | { type: 'text'; value: string }
  | { type: 'slot'; slotId: string };

type RecipeComposerSlot = {
  id: string;
  kind: RecipeSlotKind;
  label: string;
  placeholder: string;
  required?: boolean;
  options?: string[];
  sampleLabel?: string;
  samplePreviewUrl?: string | null;
  submitTarget?: 'image' | 'text' | string;
};

type RecipeComposerConfig = {
  recipeId: string;
  recipeLabel: string;
  sourceKind: RecipeSourceKind;
  mode: ComposerMode;
  fragments: RecipeComposerFragment[];
  slots: RecipeComposerSlot[];
};

type RecipeComposerState = RecipeComposerConfig & {
  values: Record<string, string>;
};

type VideoLaunchState = {
  idea: string;
  templateKey: string;
  script: string;
  initialLane: 'creator_pro' | 'premium';
  initialModelKey: string;
  initialAspectRatio: '9:16' | '16:9' | '1:1';
  initialResolution: '720p' | '1080p';
  initialDurationSeconds: '5' | '10';
  initialCaptionsEnabled: boolean;
  initialNarrationEnabled: boolean;
};

type RecipeCard = {
  id: string;
  title: string;
  description: string;
  contentType: 'video';
  tab: RecipeTab;
  trending: boolean;
  aspectRatio: string;
  previewUrl: string;
  previewVideoUrl: string | null;
  credits: number | null;
  badge: string | null;
  helper: string | null;
  recipe: RecipeCatalog;
};

type InspirationPhotoCard = {
  id: string;
  title: string;
  prompt: string;
  aspectRatio: string;
  previewUrl: string;
  creatorName: string;
  modelKey: string;
  createdAt: string;
  badge: string | null;
  raw: InspirationImage;
};

type RecentEntry = {
  id: string;
  kind: RecentEntryKind;
  title: string;
  prompt: string;
  mode: ResolvedMode;
  aspectRatio: '9:16' | '16:9' | '1:1';
  qualityProfile: QualityProfile;
  createdAt: number;
  recipeId?: string | null;
};

type SlotAssetState = {
  label: string;
  previewUrl: string | null;
  assetUrl: string | null;
  source: 'upload' | 'sample' | 'avatar' | 'ai-generate';
};

type AvatarSelection = {
  personaId: string;
  name: string;
  imageUrl?: string;
  source: 'preset' | 'saved';
  sourceLabel: 'Preset' | 'Saved';
  isCustomAvatar?: boolean;
  genderPresentation?: string | null;
  preferredVoice?: string | null;
  preferredLanguage?: string | null;
  languageTags?: string[];
  styleLabel?: string | null;
  languageInfo?: string | null;
  voiceInfo?: string | null;
  previewVideoUrl?: string | null;
  description?: string | null;
};

function buildChitrakalaAvatarSelection(): AvatarSelection {
  return {
    personaId: CHITRAKALA_PERSONA_ID,
    name: CHITRAKALA_NAME,
    imageUrl: CHITRAKALA_IMAGE_URL || undefined,
    source: 'preset',
    sourceLabel: 'Preset',
    isCustomAvatar: false,
    genderPresentation: 'female',
    preferredLanguage: 'en-IN',
    preferredVoice: 'Priya',
    languageTags: ['en-IN'],
    styleLabel: 'Fixed spokesperson',
    languageInfo: 'English (India)',
    voiceInfo: 'Priya voice selected',
    previewVideoUrl: CHITRAKALA_PREVIEW_VIDEO_URL || null,
    description: `${CHITRAKALA_NAME} is the fixed spokesperson for this V1 avatar product workflow.`,
  };
}

type AssetPickerState = {
  slotId: string;
  slotLabel: string;
  sampleLabel?: string;
  samplePreviewUrl?: string | null;
  left: number;
  top: number;
};

type AvatarProductAdvancedControls = {
  campaign_objective: string;
  platform: string;
  duration_seconds: string;
  brand_tone: string;
  cta_preference: string;
  language: string;
  must_show_elements: string;
  must_avoid_elements: string;
  compliance_notes: string;
  claims_to_avoid: string;
  offer_text: string;
  tagline: string;
  voice_style: string;
  music_vibe: string;
  script_mode: 'auto_generate' | 'improve_draft' | 'use_exact_script';
  provided_script: string;
  strict_script_lock: boolean;
};

type ActiveRecipeSource =
  | { kind: 'recipe'; recipe: RecipeCard }
  | null;

const MODE_OPTIONS: Array<{ key: ComposerMode; label: string; icon: typeof Wand2 }> = [
  { key: 'image', label: 'Image', icon: Sparkles },
  { key: 'video', label: 'Video', icon: Video },
];

const QUALITY_PROFILES: Array<{ key: QualityProfile; label: string; helper: string }> = [
  { key: 'fast_social', label: 'Fast Social', helper: 'Best for quick image concepts and fast iterations' },
  { key: 'creator_quality', label: 'Creator Quality', helper: 'More polished image output for standout posts' },
  { key: 'creator_pro', label: 'Standard', helper: 'Balanced video quality for faster creator-first iterations' },
  { key: 'premium', label: 'High Quality', helper: 'Higher-end visual output for important hero content' },
];

const VIDEO_MODEL_FALLBACK = buildVideoModelsForApiFallback();
const VIDEO_MODEL_MAP = getVideoModelMap();
const IMAGE_MODEL_FALLBACK: ImageModel[] = [
  {
    key: 'budget_image_model',
    label: 'Fast Social Images',
    description: 'Budget-friendly image generation for quick social content and rapid iteration.',
    frontend_hint: 'Primary fast lane for fast drafts and social-first visuals.',
    provider: 'Together',
    badge: 'Affordable',
    logo_label: 'T',
    canonical_model_key: 'budget_image_model',
  },
  {
    key: 'gpt_image_1_5',
    label: 'GPT Image 1.5',
    description: 'Premium realistic image generation with stronger prompt fidelity.',
    frontend_hint: 'Best for polished brand visuals, ads, and premium realism.',
    provider: 'OpenAI',
    badge: 'Premium',
    logo_label: 'O',
    canonical_model_key: 'gpt_image_1_5',
  },
  {
    key: 'recraft',
    label: 'Recraft',
    description: 'Design-focused image generation for posters, carousels, and structured graphics.',
    frontend_hint: 'Best for graphic-style outputs and brand layouts.',
    provider: 'Recraft',
    badge: 'Design',
    logo_label: 'R',
    canonical_model_key: 'recraft',
  },
  {
    key: 'gemini_flash_image',
    label: 'Gemini 3.1 Flash Image',
    description: 'Fast, affordable image generation for high-volume creative work.',
    frontend_hint: 'Best for quick image concepts and social testing.',
    provider: 'Google',
    badge: 'Fast',
    logo_label: 'G',
    canonical_model_key: 'gemini_flash_image',
  },
];

const ASPECT_OPTIONS: Array<'9:16' | '16:9' | '1:1'> = ['9:16', '16:9', '1:1'];
const RECENT_STORAGE_KEY = 'rangmanch:create-hub:recent:v1';
const DEFAULT_AVATAR_PRODUCT_ADVANCED_CONTROLS: AvatarProductAdvancedControls = {
  campaign_objective: '',
  platform: 'Instagram Reels',
  duration_seconds: '15',
  brand_tone: 'creator_casual',
  cta_preference: '',
  language: 'English',
  must_show_elements: '',
  must_avoid_elements: '',
  compliance_notes: '',
  claims_to_avoid: '',
  offer_text: '',
  tagline: '',
  voice_style: '',
  music_vibe: '',
  script_mode: 'auto_generate',
  provided_script: '',
  strict_script_lock: false,
};
const RECIPE_TABS: Array<{ key: RecipeTab; label: string; icon?: typeof LayoutTemplate }> = [
  { key: 'all', label: 'All' },
  { key: 'ads', label: 'Ads' },
  { key: 'explainer', label: 'Explainer' },
  { key: 'inspiration_photos', label: 'Inspiration photos' },
];

const GENERIC_VIDEO_RECIPE: Omit<RecipeComposerConfig, 'recipeId' | 'recipeLabel'> = {
  sourceKind: 'recipe',
  mode: 'video',
  fragments: [
    { type: 'text', value: 'Create a ' },
    { type: 'slot', slotId: 'topic' },
    { type: 'text', value: ' as a ' },
    { type: 'slot', slotId: 'format' },
    { type: 'text', value: ' for ' },
    { type: 'slot', slotId: 'platform' },
  ],
  slots: [
    { id: 'topic', kind: 'text', label: 'Topic', placeholder: 'product launch, founder story, festival recap', required: true },
    { id: 'format', kind: 'select', label: 'Format', placeholder: 'story reel', required: true, options: ['story reel', 'product ad', 'talking explainer', 'offer promo'] },
    { id: 'platform', kind: 'select', label: 'Platform', placeholder: 'Instagram Reels', options: ['Instagram Reels', 'YouTube Shorts', 'LinkedIn', 'TikTok'] },
  ],
};

function toAbsoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('/videos/') || url.startsWith('/illustrations/') || url.startsWith('/brand/') || url.startsWith('/favicon')) return url;
  return `${API_URL}${url}`;
}

function aspectRatioToCss(value: string | null | undefined) {
  if (!value) return '9 / 16';
  const normalized = value.replace(/\s+/g, '');
  const separator = normalized.includes(':') ? ':' : normalized.includes('/') ? '/' : null;
  if (!separator) return '9 / 16';
  const [w, h] = normalized.split(separator);
  const width = Number(w);
  const height = Number(h);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return '9 / 16';
  return `${width} / ${height}`;
}

function resolveComposerMode(mode: ComposerMode, recipeType?: 'image' | 'video' | null): ResolvedMode {
  if (recipeType === 'image') return 'image';
  if (recipeType === 'video') return 'video';
  return mode;
}

function pickVideoTemplateKey(idea: string) {
  const value = idea.toLowerCase();
  if (/\b(explainer|explain|how|why|teach|education|historical|history)\b/.test(value)) return 'explainer-video';
  if (/\b(ad|product|promo|brand|launch|sell|offer|listing|real estate)\b/.test(value)) return 'product';
  if (/\b(character|myth|persona|hero|avatar)\b/.test(value)) return 'character-vlog';
  if (/\b(story|journey|before|after|top 5|list|struggling creator)\b/.test(value)) return 'storyboard';
  return 'storyboard';
}

function detectVideoIntent(prompt: string): VideoIntent {
  const value = prompt.toLowerCase().trim();
  if (
    /\b(explain|what if|tell me about|how does|why does|educational|narrated reel|fact reel|science of|history of)\b/.test(value)
  ) {
    return 'explainer';
  }
  if (/\b(cinematic|trailer|teaser|moody|luxury|hero film|film look|dramatic)\b/.test(value)) {
    return 'cinematic';
  }
  if (/\b(quick reel|fast reel|3 quick scenes|snappy|montage|social-ready|hook)\b/.test(value)) {
    return 'quick_reel';
  }
  return 'generic';
}

function shouldAutoUseExplainerRecipe(
  intent: VideoIntent,
  mode: ResolvedMode,
  activeRecipeSource: ActiveRecipeSource,
) {
  if (mode !== 'video') return false;
  if (activeRecipeSource?.kind === 'recipe') return false;
  return intent === 'explainer';
}

function pickExplainerRecipeId(prompt: string) {
  return 'deep_dive_explainer';
}

function buildVideoCreatePayload(input: {
  type: 'recipe';
  recipeId: string;
  prompt: string;
  aspectRatio?: '9:16' | '16:9' | '1:1';
  language: string;
  voice: string;
  captionsEnabled: boolean;
  narrationEnabled: boolean;
  personaId?: string;
  useAvatarForTalkingScenes?: boolean;
} | {
  type: 'freeform';
  templateLabel: string;
  script: string;
  modelKey: string;
  lane: 'creator_pro' | 'premium';
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution: '720p' | '1080p';
  quality: 'standard' | 'high';
  durationSeconds: number;
  captionsEnabled: boolean;
  narrationEnabled: boolean;
  language: string;
  voice: string;
  imageUrl?: string | null;
}): VideoCreateRequest {
  if (input.type === 'recipe') {
    return {
      recipeId: input.recipeId,
      inputs: {
        text: input.prompt,
      },
      aspectRatio: input.aspectRatio,
      language: input.language,
      voice: input.voice,
      captionsEnabled: input.captionsEnabled,
      narrationEnabled: input.narrationEnabled,
      personaId: input.personaId,
      useAvatarForTalkingScenes: input.useAvatarForTalkingScenes,
    };
  }

  return {
    template: input.templateLabel,
    script: input.script,
    tags: [],
    modelKey: input.modelKey,
    modeId: input.lane,
    language: input.language,
    voice: input.voice,
    imageUrls: input.imageUrl ? [input.imageUrl] : [],
    music: {
      type: 'none',
      url: null,
    },
    audioSettings: {
      volume: 20,
      ducking: true,
      sampleRateHz: 48000,
    },
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    quality: input.quality,
    durationMode: 'custom',
    durationSeconds: input.durationSeconds,
    captionsEnabled: input.captionsEnabled,
    captionStyle: 'classic',
    narrationEnabled: input.narrationEnabled,
  };
}

function serializeAvatarProductAdvancedControls(controls: AvatarProductAdvancedControls): Record<string, string | string[] | boolean | number> {
  return {
    ...controls,
    must_show_elements: controls.must_show_elements,
    must_avoid_elements: controls.must_avoid_elements,
    claims_to_avoid: controls.claims_to_avoid,
  };
}

function buildAvatarProductRecipeInputs(params: {
  prompt: string;
  imageUrl: string;
  assistFields?: Record<string, unknown> | null;
  advancedControls: AvatarProductAdvancedControls;
  inlineAnswerPatch?: Record<string, string | string[]>;
}): Record<string, string | string[]> {
  const { prompt, imageUrl, assistFields, advancedControls, inlineAnswerPatch } = params;
  const inputs: Record<string, string | string[]> = {
    text: prompt,
    image: imageUrl,
  };
  Object.entries(assistFields || {}).forEach(([key, value]) => {
    if (value == null) return;
    if (Array.isArray(value)) {
      const normalized = value.map((item) => String(item).trim()).filter(Boolean);
      if (normalized.length) inputs[key] = normalized;
      return;
    }
    const normalized = String(value).trim();
    if (normalized) inputs[key] = normalized;
  });
  Object.entries(advancedControls).forEach(([key, value]) => {
    if (typeof value === 'boolean') {
      inputs[key] = value ? 'true' : 'false';
      return;
    }
    const normalized = String(value ?? '').trim();
    if (normalized) inputs[key] = normalized;
  });
  Object.entries(inlineAnswerPatch || {}).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const normalized = value.map((item) => String(item).trim()).filter(Boolean);
      if (normalized.length) inputs[key] = normalized;
      return;
    }
    const normalized = String(value).trim();
    if (normalized) inputs[key] = normalized;
  });
  return inputs;
}

function buildAvatarProductInlineAnswerPatch(
  answer: string,
  assist: AvatarProductAssistResponse | null,
): Record<string, string> {
  const normalized = answer.trim();
  if (!normalized) return {};

  const nextQuestion = String(assist?.nextQuestion || '').toLowerCase();
  const primaryMissing =
    assist?.missingTier1?.[0]
    || assist?.missingTier2?.[0]
    || assist?.missingTier3?.[0]
    || '';

  if (nextQuestion.includes('what kind of product is this exactly')) {
    return {
      product_category: normalized,
      product_subcategory: normalized,
      category_specific_details: normalized,
    };
  }

  switch (primaryMissing) {
    case 'product_name':
      return { product_name: normalized };
    case 'product_category':
      return {
        product_category: normalized,
        category_specific_details: normalized,
      };
    case 'target_audience':
      return { target_audience: normalized };
    case 'campaign_objective':
      return { campaign_objective: normalized };
    case 'platform':
      return { platform: normalized };
    case 'main_benefit':
      return { main_benefit: normalized };
    case 'brand_tone':
      return { brand_tone: normalized };
    case 'cta_preference':
      return { cta_preference: normalized };
    case 'language':
      return { language: normalized };
    default:
      return { category_specific_details: normalized };
  }
}

function pickImageMode(idea: string, profile: QualityProfile): 'fast_social' | 'premium_realism' {
  if (profile === 'creator_quality' || profile === 'premium') return 'premium_realism';
  const value = idea.toLowerCase();
  if (/\b(premium|luxury|cinematic|high-end|hero|polished)\b/.test(value)) return 'premium_realism';
  return 'fast_social';
}

function normalizeVideoProfile(profile: QualityProfile): { lane: 'creator_pro' | 'premium'; modelKey: 'fal_ltx23_i2v' | 'sora2'; resolution: '720p' } {
  if (profile === 'premium') {
    return { lane: 'premium', modelKey: 'sora2', resolution: '720p' };
  }
  return { lane: 'creator_pro', modelKey: 'fal_ltx23_i2v', resolution: '720p' };
}

function getVideoModelLane(modelKey: string): 'creator_pro' | 'premium' {
  const lane = VIDEO_MODEL_MAP[modelKey]?.lane;
  return lane === 'premium' ? 'premium' : 'creator_pro';
}

function getVideoResolutionForModel(modelKey: string, profile: QualityProfile): '720p' | '1080p' {
  const labels = VIDEO_MODEL_MAP[modelKey]?.resolutionLabels ?? ['720p'];
  if (labels.includes('720p')) return '720p';
  if (labels.includes('1080p')) return '1080p';
  return '720p';
}

function getDefaultVideoDurationForModel(modelKey: string): '5' | '10' {
  const presets = VIDEO_MODEL_MAP[modelKey]?.durationPresets ?? [];
  if (presets.includes(10)) return '10';
  if (presets.includes(5)) return '5';
  return '10';
}

function profileForVideoModel(modelKey: string): QualityProfile {
  return getVideoModelLane(modelKey) === 'premium' ? 'premium' : 'creator_pro';
}

function profileForImageModel(modelKey: string): QualityProfile {
  if (['budget_image_model', 'gemini_flash_image'].includes(modelKey)) return 'fast_social';
  return 'creator_quality';
}

function shortVideoModelLabel(model: AIVideoModel) {
  return model.shortLabel ?? model.label;
}

function creditPerSecondLabel(modelKey: string, resolutionLabel: string, quality: 'standard' | 'high') {
  const aliasKey = (creditEngine.videoModelAliases?.[modelKey as keyof typeof creditEngine.videoModelAliases] ?? 'fal_ltx23_i2v') as keyof typeof creditEngine.video.modelMultiplier;
  const modelMultiplier = creditEngine.video.modelMultiplier?.[aliasKey] ?? 1;
  const resolutionKey = (resolutionLabel === '4K' ? '2160p' : resolutionLabel === '2K' ? '1440p' : resolutionLabel.toLowerCase()) as keyof typeof creditEngine.video.resolutionMultiplier;
  const resolutionMultiplier = creditEngine.video.resolutionMultiplier?.[resolutionKey] ?? 1;
  const qualityMultiplier = creditEngine.video.qualityMultiplier?.[quality] ?? 1;
  const value = creditEngine.video.baseCredits * modelMultiplier * resolutionMultiplier * qualityMultiplier / creditEngine.video.baseDuration;
  return value.toFixed(value >= 10 ? 2 : 2);
}

function imageCreditsLabel(modelKey: string, resolution: '1024' | '1536') {
  const normalizedKey = normalizeImageModelKey(modelKey);
  const exact = creditEngine.image.modelPricing?.[normalizedKey as keyof typeof creditEngine.image.modelPricing]?.[resolution];
  if (typeof exact === 'number') return `${exact}`;
  return resolution === '1536' ? '8' : '5';
}

function mapRecipeTab(recipe: RecipeCatalog): RecipeTab {
  const tags = new Set((recipe.tags || []).map((item) => item.toLowerCase()));
  const haystack = [recipe.title, recipe.description, recipe.short_label, ...(recipe.tags || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (tags.has('ads') || /ad|promo|brand|product|commerce|listing/.test(haystack)) return 'ads';
  if (tags.has('explainer') || /explainer|education|history|tech|startup|business/.test(haystack)) return 'explainer';
  return 'all';
}

function recipeMatchesTab(recipe: RecipeCard, tab: RecipeTab) {
  if (tab === 'all') return true;

  const haystack = [
    recipe.recipe.title,
    recipe.recipe.description,
    recipe.recipe.short_label,
    ...(recipe.recipe.tags || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (tab === 'ads') return /ad|promo|brand|product|commerce|listing|offer/.test(haystack);
  if (tab === 'explainer') return /explainer|education|history|tech|startup|business|how|why/.test(haystack);

  return recipe.tab === tab;
}

function buildRecipeBadge(recipe: RecipeCatalog, tab: RecipeTab): string | null {
  if (recipe.short_label) return recipe.short_label;
  if (recipe.trending) return 'Popular';
  if (recipe.featured) return 'Best for creators';
  if (tab === 'ads') return 'Best for ads';
  return null;
}

function normalizeImageModelKey(modelKey?: string | null) {
  if (!modelKey) return 'gemini_flash_image';
  return creditEngine.imageModelAliases?.[modelKey as keyof typeof creditEngine.imageModelAliases] ?? modelKey;
}

function buildComposerVoicePreviewText(prompt: string) {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  return normalized.slice(0, 240);
}

function summarizeLanguageTags(tags: string[] | undefined): string | null {
  const values = (tags || []).filter(Boolean).slice(0, 3);
  return values.length ? values.join(' · ') : null;
}

function resolveAvatarPreferredVoice(avatar: AvatarSelection): string | null {
  const explicitVoice = String(avatar.preferredVoice || '').trim();
  if (explicitVoice) return explicitVoice;

  if (avatar.source === 'preset') {
    const presetVoiceMap: Record<string, string> = {
      'av-priya': 'Priya',
      'av-ananya': 'Priya',
      'av-arjun': 'Shubh',
      'av-ravi': 'Shubh',
    };
    const mapped = presetVoiceMap[avatar.personaId];
    if (mapped) return mapped;
  }

  const normalizedGender = String(avatar.genderPresentation || '').toLowerCase();
  if (normalizedGender.startsWith('f')) return 'Priya';
  if (normalizedGender.startsWith('m')) return 'Shubh';

  const normalizedName = avatar.name.toLowerCase();
  if (['priya', 'ananya', 'mira'].some((token) => normalizedName.includes(token))) return 'Priya';
  if (['arjun', 'ravi', 'shubh', 'aarav', 'dev'].some((token) => normalizedName.includes(token))) return 'Shubh';

  return null;
}

function resolveAvatarPreferredLanguage(avatar: AvatarSelection): string | null {
  const explicitLanguage = String(avatar.preferredLanguage || '').trim();
  if (explicitLanguage) return explicitLanguage;
  const firstTag = (avatar.languageTags || []).find((tag) => typeof tag === 'string' && tag.trim().length > 0);
  return firstTag ? firstTag.trim() : null;
}

function estimateRecipeCredits(recipe: RecipeCatalog): number | null {
  const medium = recipe.type ?? 'video';
  const defaults = recipe.generation_defaults ?? {};
  if (medium === 'image') {
    const modelKey = normalizeImageModelKey(defaults.model_key);
    const resolution = String(defaults.resolution ?? '1536');
    const exact = creditEngine.image.modelPricing?.[modelKey as keyof typeof creditEngine.image.modelPricing]?.[resolution as '1024' | '1536' | '2048'];
    if (typeof exact === 'number') return exact;
    return 5;
  }
  const aliasKey = (creditEngine.videoModelAliases?.[String(defaults.model_key ?? 'fal_ltx23_i2v') as keyof typeof creditEngine.videoModelAliases] ?? 'fal_ltx23_i2v') as keyof typeof creditEngine.video.modelMultiplier;
  const modelMultiplier = creditEngine.video.modelMultiplier?.[aliasKey] ?? 1;
  const resolutionKey = (defaults.resolution ?? '720p') as keyof typeof creditEngine.video.resolutionMultiplier;
  const resolutionMultiplier = creditEngine.video.resolutionMultiplier?.[resolutionKey] ?? 1;
  const qualityKey = (defaults.quality ?? 'standard') as keyof typeof creditEngine.video.qualityMultiplier;
  const qualityMultiplier = creditEngine.video.qualityMultiplier?.[qualityKey] ?? 1;
  const durationSeconds = Number(defaults.duration_seconds ?? 5);
  const base = creditEngine.video.baseCredits * modelMultiplier * resolutionMultiplier * (durationSeconds / creditEngine.video.baseDuration) * qualityMultiplier;
  const rounded = Math.ceil(base);
  return rounded + creditEngine.fixedCosts.auto_caption;
}

function mapCatalogRecipeToCard(recipe: RecipeCatalog): RecipeCard | null {
  const ugcOverrideVideo =
    recipe.id === 'ugc_ad'
      ? '/videos/samples/ugc_ad_preview.mp4'
      : recipe.preview_video_url;

  const ugcOverridePoster =
    recipe.id === 'ugc_ad'
      ? '/videos/samples/ugc_ad_preview.mp4'
      : (recipe.preview_image_url || ugcOverrideVideo);

  if (recipe.type !== 'video' || !ugcOverrideVideo) return null;

  const previewUrl = toAbsoluteUrl(ugcOverridePoster);
  if (!previewUrl) return null;

  const previewVideoUrl = toAbsoluteUrl(ugcOverrideVideo);
  const tab = mapRecipeTab(recipe);

  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description || 'Ready-made workflow for faster creation.',
    contentType: 'video',
    tab,
    trending: Boolean(recipe.trending),
    aspectRatio: recipe.generation_defaults?.aspect_ratio || '9:16',
    previewUrl,
    previewVideoUrl,
    credits: estimateRecipeCredits(recipe),
    badge: buildRecipeBadge(recipe, tab) ?? 'AI video',
    helper: null,
    recipe,
  };
}

function mapInspirationToCard(item: InspirationImage): InspirationPhotoCard {
  return {
    id: item.id,
    title: item.title,
    prompt: item.prompt,
    aspectRatio: item.aspect_ratio || '9:16',
    previewUrl: toAbsoluteUrl(item.image_url) || item.image_url,
    creatorName: item.creator_name,
    modelKey: item.model_key,
    createdAt: item.created_at,
    badge: 'Published',
    raw: item,
  };
}

function sortRecipes(items: RecipeCard[]) {
  return [...items].sort((a, b) => {
    const rank = (item: RecipeCard) =>
      (item.trending ? 8 : 0) +
      (item.recipe.featured ? 6 : 0) +
      (item.tab === 'ads' ? 2 : 0) +
      (item.helper ? 1 : 0);
    const delta = rank(b) - rank(a);
    if (delta !== 0) return delta;
    return (a.recipe.order ?? 999) - (b.recipe.order ?? 999);
  });
}

function recipeModalCopy(recipe: RecipeCard) {
  return 'Use this recipe';
}

function recentBadgeLabel(kind: RecentEntryKind) {
  if (kind === 'recipe') return 'Recipe';
  return 'Draft';
}

function buildRecipeComposerState(config: RecipeComposerConfig, seed?: Partial<Record<string, string>>): RecipeComposerState {
  return {
    ...config,
    values: config.slots.reduce<Record<string, string>>((acc, slot) => {
      acc[slot.id] = seed?.[slot.id] ?? '';
      return acc;
    }, {}),
  };
}

function resolveRecipeComposer(recipe: RecipeCard): RecipeComposerState {
  const composer = recipe.recipe.composer;
  if (!composer) {
    return buildRecipeComposerState(
      {
        ...GENERIC_VIDEO_RECIPE,
        recipeId: recipe.id,
        recipeLabel: recipe.title,
      },
      {},
    );
  }

  return buildRecipeComposerState({
    recipeId: recipe.id,
    recipeLabel: composer.recipe_label || recipe.title,
    sourceKind: 'recipe',
    mode: (recipe.recipe.type === 'image' ? 'image' : 'video'),
    fragments: composer.fragments.map((fragment) =>
      fragment.type === 'text'
        ? { type: 'text', value: fragment.value || '' }
        : { type: 'slot', slotId: fragment.slot_id || '' },
    ),
    slots: composer.slots.map((slot) => ({
      id: slot.id,
      kind: slot.kind as RecipeSlotKind,
      label: slot.label,
      placeholder: slot.placeholder,
      required: Boolean(slot.required),
      options: slot.options || [],
      sampleLabel: slot.sample_label || undefined,
      samplePreviewUrl: toAbsoluteUrl(slot.sample_preview_url),
      submitTarget: slot.submit_target || undefined,
    })) as RecipeComposerSlot[],
  });
}

function assembleRecipePrompt(recipeComposer: RecipeComposerState) {
  return recipeComposer.fragments
    .map((fragment) => {
      if (fragment.type === 'text') return fragment.value;
      return recipeComposer.values[fragment.slotId]?.trim() || '';
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function firstEmptyRecipeTextSlot(recipeComposer: RecipeComposerState | null) {
  if (!recipeComposer) return null;
  const slot = recipeComposer.slots.find(
    (item) =>
      (item.kind === 'text' || item.kind === 'select') &&
      !(recipeComposer.values[item.id] || '').trim(),
  );
  return slot?.id ?? null;
}

function InlineTextSlot({
  slot,
  value,
  autoFocus,
  onChange,
}: {
  slot: RecipeComposerSlot;
  value: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      type="text"
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={slot.placeholder}
      className="min-w-[9rem] rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.62)] px-3 py-2 text-sm font-medium text-text outline-none transition placeholder:text-muted focus:border-[hsl(var(--color-accent)/0.5)] focus:bg-[hsl(var(--color-surface)/0.82)] dark:bg-white/[0.06] dark:text-white"
      size={Math.max(value.length || slot.placeholder.length, 12)}
    />
  );
}

function InlineSelectSlot({
  slot,
  value,
  autoFocus,
  onChange,
}: {
  slot: RecipeComposerSlot;
  value: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <select
      autoFocus={autoFocus}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="min-w-[8.5rem] rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.62)] px-3 py-2 text-sm font-medium text-text outline-none transition focus:border-[hsl(var(--color-accent)/0.5)] dark:bg-white/[0.06] dark:text-white"
    >
      <option value="">{slot.placeholder}</option>
      {slot.options?.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

function InlineUploadSlot({
  slot,
  value,
  previewUrl,
  onClick,
}: {
  slot: RecipeComposerSlot;
  value: string;
  previewUrl?: string | null;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${value
        ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.1)] text-text'
        : 'border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.62)] text-muted hover:border-[hsl(var(--color-accent)/0.35)] hover:text-text'
        } dark:bg-white/[0.06] dark:text-white`}
    >
      {previewUrl ? (
        <img src={previewUrl} alt={value || slot.label} className="h-6 w-6 rounded-full object-cover" />
      ) : (
        <Upload className="h-3.5 w-3.5" />
      )}
      {value || slot.placeholder}
    </button>
  );
}

function ComposerPoster({
  title,
  previewUrl,
  previewVideoUrl,
  onClick,
  badge,
  ctaLabel = 'Open',
}: {
  title: string;
  previewUrl: string;
  previewVideoUrl?: string | null;
  onClick: () => void;
  badge?: string | null;
  ctaLabel?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative mb-4 inline-block w-full break-inside-avoid overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.62)] bg-[hsl(var(--color-surface)/0.55)] text-left shadow-soft transition duration-300 hover:-translate-y-1 hover:border-[hsl(var(--color-accent)/0.32)]"
    >
      <div className="relative">
        {previewVideoUrl ? (
          <video
            src={previewVideoUrl}
            poster={previewUrl}
            className="block h-auto w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
        ) : (
          <img
            src={previewUrl}
            alt={title}
            className="block h-auto w-full transition duration-300 group-hover:scale-[1.02]"
            loading="lazy"
            decoding="async"
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.86)] via-[hsl(var(--color-bg)/0.16)] to-transparent" />
        {badge ? (
          <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-[hsl(var(--color-surface)/0.82)] px-2.5 py-1 text-[10px] font-semibold text-text backdrop-blur">
            {badge}
          </span>
        ) : null}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-6 text-center">
          <p className="max-w-[13ch] text-xl font-heading font-extrabold tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.35)] sm:text-[1.75rem]">
            {title}
          </p>
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-center justify-end">
          <span className="translate-y-2 rounded-full border border-white/14 bg-black/35 px-3 py-2 text-xs font-semibold text-white/90 opacity-0 backdrop-blur transition duration-200 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            {ctaLabel}
          </span>
        </div>
      </div>
    </button>
  );
}

function ModelCapabilityBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-black/30 px-2 py-1 text-[10px] font-semibold text-white/78">
      {label}
    </span>
  );
}

function ModelRow({
  title,
  badges,
  active,
  disabled,
  onClick,
  onHover,
}: {
  title: string;
  badges: string[];
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  onHover: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full rounded-[16px] border px-3 py-2.5 text-left transition ${active
        ? 'border-white/14 bg-white/[0.08]'
        : 'border-transparent bg-white/[0.04] hover:bg-white/[0.07]'
        } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[14px] font-semibold text-white">{title}</p>
            {disabled ? <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] font-semibold text-white/65">Soon</span> : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <ModelCapabilityBadge key={badge} label={badge} />
            ))}
          </div>
        </div>
        <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-white/48" />
      </div>
    </button>
  );
}

function getFriendlyErrorMessage(error: unknown) {
  const fallback = 'Something went wrong. Please try again.';

  if (!(error instanceof Error)) return fallback;

  const message = error.message || fallback;

  try {
    const parsed = JSON.parse(message);

    if (Array.isArray(parsed) && parsed.length > 0) {
      const first = parsed[0];

      if (first?.type === 'string_too_long' && Array.isArray(first?.loc) && first.loc.includes('topic')) {
        const max = first?.ctx?.max_length ?? 300;
        return `Prompt is too long. Please keep it under ${max} characters.`;
      }

      if (typeof first?.msg === 'string') {
        return first.msg;
      }
    }
  } catch {
    // not JSON, continue
  }

  return message;
}

export function UnifiedCreateStudioClient({ userId }: { userId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [showCreateCustomAvatarModal, setShowCreateCustomAvatarModal] = useState(false);
  const [idea, setIdea] = useState('');
  const [mode, setMode] = useState<ComposerMode>('video');
  const [qualityProfile, setQualityProfile] = useState<QualityProfile>('creator_pro');
  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [durationPreference, setDurationPreference] = useState<'auto' | '5' | '10'>('auto');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [loading, setLoading] = useState(false);
  const [, setVideoLaunch] = useState<VideoLaunchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeCatalog[]>([]);
  const [inspirationPhotos, setInspirationPhotos] = useState<InspirationImage[]>([]);
  const [videoModels, setVideoModels] = useState<AIVideoModel[]>(VIDEO_MODEL_FALLBACK);
  const [imageModels, setImageModels] = useState<ImageModel[]>(IMAGE_MODEL_FALLBACK);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedVideoModelKey, setSelectedVideoModelKey] = useState('fal_ltx23_i2v');
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('gpt_image_1_5');
  const [modelPanelKey, setModelPanelKey] = useState<string | null>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [loadingInspirationPhotos, setLoadingInspirationPhotos] = useState(true);
  const [recipeTab, setRecipeTab] = useState<RecipeTab>('all');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeCard | null>(null);
  const [selectedInspirationPhoto, setSelectedInspirationPhoto] = useState<InspirationPhotoCard | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [activeRecipeLabel, setActiveRecipeLabel] = useState<string | null>(null);
  const [uploadedAssetName, setUploadedAssetName] = useState<string | null>(null);
  const [uploadedComposerAsset, setUploadedComposerAsset] = useState<SlotAssetState | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [recipeComposer, setRecipeComposer] = useState<RecipeComposerState | null>(null);
  const [recipeSlotAssets, setRecipeSlotAssets] = useState<Record<string, SlotAssetState>>({});
  const [pendingUploadTarget, setPendingUploadTarget] = useState<'composer-asset' | string | null>(null);
  const [assetPicker, setAssetPicker] = useState<AssetPickerState | null>(null);
  const [activeRecipeSource, setActiveRecipeSource] = useState<ActiveRecipeSource>(null);
  const [latestGeneratedImage, setLatestGeneratedImage] = useState<GeneratedImage | null>(null);
  const [imageResultOpen, setImageResultOpen] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<TTSLanguageOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Shubh');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [voicePreviewMessage, setVoicePreviewMessage] = useState<string | null>(null);
  const [publishingImageId, setPublishingImageId] = useState<string | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarSelection | null>(null);
  const [avatarPreviewPersonaId, setAvatarPreviewPersonaId] = useState<string | null>(null);
  const [navigationOverlayLabel, setNavigationOverlayLabel] = useState<string | null>(null);
  const [avatarLoadError, setAvatarLoadError] = useState<string | null>(null);
  const [avatarProductAdvancedOpen, setAvatarProductAdvancedOpen] = useState(false);
  const [avatarProductAdvancedControls, setAvatarProductAdvancedControls] = useState<AvatarProductAdvancedControls>(DEFAULT_AVATAR_PRODUCT_ADVANCED_CONTROLS);
  const [avatarProductAssist, setAvatarProductAssist] = useState<AvatarProductAssistResponse | null>(null);
  const [avatarProductAssistLoading, setAvatarProductAssistLoading] = useState(false);
  const [avatarProductInlineAnswer, setAvatarProductInlineAnswer] = useState('');

  const [presetAvatars, setPresetAvatars] = useState<Avatar[]>([]);
  const [savedAvatars, setSavedAvatars] = useState<Avatar[]>([]);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const composerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const avatarSyncKeyRef = useRef<string | null>(null);
  const { show } = useToast();

  const visibleQualityProfiles = useMemo(
    () =>
      mode === 'image'
        ? QUALITY_PROFILES.filter((item) => item.key === 'fast_social' || item.key === 'creator_quality')
        : QUALITY_PROFILES.filter((item) => item.key === 'creator_pro' || item.key === 'premium'),
    [mode],
  );

  const isHeygenCompatibleAvatar = (avatar: Avatar) =>
    String(avatar.provider || '').trim().toLowerCase() === 'heygen'
    && avatar.supports_avatar_video_generation === true;

  const displayedModelKey = mode === 'video' ? selectedVideoModelKey : selectedImageModelKey;
  const displayedVideoModel = useMemo(
    () => videoModels.find((model) => model.key === selectedVideoModelKey) ?? VIDEO_MODEL_FALLBACK.find((model) => model.key === selectedVideoModelKey) ?? videoModels[0] ?? VIDEO_MODEL_FALLBACK[0],
    [selectedVideoModelKey, videoModels],
  );
  const displayedImageModel = useMemo(
    () => imageModels.find((model) => model.key === selectedImageModelKey) ?? IMAGE_MODEL_FALLBACK.find((model) => model.key === selectedImageModelKey) ?? imageModels[0] ?? IMAGE_MODEL_FALLBACK[0],
    [imageModels, selectedImageModelKey],
  );
  const modelMenuList = mode === 'video' ? videoModels : imageModels;
  const activeModelPanelKey = modelPanelKey ?? displayedModelKey;
  const activeVideoModelDetail = useMemo(
    () => videoModels.find((model) => model.key === activeModelPanelKey) ?? VIDEO_MODEL_FALLBACK.find((model) => model.key === activeModelPanelKey) ?? displayedVideoModel,
    [activeModelPanelKey, displayedVideoModel, videoModels],
  );
  const activeImageModelDetail = useMemo(
    () => imageModels.find((model) => model.key === activeModelPanelKey) ?? IMAGE_MODEL_FALLBACK.find((model) => model.key === activeModelPanelKey) ?? displayedImageModel,
    [activeModelPanelKey, displayedImageModel, imageModels],
  );

  const recipeCards = useMemo(() => sortRecipes(recipes.map(mapCatalogRecipeToCard).filter(Boolean) as RecipeCard[]), [recipes]);

  const filteredRecipes = useMemo(() => {
    return recipeCards.filter((item) => recipeMatchesTab(item, recipeTab)).slice(0, 12);
  }, [recipeCards, recipeTab]);
  const inspirationPhotoCards = useMemo(
    () => inspirationPhotos.map(mapInspirationToCard).slice(0, 12),
    [inspirationPhotos],
  );
  const composerVoicePreviewText = useMemo(
    () => buildComposerVoicePreviewText(recipeComposer ? assembleRecipePrompt(recipeComposer) : idea),
    [idea, recipeComposer],
  );

  useEffect(() => {
    setNavigationOverlayLabel(null);
  }, [pathname]);

  const navigateWithComposerLoader = (event: ReactMouseEvent<HTMLElement>, href: string, label: string) => {
    event.preventDefault();
    setNavigationOverlayLabel(label);
    window.dispatchEvent(new CustomEvent('rangmanch:navigation-start'));
    router.push(href);
  };

  const toggleGeneratedImagePublish = async (image: GeneratedImage) => {
    setPublishingImageId(image.id);
    try {
      const result = await api.publishInspiration('image', image.id, !image.is_public_inspiration, userId);
      setLatestGeneratedImage((current) =>
        current && current.id === image.id
          ? {
              ...current,
              is_public_inspiration: result.is_public_inspiration,
              moderation_status: result.moderation_status,
              inspiration_score: result.inspiration_score,
              like_count: result.like_count,
            }
          : current,
      );
      show({
        title: result.is_public_inspiration ? 'Published to inspiration' : 'Removed from inspiration',
        message: result.is_public_inspiration
          ? (result.moderation_status !== 'approved'
              ? 'Submitted for review. It will appear after moderation.'
              : 'Your image is now visible in inspiration.')
          : 'Your image is no longer visible in inspiration.',
        variant: 'success',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update publish status.';
      show({ title: 'Publish update failed', message, variant: 'error' });
    } finally {
      setPublishingImageId(null);
    }
  };
  const selectedLanguageLabel = useMemo(
    () => languageOptions.find((option) => option.code === selectedLanguage)?.label ?? selectedLanguage,
    [languageOptions, selectedLanguage],
  );
  const recipeSettingsLocked = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && Boolean(recipeComposer),
    [activeRecipeSource, recipeComposer],
  );
  const avatarVoiceLocked = useMemo(
    () =>
      recipeSettingsLocked &&
      activeRecipeSource?.kind === 'recipe' &&
      (activeRecipeSource.recipe.recipe.id === 'ugc_ad' || activeRecipeSource.recipe.recipe.id === 'avatar_product') &&
      Boolean(selectedAvatar),
    [activeRecipeSource, recipeSettingsLocked, selectedAvatar],
  );
  const activeRecipeDefaults = useMemo(
    () => (activeRecipeSource?.kind === 'recipe' ? activeRecipeSource.recipe.recipe.generation_defaults : null),
    [activeRecipeSource],
  );
  const activeRecipeDurationSeconds = useMemo(
    () => (activeRecipeSource?.kind === 'recipe' ? Number(activeRecipeSource.recipe.recipe.duration_seconds || 0) : null),
    [activeRecipeSource],
  );
  const isRecipeLongForm = Boolean(activeRecipeDurationSeconds && activeRecipeDurationSeconds > 10);
  const avatarOptions = useMemo<AvatarSelection[]>(() => {
    const fixedChitrakala = buildChitrakalaAvatarSelection();
    const presetItems = presetAvatars.map((avatar) => ({
      personaId: avatar.id,
      name: avatar.name,
      imageUrl: avatar.primary_image || avatar.thumbnail_url,
      source: 'preset' as const,
      sourceLabel: 'Preset' as const,
      isCustomAvatar: avatar.category === 'custom_avatar',
      genderPresentation: avatar.gender || null,
      preferredLanguage: avatar.language_tags?.[0] || null,
      preferredVoice: avatar.recommended_voice || null,
      languageTags: avatar.language_tags || [],
      styleLabel: avatar.avatar_type || avatar.category || avatar.style || 'Preset avatar',
      languageInfo: summarizeLanguageTags(avatar.language_tags),
      voiceInfo: avatar.recommended_voice ? `${avatar.recommended_voice} recommended` : 'Uses your selected Sarvam voice',
      previewVideoUrl: avatar.preview_video_url || null,
      description:
        avatar.description ||
        `${avatar.name} is tuned for creator-style talking scenes with a ${avatar.style} look${avatar.tags?.length ? ` and ${avatar.tags.slice(0, 3).join(', ')} tags` : ''}.`,
    }));
    const savedItems = savedAvatars.map((avatar) => ({
      personaId: avatar.id,
      name: avatar.name,
      imageUrl: avatar.primary_image || avatar.thumbnail_url || undefined,
      source: 'saved' as const,
      sourceLabel: 'Saved' as const,
      isCustomAvatar: avatar.category === 'custom_avatar',
      genderPresentation: avatar.gender || null,
      preferredVoice: avatar.recommended_voice || null,
      preferredLanguage: avatar.language_tags?.[0] || null,
      languageTags: avatar.language_tags || [],
      styleLabel: avatar.avatar_type || avatar.category || avatar.style || 'Saved avatar',
      languageInfo: summarizeLanguageTags(avatar.language_tags) || selectedLanguageLabel || null,
      voiceInfo: avatar.recommended_voice ? `${avatar.recommended_voice} recommended` : (selectedVoice ? `${selectedVoice} voice selected` : 'Uses your selected Sarvam voice'),
      previewVideoUrl: avatar.preview_video_url || null,
      description:
        avatar.description ||
        `${avatar.name} is one of your saved Avatar IV-compatible avatars for repeatable avatar-led ads.`,
    }));
    const avatarProductRecipeActive = activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'avatar_product';
    if (avatarProductRecipeActive) {
      return [fixedChitrakala];
    }
    return [...presetItems, ...savedItems];
  }, [activeRecipeSource, presetAvatars, savedAvatars, selectedLanguageLabel, selectedVoice]);
  const activeAvatarPreview = useMemo(
    () =>
      avatarOptions.find((option) => option.personaId === avatarPreviewPersonaId) ??
      (selectedAvatar ? avatarOptions.find((option) => option.personaId === selectedAvatar.personaId) : null) ??
      avatarOptions[0] ??
      null,
    [avatarOptions, avatarPreviewPersonaId, selectedAvatar],
  );
  useEffect(() => {
    if (!isAvatarPickerOpen) return;
    setAvatarPreviewPersonaId((current) => {
      if (current && avatarOptions.some((option) => option.personaId === current)) {
        return current;
      }
      if (selectedAvatar && avatarOptions.some((option) => option.personaId === selectedAvatar.personaId)) {
        return selectedAvatar.personaId;
      }
      return avatarOptions[0]?.personaId ?? null;
    });
  }, [avatarOptions, isAvatarPickerOpen, selectedAvatar]);

  const openAvatarPicker = () => {
    setAvatarPreviewPersonaId(selectedAvatar?.personaId ?? avatarOptions[0]?.personaId ?? null);
    setIsAvatarPickerOpen(true);
  };

  const openUploadPickerForTarget = (target: 'composer-asset' | string) => {
    setPendingUploadTarget(target);
    setAssetPicker(null);
    window.setTimeout(() => {
      fileInputRef.current?.click();
    }, 0);
  };

  const applyAvatarSelection = (avatar: AvatarSelection | null) => {
    if (isAvatarProductRecipe) {
      setSelectedAvatar(buildChitrakalaAvatarSelection());
      setIsAvatarPickerOpen(false);
      return;
    }
    setSelectedAvatar(avatar);
    if (isAvatarDrivenRecipe && avatar) {
      const preferredVoice = resolveAvatarPreferredVoice(avatar);
      if (preferredVoice && avatarGenderFilteredVoiceOptions.some((option) => option.key === preferredVoice)) {
        setSelectedVoice(preferredVoice);
      }
      const preferredLanguage = resolveAvatarPreferredLanguage(avatar);
      if (preferredLanguage && languageOptions.some((option) => option.code === preferredLanguage)) {
        setSelectedLanguage(preferredLanguage);
      }
    }
    setIsAvatarPickerOpen(false);
  };
  const firstEmptySlotId = useMemo(() => firstEmptyRecipeTextSlot(recipeComposer), [recipeComposer]);
  const composerIntent = useMemo(() => detectVideoIntent(idea), [idea]);
  const isUgcAdRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'ugc_ad',
    [activeRecipeSource],
  );
  const isAvatarProductRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'avatar_product',
    [activeRecipeSource],
  );
  const isAvatarDrivenRecipe = isUgcAdRecipe || isAvatarProductRecipe;
  const avatarProductInlineAnswerPatch = useMemo(
    () => buildAvatarProductInlineAnswerPatch(avatarProductInlineAnswer, avatarProductAssist),
    [avatarProductAssist, avatarProductInlineAnswer],
  );
  const avatarGenderFilteredVoiceOptions = useMemo(() => {
    const avatarGender = String(selectedAvatar?.genderPresentation || '').trim().toLowerCase();
    const isCustomAvatar = Boolean(selectedAvatar?.isCustomAvatar);
    if (!isCustomAvatar || !isAvatarDrivenRecipe || (avatarGender !== 'female' && avatarGender !== 'male')) {
      return voiceOptions;
    }
    return voiceOptions.filter((option) => option.gender.toLowerCase() === avatarGender);
  }, [isAvatarDrivenRecipe, selectedAvatar, voiceOptions]);
  useEffect(() => {
    if (!isAvatarDrivenRecipe || !selectedAvatar) {
      avatarSyncKeyRef.current = null;
      return;
    }

    const syncKey = `${selectedAvatar.personaId}:${voiceOptions.length}:${languageOptions.length}`;
    if (avatarSyncKeyRef.current === syncKey) return;

    const preferredVoice = resolveAvatarPreferredVoice(selectedAvatar);
    if (preferredVoice && avatarGenderFilteredVoiceOptions.some((option) => option.key === preferredVoice)) {
      setSelectedVoice(preferredVoice);
    } else if (avatarGenderFilteredVoiceOptions[0]?.key) {
      setSelectedVoice(avatarGenderFilteredVoiceOptions[0].key);
    }
    const preferredLanguage = resolveAvatarPreferredLanguage(selectedAvatar);
    if (preferredLanguage && languageOptions.some((option) => option.code === preferredLanguage)) {
      setSelectedLanguage(preferredLanguage);
    }
    avatarSyncKeyRef.current = syncKey;
  }, [avatarGenderFilteredVoiceOptions, isAvatarDrivenRecipe, languageOptions, selectedAvatar, voiceOptions]);
  useEffect(() => {
    if (!isAvatarProductRecipe) {
      setAvatarProductAssist(null);
      setAvatarProductAssistLoading(false);
      setAvatarProductInlineAnswer('');
    }
  }, [isAvatarProductRecipe]);
  useEffect(() => {
    if (!isAvatarProductRecipe) return;
    setSelectedAvatar((current) => current?.personaId === CHITRAKALA_PERSONA_ID ? current : buildChitrakalaAvatarSelection());
  }, [isAvatarProductRecipe]);
  const willAutoRouteToExplainer = useMemo(
    () => shouldAutoUseExplainerRecipe(composerIntent, mode, activeRecipeSource),
    [activeRecipeSource, composerIntent, mode],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(RECENT_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as RecentEntry[];
      if (Array.isArray(parsed)) {
        setRecentEntries(parsed.slice(0, 8));
      }
    } catch {
      // ignore storage parse failures
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recentEntries.slice(0, 8)));
    } catch {
      // ignore storage write failures
    }
  }, [recentEntries]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecipes(true);
    setModelsLoading(true);
    setIsAvatarLoading(true);
    void Promise.allSettled([
      api.listRecipes(userId, { type: 'video', active: true }),
      api.listAIVideoModels(userId),
      api.listImageModels(userId),
      api.listPublicImageInspiration({ limit: 12 }),
      api.getTtsCatalog(userId),
      api.listAvatarLibrary(userId),
    ]).then(([recipeResult, videoModelResult, imageModelResult, inspirationResult, ttsResult, avatarLibraryResult]) => {
      if (cancelled) return;

      if (recipeResult.status === 'fulfilled') {
        setRecipes(recipeResult.value);
      }
      if (videoModelResult.status === 'fulfilled' && videoModelResult.value.length > 0) {
        const enabledFirst = [...videoModelResult.value].sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
        setVideoModels(enabledFirst);
        if (!enabledFirst.some((model) => model.key === selectedVideoModelKey)) {
          setSelectedVideoModelKey(enabledFirst[0]?.key ?? 'fal_ltx23_i2v');
        }
      }
      if (imageModelResult.status === 'fulfilled' && imageModelResult.value.length > 0) {
        setImageModels(imageModelResult.value);
        if (!imageModelResult.value.some((model) => model.key === selectedImageModelKey)) {
          setSelectedImageModelKey(imageModelResult.value[0]?.key ?? 'gpt_image_1_5');
        }
      }
      if (inspirationResult.status === 'fulfilled') {
        setInspirationPhotos(inspirationResult.value.filter((item) => Boolean(item.image_url)));
      }
      if (ttsResult.status === 'fulfilled') {
        setVoiceOptions(ttsResult.value.voices);
        setLanguageOptions(ttsResult.value.languages);
        const preferredVoice = ttsResult.value.voices.find((voice) => voice.key === 'Shubh') ?? ttsResult.value.voices[0];
        const preferredLanguage = ttsResult.value.languages.find((language) => language.code === 'en-IN') ?? ttsResult.value.languages[0];
        if (preferredVoice) {
          setSelectedVoice(preferredVoice.key);
        }
        if (preferredLanguage) {
          setSelectedLanguage(preferredLanguage.code);
        }
      }
      if (avatarLibraryResult.status === 'fulfilled') {
        const library: AvatarLibraryResponse = avatarLibraryResult.value;
        const compatiblePresetAvatars = (library.preset_avatars || []).filter(isHeygenCompatibleAvatar);
        const compatibleSavedAvatars = (library.user_avatars || []).filter(isHeygenCompatibleAvatar);
        setPresetAvatars(compatiblePresetAvatars);
        setSavedAvatars(compatibleSavedAvatars);
        setAvatarLoadError(null);
        if (process.env.NODE_ENV === 'development') {
          const publicActors = compatiblePresetAvatars.length;
          const savedActors = compatibleSavedAvatars.length;
          console.info('avatar_picker_loaded', {
            public_actor_count: publicActors,
            saved_avatar_count: savedActors,
            total_count: publicActors + savedActors,
          });
        }
      } else {
        const message = avatarLibraryResult.reason instanceof Error ? avatarLibraryResult.reason.message : 'Could not load compatible avatars.';
        setAvatarLoadError(message);
        setPresetAvatars([]);
        setSavedAvatars([]);
        show({
          title: 'Avatar library unavailable',
          message: 'Compatible HeyGen avatars could not be loaded for this picker.',
          variant: 'error',
          durationMs: 5200,
        });
      }
      setIsAvatarLoading(false);
      setLoadingRecipes(false);
      setModelsLoading(false);
      setLoadingInspirationPhotos(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | PointerEvent | TouchEvent) => {
      if (!composerRef.current?.contains(event.target as Node)) {
        closeMenus();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMenus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    setVoicePreviewUrl(null);
    setVoicePreviewMessage(null);
  }, [selectedLanguage, selectedVoice, composerVoicePreviewText]);

  const closeMenus = () => {
    setOpenMenu(null);
    setAssetPicker(null);
  };

  const previewComposerVoice = async () => {
    if (!voiceEnabled || !selectedVoice || !composerVoicePreviewText) return;
    setVoicePreviewing(true);
    setVoicePreviewMessage(null);
    try {
      let previewText = composerVoicePreviewText;
      if (selectedLanguage !== 'en-IN') {
        const translation = await api.translateScriptText(
          {
            text: composerVoicePreviewText,
            target_language: selectedLanguageLabel,
          },
          userId,
        );
        previewText = buildComposerVoicePreviewText(translation.text || composerVoicePreviewText);
      }
      const response = await api.previewTts(
        {
          voice: selectedVoice,
          language: selectedLanguage,
          sample_rate_hz: 22050,
          text: previewText,
        },
        userId,
      );
      setVoicePreviewUrl(toAbsoluteUrl(response.preview_url));
      setVoicePreviewMessage(
        `${response.provider}${response.resolved_voice ? ` · ${response.resolved_voice}` : ''}${response.cached ? ' · cached' : ''}`,
      );
    } catch (nextError) {
      setVoicePreviewMessage(nextError instanceof Error ? nextError.message : 'Unable to preview this voice right now.');
    } finally {
      setVoicePreviewing(false);
    }
  };

  const pushRecentEntry = (entry: RecentEntry) => {
    setRecentEntries((current) => {
      const deduped = current.filter((item) => item.title !== entry.title || item.kind !== entry.kind || item.prompt !== entry.prompt);
      return [entry, ...deduped].slice(0, 8);
    });
  };

  const rehydrateRecentEntry = (entry: RecentEntry) => {
    if (entry.kind === 'recipe' && entry.recipeId) {
      const matchingRecipe = recipeCards.find((item) => item.id === entry.recipeId);
      if (matchingRecipe) {
        applyRecipeToComposer(matchingRecipe);
        return;
      }
    }
    setIdea(entry.prompt);
    setRecipeComposer(null);
    setRecipeSlotAssets({});
    setActiveRecipeSource(null);
    setAssetPicker(null);
    setVideoLaunch(null);
    setMode(entry.mode);
    setAspectRatio(entry.aspectRatio);
    setQualityProfile(entry.qualityProfile);
    setActiveRecipeLabel(entry.title);
    closeMenus();
    textareaRef.current?.focus();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    show({ title: 'Composer restored', message: `${entry.title} is back in the composer.`, variant: 'success' });
  };

  const handleModeChange = (nextMode: ComposerMode) => {
    setMode(nextMode);
    const nextProfile = nextMode === 'image' ? profileForImageModel(selectedImageModelKey) : profileForVideoModel(selectedVideoModelKey);
    setQualityProfile(nextProfile);
    setModelPanelKey(nextMode === 'image' ? selectedImageModelKey : selectedVideoModelKey);
    if (nextMode === 'image') {
      setVideoLaunch(null);
    }
  };

  const exitRecipeComposer = () => {
    setRecipeComposer(null);
    setRecipeSlotAssets({});
    setAvatarProductAssist(null);
    setAvatarProductInlineAnswer('');
    setAvatarProductAdvancedOpen(false);
    setActiveRecipeLabel(null);
    setActiveRecipeSource(null);
    setAssetPicker(null);
    setPendingUploadTarget(null);
    setVideoLaunch(null);
  };

  const updateRecipeSlotValue = (slotId: string, value: string) => {
    setRecipeComposer((current) =>
      current
        ? {
          ...current,
          values: {
            ...current.values,
            [slotId]: value,
          },
        }
        : current,
    );
  };

  const applySlotAsset = (slotId: string, asset: SlotAssetState) => {
    updateRecipeSlotValue(slotId, asset.label);
    setRecipeSlotAssets((current) => ({
      ...current,
      [slotId]: asset,
    }));
    setAssetPicker(null);
    setPendingUploadTarget(null);
  };

  const openSlotAssetPicker = (slot: RecipeComposerSlot, event: ReactMouseEvent<HTMLButtonElement>) => {
    if (isAvatarProductRecipe && (slot.kind === 'upload' || slot.kind === 'reference-image')) {
      event.preventDefault();
      openUploadPickerForTarget(slot.id);
      return;
    }
    if (!composerRef.current) return;
    const composerBounds = composerRef.current.getBoundingClientRect();
    const targetBounds = event.currentTarget.getBoundingClientRect();
    setPendingUploadTarget(slot.id);
    setAssetPicker({
      slotId: slot.id,
      slotLabel: slot.label,
      sampleLabel: slot.sampleLabel,
      samplePreviewUrl: slot.samplePreviewUrl,
      left: Math.max(16, targetBounds.left - composerBounds.left),
      top: Math.max(96, targetBounds.bottom - composerBounds.top + 12),
    });
  };

  const applyRecipeToComposer = (recipe: RecipeCard) => {
    const defaults = recipe.recipe.generation_defaults ?? {};
    const nextMode: ComposerMode = (recipe.recipe.type === 'image' ? 'image' : 'video');
    const composerState = resolveRecipeComposer(recipe);
    const recipeModelKey = String(defaults.model_key || '').trim();
    setRecipeComposer(composerState);
    setRecipeSlotAssets({});
    setAvatarProductInlineAnswer('');
    setAvatarProductAdvancedControls(DEFAULT_AVATAR_PRODUCT_ADVANCED_CONTROLS);
    setAvatarProductAssist(null);
    setAvatarProductAdvancedOpen(false);
    setUploadedAssetName(null);
    setUploadedComposerAsset(null);
    setIdea(assembleRecipePrompt(composerState));
    setMode(nextMode);
    if (nextMode === 'video' && recipeModelKey) {
      setSelectedVideoModelKey(recipeModelKey);
      setModelPanelKey(recipeModelKey);
    } else if (nextMode === 'image') {
      setModelPanelKey(selectedImageModelKey);
    } else {
      setModelPanelKey(selectedVideoModelKey);
    }
    setVideoLaunch(null);
    setAspectRatio((defaults.aspect_ratio as '9:16' | '16:9' | '1:1') || (recipe.aspectRatio as '9:16' | '16:9' | '1:1') || '9:16');
    setDurationPreference(Number(recipe.recipe.duration_seconds || defaults.duration_seconds || 0) > 10 ? 'auto' : (String(defaults.duration_seconds ?? 5) === '10' ? '10' : '5'));
    setCaptionsEnabled(Boolean(defaults.captions_enabled ?? true));
    setVoiceEnabled(Boolean(defaults.narration_enabled ?? true));
    if (defaults.voice) {
      setSelectedVoice(String(defaults.voice));
    }
    if (defaults.language) {
      const matchingLanguage =
        languageOptions.find((option) => option.code === defaults.language) ??
        languageOptions.find((option) => option.label === defaults.language) ??
        languageOptions.find((option) => option.label.toLowerCase().includes(String(defaults.language).toLowerCase()));
      setSelectedLanguage(matchingLanguage?.code ?? String(defaults.language));
    }
    setQualityProfile(nextMode === 'video' ? (defaults.quality === 'high' ? 'premium' : 'creator_pro') : 'creator_quality');
    setActiveRecipeLabel(recipe.title);
    setActiveRecipeSource({ kind: 'recipe', recipe });
    setSelectedRecipe(null);
    closeMenus();
    pushRecentEntry({
      id: `recipe:${recipe.id}:${Date.now()}`,
      kind: 'recipe',
      title: recipe.title,
      prompt: recipe.description,
      mode: 'video',
      aspectRatio: ((defaults.aspect_ratio as '9:16' | '16:9' | '1:1') || (recipe.aspectRatio as '9:16' | '16:9' | '1:1') || '9:16'),
      qualityProfile: nextMode === 'video' ? (defaults.quality === 'high' ? 'premium' : 'creator_pro') : 'creator_quality',
      recipeId: recipe.id,
      createdAt: Date.now(),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    show({
      title: 'Recipe loaded',
      message: 'Recommended settings already applied. You can refine this later.',
      variant: 'success',
    });
  };

  const applyInspirationPhotoToComposer = (item: InspirationPhotoCard) => {
    setRecipeComposer(null);
    setRecipeSlotAssets({});
    setActiveRecipeSource(null);
    setActiveRecipeLabel(item.title);
    setIdea(item.prompt);
    setMode('image');
    setModelPanelKey(selectedImageModelKey);
    setVideoLaunch(null);
    setSelectedInspirationPhoto(null);
    setQualityProfile(profileForImageModel(selectedImageModelKey));
    closeMenus();
    pushRecentEntry({
      id: `draft:image:${Date.now()}`,
      kind: 'draft',
      title: item.title,
      prompt: item.prompt,
      mode: 'image',
      aspectRatio: '9:16',
      qualityProfile: profileForImageModel(selectedImageModelKey),
      createdAt: Date.now(),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    show({
      title: 'Style loaded',
      message: 'This inspiration prompt is now in the composer. You can generate immediately or refine it first.',
      variant: 'success',
    });
  };

  const launchUnifiedFlow = async () => {
    const recipePrompt = recipeComposer ? assembleRecipePrompt(recipeComposer) : idea;
    const trimmedIdea = recipePrompt.trim();
    if (!trimmedIdea) {
      setError('Add one idea first so we can prepare the right creation flow.');
      return;
    }

    if (recipeComposer) {
      const missingRequired = recipeComposer.slots.find(
        (slot) => slot.required && !(recipeComposer.values[slot.id] || '').trim(),
      );
      if (missingRequired) {
        setError(`Fill ${missingRequired.label.toLowerCase()} first so we can prepare the right creation flow.`);
        return;
      }
    }
    setLoading(true);
    setError(null);
    closeMenus();
    setIdea(trimmedIdea);

    try {
      const recipeMode =
        recipeComposer?.mode ??
        (activeRecipeSource?.kind === 'recipe' ? activeRecipeSource.recipe.contentType : null);
      const nextMode = resolveComposerMode(mode, recipeMode);
      pushRecentEntry({
        id: `draft:${nextMode}:${Date.now()}`,
        kind: 'draft',
        title: activeRecipeLabel || (nextMode === 'video' ? 'Last video draft' : 'Last image draft'),
        prompt: trimmedIdea,
        mode: nextMode,
        aspectRatio,
        qualityProfile,
        createdAt: Date.now(),
      });

      if (recipeComposer && activeRecipeSource?.kind === 'recipe') {
        const recipe = activeRecipeSource.recipe.recipe;
        const inputs: Record<string, string | string[]> = {};
        let imageValue = '';
        if (recipe.input?.image) {
          const imageSlot = recipeComposer.slots.find((slot) => slot.submitTarget === 'image' || slot.kind === 'upload' || slot.kind === 'reference-image');
          const imageAsset = imageSlot ? recipeSlotAssets[imageSlot.id] : null;
          imageValue =
            imageAsset?.assetUrl ||
            (imageSlot ? recipeComposer.values[imageSlot.id] : '');
          if (!imageValue || (typeof imageValue === 'string' && !imageValue.trim())) {
            throw new Error('Upload the required image first so we can run this recipe.');
          }
          inputs.image = String(imageValue).trim();
        }
        if (recipe.input?.text) {
          inputs.text = trimmedIdea;
        }
        if (recipe.id === 'avatar_product' && imageValue) {
          Object.assign(
            inputs,
            buildAvatarProductRecipeInputs({
              prompt: trimmedIdea,
              imageUrl: String(imageValue).trim(),
              assistFields: avatarProductAssist?.fields ?? null,
              advancedControls: avatarProductAdvancedControls,
              inlineAnswerPatch: avatarProductInlineAnswerPatch,
            }),
          );
        }

        if (recipe.id === 'avatar_product') {
          if (!selectedAvatar?.personaId) {
            setError('Select an AI avatar first so the avatar product recipe knows who should appear in the ad.');
            setLoading(false);
            return;
          }

          try {
            setAvatarProductAssistLoading(true);
            const validation = await api.assistAvatarProductRecipe(
              {
                recipeId: 'avatar_product',
                message: trimmedIdea,
                inputs,
                imageUrls: imageValue ? [String(imageValue).trim()] : [],
                personaId: selectedAvatar.personaId,
                advancedControls: serializeAvatarProductAdvancedControls(avatarProductAdvancedControls),
              },
              userId,
            );
            setAvatarProductAssist(validation);
            if (!validation.canGenerate) {
              setAvatarProductAdvancedOpen(true);
              setError(
                validation.nextQuestion
                || 'Fill the required product details in Advanced controls before generating this avatar product ad.',
              );
              setLoading(false);
              return;
            }
          } catch (assistError) {
            setError(getFriendlyErrorMessage(assistError) || 'Could not validate the avatar product brief right now.');
            setLoading(false);
            return;
          } finally {
            setAvatarProductAssistLoading(false);
          }
        }

        const result = await api.createAIVideo(
          {
            recipeId: recipe.id,
            inputs,
            aspectRatio,
            language: selectedLanguage,
            voice: selectedVoice,
            captionsEnabled,
            narrationEnabled: voiceEnabled,
            personaId: (recipe.id === 'ugc_ad' || recipe.id === 'avatar_product') ? (selectedAvatar?.personaId || undefined) : undefined,
            useAvatarForTalkingScenes: (recipe.id === 'ugc_ad' || recipe.id === 'avatar_product') ? Boolean(selectedAvatar?.personaId) : undefined,
          },
          userId,
        );
        show({
          title: 'Recipe started',
          message: recipe.id === 'avatar_product'
            ? 'Your video is generating. You can safely leave this page. We’ll notify you when it’s ready.'
            : 'Your video is now rendering. We are opening the live status page.',
          variant: 'success',
        });
        router.push(`/videos/${result.id}`);
        return;
      }

      if (nextMode === 'image') {
        const resolution: '1024' | '1536' = qualityProfile === 'fast_social' ? '1024' : '1536';
        setVideoLaunch(null);
        const createdImage = await api.generateImage(
          {
            model_key: selectedImageModelKey,
            prompt: trimmedIdea,
            aspect_ratio: aspectRatio,
            resolution,
            image_count: 1,
            reference_urls: uploadedComposerAsset?.assetUrl ? [uploadedComposerAsset.assetUrl] : [],
            reference_mode: uploadedComposerAsset?.assetUrl ? 'inspiration' : undefined,
            mode_id: pickImageMode(trimmedIdea, qualityProfile),
          },
          userId,
        );
        setLatestGeneratedImage(createdImage);
        setImageResultOpen(true);
        show({
          title: 'Image created',
          message: 'Your image is ready in the popup. If you close it, you can reopen it from the composer.',
          variant: 'success',
        });
        return;
      }

      const detectedIntent = detectVideoIntent(trimmedIdea);
      if (shouldAutoUseExplainerRecipe(detectedIntent, nextMode, activeRecipeSource)) {
        const explainerRecipeId = pickExplainerRecipeId(trimmedIdea);
        const videoResult = await api.createAIVideo(
          buildVideoCreatePayload({
            type: 'recipe',
            recipeId: explainerRecipeId,
            prompt: trimmedIdea,
            aspectRatio,
            language: selectedLanguage,
            voice: selectedVoice,
            captionsEnabled,
            narrationEnabled: voiceEnabled,
          }),
          userId,
        );
        show({
          title: 'Explainer started',
          message:
            explainerRecipeId === 'deep_dive_explainer'
              ? 'We routed this into the longer explainer pipeline and opened the live workspace.'
              : 'We routed this into the explainer pipeline and opened the live workspace.',
          variant: 'success',
        });
        router.push(`/videos/${videoResult.id}`);
        return;
      }

      const profile = {
        lane: getVideoModelLane(selectedVideoModelKey),
        modelKey: selectedVideoModelKey,
        resolution: getVideoResolutionForModel(selectedVideoModelKey, qualityProfile),
      };
      if (selectedVideoModelKey === 'ltx') {
        const videoResult = await api.createAIVideo(
          buildVideoCreatePayload({
            type: 'freeform',
            templateLabel: 'LTX Storyboard',
            script: trimmedIdea,
            modelKey: selectedVideoModelKey,
            lane: 'creator_pro',
            aspectRatio,
            resolution: '720p',
            quality: 'standard',
            durationSeconds: 24,
            captionsEnabled,
            narrationEnabled: voiceEnabled,
            language: selectedLanguage,
            voice: selectedVoice,
            imageUrl: uploadedComposerAsset?.assetUrl,
          }),
          userId,
        );
        show({
          title: 'LTX render started',
          message: 'Your stitched LTX video is now rendering. We are opening the live status page.',
          variant: 'success',
        });
        router.push(`/videos/${videoResult.id}`);
        return;
      }
      const durationSeconds =
        durationPreference === 'auto'
          ? Number(getDefaultVideoDurationForModel(selectedVideoModelKey))
          : Number(durationPreference);
      const templateKey = pickVideoTemplateKey(trimmedIdea);
      const templateLabel = TEMPLATE_OPTIONS.find((item) => item.key === templateKey)?.label || 'Story / Scene Reel';
      const scriptResult = await api.generateScriptV2(
        {
          template: templateLabel,
          topic: trimmedIdea,
          language: 'English',
          tone: 'Creator-first, emotionally engaging, social-ready',
          lane: profile.lane === 'premium' ? 'Premium' : 'Creator Pro',
          modelKey: selectedVideoModelKey,
          modelLabel: displayedVideoModel?.label ?? selectedVideoModelKey,
          aspectRatio: aspectRatio,
          resolution: profile.resolution,
          quality: profile.lane === 'premium' ? 'high' : 'standard',
          durationSeconds,
          narrationEnabled: voiceEnabled,
          captionsEnabled,
        },
        userId,
      );

      const videoResult = await api.createAIVideo(
        buildVideoCreatePayload({
          type: 'freeform',
          templateLabel,
          script: scriptResult.script,
          modelKey: selectedVideoModelKey,
          lane: profile.lane,
          aspectRatio,
          resolution: profile.resolution,
          quality: profile.lane === 'premium' ? 'high' : 'standard',
          durationSeconds,
          captionsEnabled,
          narrationEnabled: voiceEnabled,
          language: selectedLanguage,
          voice: selectedVoice,
          imageUrl: uploadedComposerAsset?.assetUrl,
        }),
        userId,
      );
      show({
        title: 'Video started',
        message: 'Your video job is live. We are opening the workspace now.',
        variant: 'success',
      });
      router.push(`/videos/${videoResult.id}`);
      return;
    } catch (nextError) {
      const message = getFriendlyErrorMessage(nextError) || 'Could not prepare the unified creation flow.';
      setError(message);
      setVideoLaunch(null);
      show({ title: 'Could not prepare creation flow', message, variant: 'error', durationMs: 5200 });
    } finally {
      setLoading(false);
    }
  };

  const currentProfileLabel = QUALITY_PROFILES.find((item) => item.key === qualityProfile)?.label ?? 'Creator Pro';
  const currentModelLabel = mode === 'video' ? shortVideoModelLabel(displayedVideoModel) : displayedImageModel?.label ?? 'Image';
  const currentModelHint = mode === 'video' ? displayedVideoModel?.qualityBadge ?? displayedVideoModel?.frontendHint : displayedImageModel?.badge ?? displayedImageModel?.frontend_hint;
  const selectedVideoResolution = getVideoResolutionForModel(selectedVideoModelKey, qualityProfile);
  const selectedImageResolution: '1024' | '1536' = qualityProfile === 'fast_social' ? '1024' : '1536';

  return (
    <div className="space-y-6">
      <LoadingOverlay
        open={Boolean(navigationOverlayLabel)}
        title={`Opening ${navigationOverlayLabel ?? 'workspace'}`}
        description="Preparing the next workspace for you."
        stepLabel="Navigating"
        accentLabel="Create"
      />

      <section className="space-y-4">
        <Modal open={isAvatarPickerOpen} onClose={() => setIsAvatarPickerOpen(false)}>
          <div className="space-y-5">
            <div className="flex flex-col gap-3 border-b border-border/70 pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">AI Avatar</p>
                <h3 className="mt-1 text-xl font-semibold text-text">Choose your spokesperson</h3>
                <p className="mt-1 text-sm text-muted">
                  Preview the avatar first, then use it for talking scenes inside your UGC recipe.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!isAvatarProductRecipe ? (
                  <button
                    type="button"
                    onClick={() => applyAvatarSelection(null)}
                    className="rounded-full border border-[hsl(var(--color-border)/0.7)] px-3 py-1.5 text-xs font-semibold text-muted transition hover:text-text"
                  >
                    Continue without avatar
                  </button>
                ) : null}
                {!isAvatarProductRecipe ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAvatarPickerOpen(false);
                      setShowCreateCustomAvatarModal(true);
                    }}
                    className="rounded-full border border-[hsl(var(--color-border)/0.7)] px-3 py-1.5 text-xs font-semibold text-text transition hover:border-[hsl(var(--color-accent)/0.35)]"
                  >
                    Create Your Own Avatar
                  </button>
                ) : null}
              </div>
            </div>

            {isAvatarLoading ? (
              <div className="py-10 text-center text-sm text-muted">Loading avatars...</div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                <div className="space-y-5">
                  {avatarLoadError && !isAvatarProductRecipe ? (
                    <div className="rounded-[16px] border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      Public actors could not be loaded just now. Saved avatars are still available as fallback.
                    </div>
                  ) : null}
                  {[
                    { label: 'Public Actors', items: avatarOptions.filter((item) => item.source === 'preset') },
                    { label: 'Saved Avatars', items: avatarOptions.filter((item) => item.source === 'saved') },
                  ].map((group) =>
                    group.items.length ? (
                      <section key={group.label} className="space-y-3">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{group.label}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {group.items.map((avatar) => {
                            const isFocused = activeAvatarPreview?.personaId === avatar.personaId;
                            const isSelected = selectedAvatar?.personaId === avatar.personaId;
                            return (
                              <div
                                key={avatar.personaId}
                                className={`rounded-[20px] border p-3 transition ${
                                  isFocused
                                    ? 'border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.08)]'
                                    : 'border-[hsl(var(--color-border)/0.74)] bg-[hsl(var(--color-surface)/0.72)]'
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => setAvatarPreviewPersonaId(avatar.personaId)}
                                  className="w-full text-left"
                                >
                                  <div className="overflow-hidden rounded-[16px] bg-[hsl(var(--color-surface)/0.7)]">
                                    {avatar.imageUrl ? (
                                      <img
                                        src={avatar.imageUrl}
                                        alt={avatar.name}
                                        className="h-36 w-full object-cover"
                                      />
                                    ) : (
                                      <div className="flex h-36 items-center justify-center text-sm text-muted">No preview image</div>
                                    )}
                                  </div>
                                  <div className="mt-3 flex items-start justify-between gap-2">
                                    <div>
                                      <p className="text-sm font-semibold text-text">{avatar.name}</p>
                                      <p className="mt-1 text-xs text-muted">{avatar.styleLabel || avatar.sourceLabel}</p>
                                    </div>
                                    <span className="rounded-full border border-[hsl(var(--color-border)/0.7)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                                      {avatar.sourceLabel}
                                    </span>
                                  </div>
                                </button>
                                <div className="mt-3 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setAvatarPreviewPersonaId(avatar.personaId)}
                                    className="flex-1 rounded-[12px] border border-[hsl(var(--color-border)/0.74)] px-3 py-2 text-xs font-semibold text-text transition hover:border-[hsl(var(--color-accent)/0.35)]"
                                  >
                                    Preview
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => applyAvatarSelection(avatar)}
                                    className={`flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition ${
                                      isSelected
                                        ? 'bg-[hsl(var(--color-accent)/0.18)] text-text'
                                        : 'bg-[linear-gradient(to_right,#818cf8,#a855f7)] text-white hover:opacity-95'
                                    }`}
                                  >
                                    {isSelected ? 'Selected' : 'Use this avatar'}
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ) : null,
                  )}

                  {avatarOptions.length === 0 ? (
                    <div className="rounded-[20px] border border-dashed border-[hsl(var(--color-border)/0.74)] p-6 text-sm text-muted">
                      No avatars found yet. Create one to use a repeatable talking persona in your UGC ad flow.
                    </div>
                  ) : null}
                </div>

                <aside className="rounded-[24px] border border-[hsl(var(--color-border)/0.74)] bg-[hsl(var(--color-surface)/0.74)] p-4 xl:sticky xl:top-0">
                  {activeAvatarPreview ? (
                    <div className="space-y-4">
                      <div className="overflow-hidden rounded-[20px] bg-[hsl(var(--color-bg)/0.72)]">
                        {activeAvatarPreview.imageUrl ? (
                          <img
                            src={activeAvatarPreview.imageUrl}
                            alt={activeAvatarPreview.name}
                            className="h-[280px] w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-[280px] items-center justify-center text-sm text-muted">No preview available</div>
                        )}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="text-lg font-semibold text-text">{activeAvatarPreview.name}</h4>
                          <span className="rounded-full border border-[hsl(var(--color-border)/0.7)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                            {activeAvatarPreview.sourceLabel}
                          </span>
                        </div>
                        {activeAvatarPreview.styleLabel ? (
                          <p className="mt-1 text-sm text-muted">{activeAvatarPreview.styleLabel}</p>
                        ) : null}
                      </div>
                      {activeAvatarPreview.description ? (
                        <p className="text-sm leading-6 text-muted">{activeAvatarPreview.description}</p>
                      ) : null}
                      <div className="grid gap-2">
                        {activeAvatarPreview.languageInfo ? (
                          <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.7)] px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Language</p>
                            <p className="mt-1 text-sm text-text">{activeAvatarPreview.languageInfo}</p>
                          </div>
                        ) : null}
                        {activeAvatarPreview.voiceInfo ? (
                          <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.7)] px-3 py-2">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">Voice</p>
                            <p className="mt-1 text-sm text-text">{activeAvatarPreview.voiceInfo}</p>
                          </div>
                        ) : null}
                      </div>
                      {activeAvatarPreview.previewVideoUrl ? (
                        <video className="w-full rounded-[16px]" controls src={activeAvatarPreview.previewVideoUrl} />
                      ) : (
                        <div className="rounded-[16px] border border-dashed border-[hsl(var(--color-border)/0.74)] px-4 py-3 text-sm text-muted">
                          Preview video will appear here once avatar preview media is available. You can still use the image preview right away.
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => applyAvatarSelection(activeAvatarPreview)}
                        className="w-full rounded-[14px] bg-[linear-gradient(to_right,#818cf8,#a855f7)] px-4 py-3 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.24)] hover:opacity-95"
                      >
                        Use this avatar
                      </button>
                    </div>
                  ) : (
                    <div className="flex h-full min-h-[320px] items-center justify-center rounded-[20px] border border-dashed border-[hsl(var(--color-border)/0.74)] p-6 text-center text-sm text-muted">
                      Pick an avatar to inspect the larger preview and selection details.
                    </div>
                  )}
                </aside>
              </div>
            )}
          </div>
        </Modal>

        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Create</p>
          <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Choose a recipe. Create instantly.</h1>
        </div>

        <section className="mx-auto max-w-[1040px] space-y-2">

          <div
            ref={composerRef}
            className="relative z-30 overflow-visible rounded-[32px] border border-white/10 bg-[rgba(18,18,24,0.8)] px-4 py-3 backdrop-blur-[16px] shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_20px_50px_rgba(0,0,0,0.5)] sm:px-6 sm:py-3.5"
          >
            <div className="pointer-events-none absolute inset-x-[24%] -bottom-10 h-24 rounded-full bg-[radial-gradient(circle,rgba(34,211,238,0.14)_0%,rgba(139,92,246,0.16)_38%,rgba(236,72,153,0.14)_60%,transparent_80%)] blur-2xl" />
            <div className="absolute inset-x-10 bottom-0 h-px bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.18),transparent)]" />
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  {activeRecipeLabel ? (
                    <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.68)] px-3 py-1.5 text-[11px] font-semibold text-text shadow-soft dark:border-white/14 dark:bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]">
                      <LayoutTemplate className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                      <span>Recipe: {activeRecipeLabel}</span>
                    </div>
                  ) : null}
                  {uploadedAssetName ? (
                    <Badge variant="outline" className="rounded-full border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.62)] px-3 py-1.5 text-[11px] text-text dark:border-white/12 dark:bg-white/5">
                      Reference image: {uploadedAssetName}
                    </Badge>
                  ) : null}
                  {recipeComposer ? (
                    <button
                      type="button"
                      onClick={exitRecipeComposer}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.62)] px-3 py-1.5 text-[11px] font-semibold text-muted transition hover:text-text dark:border-white/12 dark:bg-white/5"
                    >
                      <X className="h-3.5 w-3.5" />
                      Exit recipe
                    </button>
                  ) : null}
                </div>
              </div>

              {recipeComposer ? (
                <div className="space-y-3 rounded-[20px] bg-transparent px-0.5 py-1">
                  <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">
                    <span className="rounded-full border border-[hsl(var(--color-border)/0.76)] bg-[hsl(var(--color-surface)/0.56)] px-3 py-1 dark:border-white/10 dark:bg-white/[0.04]">
                      {recipeComposer.recipeLabel}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-3 text-lg leading-8 text-text sm:text-[1.18rem]">
                    {recipeComposer.fragments.map((fragment, index) => {
                      if (fragment.type === 'text') {
                        return (
                          <span key={`fragment-${index}`} className="text-text/88 dark:text-white/88">
                            {fragment.value}
                          </span>
                        );
                      }

                      const slot = recipeComposer.slots.find((item) => item.id === fragment.slotId);
                      if (!slot) return null;
                      const value = recipeComposer.values[slot.id] || '';

                      if (slot.kind === 'upload' || slot.kind === 'reference-image') {
                        return (
                          <InlineUploadSlot
                            key={slot.id}
                            slot={slot}
                            value={value}
                            previewUrl={recipeSlotAssets[slot.id]?.previewUrl}
                            onClick={(event) => openSlotAssetPicker(slot, event)}
                          />
                        );
                      }

                      if (slot.kind === 'select') {
                        return (
                          <InlineSelectSlot
                            key={slot.id}
                            slot={slot}
                            value={value}
                            autoFocus={firstEmptySlotId === slot.id}
                            onChange={(nextValue) => updateRecipeSlotValue(slot.id, nextValue)}
                          />
                        );
                      }

                      return (
                        <InlineTextSlot
                          key={slot.id}
                          slot={slot}
                          value={value}
                          autoFocus={firstEmptySlotId === slot.id}
                          onChange={(nextValue) => updateRecipeSlotValue(slot.id, nextValue)}
                        />
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted">Start with the empty slots. Generate stays ready on the right, and you can still refine settings below.</p>
                  {isAvatarProductRecipe ? (
                    <div className="space-y-3 rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.56)] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">Avatar product assistant</p>
                          <p className="mt-1 text-xs text-muted">
                            Generate checks the required business fields, and Advanced controls lets you refine the brief when needed.
                          </p>
                        </div>
                        <Badge variant="outline" className="rounded-full">
                          {avatarProductAssistLoading ? 'Checking on generate…' : 'Checks happen on generate'}
                        </Badge>
                      </div>
                      {avatarProductAssist?.fields ? (
                        <div className="flex flex-wrap gap-2">
                          {([
                            ['product_name', 'Product'],
                            ['product_category', 'Category'],
                            ['target_audience', 'Audience'],
                            ['campaign_objective', 'Objective'],
                            ['platform', 'Platform'],
                            ['main_benefit', 'Benefit'],
                            ['script_mode', 'Script mode'],
                          ] as const)
                            .map(([key, label]) => {
                              const value = avatarProductAssist.fields[key];
                              if (!value || (typeof value === 'string' && !value.trim())) return null;
                              return (
                                <Badge key={key} variant="outline" className="rounded-full border-[hsl(var(--color-border)/0.8)] bg-transparent text-text">
                                  {label}: {String(value)}
                                </Badge>
                              );
                            })}
                        </div>
                      ) : null}
                      <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg)/0.55)] px-3 py-3 dark:border-white/8 dark:bg-black/20">
                        <button
                          type="button"
                          onClick={() => setAvatarProductAdvancedOpen((current) => !current)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div>
                            <p className="text-sm font-semibold text-text">Advanced controls</p>
                            <p className="mt-1 text-xs text-muted">Optional control for agencies, freelancers, and strict brand jobs.</p>
                          </div>
                          <ChevronDown className={`h-4 w-4 text-muted transition ${avatarProductAdvancedOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {avatarProductAdvancedOpen ? (
                          <div className="mt-4 grid gap-3 md:grid-cols-2">
                            {avatarProductAssist?.nextQuestion ? (
                              <div className="md:col-span-2 rounded-[14px] border border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-bg)/0.48)] px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Current assistant question</p>
                                <p className="mt-2 text-sm text-text">
                                  <span className="font-semibold">Question:</span> {avatarProductAssist.nextQuestion}
                                </p>
                                <label className="mt-3 block space-y-1">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Answer here</span>
                                  <Input
                                    value={avatarProductInlineAnswer}
                                    onChange={(event) => setAvatarProductInlineAnswer(event.target.value)}
                                    placeholder="Example: soft drink, glow serum, running shoes, or fast-charging gadget"
                                  />
                                </label>
                              </div>
                            ) : null}
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Campaign objective</span>
                              <Select value={avatarProductAdvancedControls.campaign_objective} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, campaign_objective: event.target.value }))}>
                                <option value="">Select objective</option>
                                <option value="build_awareness">Build awareness</option>
                                <option value="get_clicks">Get clicks</option>
                                <option value="drive_purchases">Drive purchases</option>
                                <option value="drive_bookings">Drive bookings</option>
                              </Select>
                            </label>
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Platform</span>
                              <Select value={avatarProductAdvancedControls.platform} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, platform: event.target.value }))}>
                                <option value="Instagram Reels">Instagram Reels</option>
                                <option value="TikTok">TikTok</option>
                                <option value="YouTube Shorts">YouTube Shorts</option>
                                <option value="Meta ads">Meta ads</option>
                                <option value="Amazon listing video">Amazon listing video</option>
                              </Select>
                            </label>
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Brand tone</span>
                              <Input value={avatarProductAdvancedControls.brand_tone} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, brand_tone: event.target.value }))} placeholder="friendly_confident" />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">CTA preference</span>
                              <Input value={avatarProductAdvancedControls.cta_preference} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, cta_preference: event.target.value }))} placeholder="shop now, learn more, try it today" />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Voice style</span>
                              <Input value={avatarProductAdvancedControls.voice_style} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, voice_style: event.target.value }))} placeholder="friendly, premium, calm, energetic" />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Offer text</span>
                              <Input value={avatarProductAdvancedControls.offer_text} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, offer_text: event.target.value }))} placeholder="20% off this week" />
                            </label>
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Tagline</span>
                              <Input value={avatarProductAdvancedControls.tagline} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, tagline: event.target.value }))} placeholder="Fuel fast mornings" />
                            </label>
                            <label className="space-y-1 text-sm md:col-span-2">
                              <span className="text-muted">Must show elements</span>
                              <Input value={avatarProductAdvancedControls.must_show_elements} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, must_show_elements: event.target.value }))} placeholder="logo, product pack, chilled droplets" />
                            </label>
                            <label className="space-y-1 text-sm md:col-span-2">
                              <span className="text-muted">Must avoid elements</span>
                              <Input value={avatarProductAdvancedControls.must_avoid_elements} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, must_avoid_elements: event.target.value }))} placeholder="messy background, exaggerated glow, unrelated props" />
                            </label>
                            <label className="space-y-1 text-sm md:col-span-2">
                              <span className="text-muted">Compliance notes / claims to avoid</span>
                              <Textarea rows={3} value={`${avatarProductAdvancedControls.compliance_notes}${avatarProductAdvancedControls.claims_to_avoid ? `\nClaims to avoid: ${avatarProductAdvancedControls.claims_to_avoid}` : ''}`.trim()} onChange={(event) => {
                                const raw = event.target.value;
                                const [firstLine, ...rest] = raw.split('\n');
                                const claimsLine = rest.find((line) => line.toLowerCase().startsWith('claims to avoid:')) || '';
                                setAvatarProductAdvancedControls((current) => ({
                                  ...current,
                                  compliance_notes: firstLine.trim(),
                                  claims_to_avoid: claimsLine.replace(/claims to avoid:/i, '').trim(),
                                }));
                              }} placeholder="Avoid medical claims.\nClaims to avoid: clinically proven, cures acne" />
                            </label>
                            <label className="space-y-1 text-sm md:col-span-2">
                              <span className="text-muted">Script mode</span>
                              <Select value={avatarProductAdvancedControls.script_mode} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, script_mode: event.target.value as AvatarProductAdvancedControls['script_mode'] }))}>
                                <option value="auto_generate">Auto generate</option>
                                <option value="improve_draft">Improve draft</option>
                                <option value="use_exact_script">Use exact script</option>
                              </Select>
                            </label>
                            {avatarProductAdvancedControls.script_mode !== 'auto_generate' ? (
                              <label className="space-y-1 text-sm md:col-span-2">
                                <span className="text-muted">Provided script / brand lines</span>
                                <Textarea rows={4} value={avatarProductAdvancedControls.provided_script} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, provided_script: event.target.value }))} placeholder="Paste your rough draft or exact approved script here." />
                              </label>
                            ) : null}
                            {avatarProductAdvancedControls.script_mode === 'use_exact_script' ? (
                              <label className="flex items-center gap-3 text-sm text-text md:col-span-2">
                                <input
                                  type="checkbox"
                                  checked={avatarProductAdvancedControls.strict_script_lock}
                                  onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, strict_script_lock: event.target.checked }))}
                                  className="h-4 w-4 rounded border-[hsl(var(--color-border))]"
                                />
                                Keep the provided script locked. Only allow minimal scene/timing segmentation.
                              </label>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <Textarea
                  ref={textareaRef}
                  rows={4}
                  value={idea}
                  onChange={(event) => setIdea(event.target.value)}
                  placeholder={'Create a motivational reel about consistency\nGenerate a premium product image for Instagram\nCreate a story-based reel about a struggling creator'}
                  className="min-h-[96px] rounded-[18px] border-0 bg-transparent px-0.5 py-0.5 text-base leading-7 text-[hsl(var(--color-text))] shadow-none ring-0 outline-none placeholder:text-[hsl(var(--color-muted))] placeholder:text-[1.1rem] placeholder:leading-8 focus:border-0 focus:ring-0 focus-visible:ring-0 dark:text-white dark:placeholder:text-white/35 sm:min-h-[104px] sm:text-lg"
                />
              )}

              {mode === 'video' && idea.trim() && !recipeComposer ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {willAutoRouteToExplainer ? (
                    <>
                      <Badge variant="outline">Detected as: Deep explainer</Badge>
                      <p className="text-xs text-muted">
                        We’ll route this into the Deep Dive Explainer pipeline automatically for more scenes, longer narration, and a more visual explanation.
                      </p>
                    </>
                  ) : composerIntent !== 'generic' ? (
                    <>
                      <Badge variant="outline">
                        {composerIntent === 'cinematic' ? 'Detected as: Cinematic' : 'Detected as: Quick reel'}
                      </Badge>
                      <p className="text-xs text-muted">This stays on the standard freeform video path unless you choose a recipe.</p>
                    </>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-white/8 pt-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === 'assets' ? null : 'assets'))}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:text-white hover:bg-white/[0.08]"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {openMenu === 'assets' ? (
                      <div className="absolute left-0 top-[calc(100%+10px)] z-50 min-w-[250px] rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.99),hsl(var(--color-elevated)/0.98))] p-2.5 shadow-hard backdrop-blur-xl">
                        <div className="px-3 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Assets</p>
                          <p className="mt-1 text-xs text-muted">
                            {recipeComposer
                              ? 'Recipe mode uses its own upload slots. Keep AI Avatar here for UGC talking scenes.'
                              : 'Add one reference image for your next freeform image or video generation.'}
                          </p>
                        </div>
                        {!recipeComposer ? (
                          <button type="button" onClick={() => { setPendingUploadTarget('composer-asset'); fileInputRef.current?.click(); closeMenus(); }} className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm text-text hover:bg-[hsl(var(--color-bg)/0.7)]">
                            <Upload className="h-4 w-4" /> Upload reference image
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => {
                            closeMenus?.();
                            openAvatarPicker();
                          }}
                          className="flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm text-text hover:bg-[hsl(var(--color-bg)/0.7)]"
                        >
                          <UserRound className="h-4 w-4" /> AI Avatar
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (recipeSettingsLocked) return;
                        setOpenMenu((current) => (current === 'model' ? null : 'model'));
                      }}
                      disabled={recipeSettingsLocked}
                      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${
                        recipeSettingsLocked
                          ? 'cursor-not-allowed border-white/6 bg-white/[0.03] text-white/38'
                          : 'border-white/10 bg-white/[0.04] text-white/74 hover:bg-white/[0.08] hover:text-white'
                      }`}
                    >
                      <Box className="h-4 w-4 text-white/60" />
                      {currentModelLabel}
                      {recipeSettingsLocked ? <Lock className="h-3.5 w-3.5 text-white/40" /> : null}
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </button>
                    {openMenu === 'model' ? (
                      <div className="absolute left-0 top-[calc(100%+10px)] z-50 w-[min(92vw,760px)] rounded-[24px] border border-white/10 bg-[rgba(27,25,34,0.96)] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-[22px]">
                        <div className="px-2 pb-2">
                          <p className="text-[12px] font-semibold text-white/92">Model</p>
                        </div>
                        <div className="flex rounded-[14px] border border-white/8 bg-black/35 p-1">
                          {MODE_OPTIONS.map((option) => {
                            const Icon = option.icon;
                            const active = mode === option.key;
                            return (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() => handleModeChange(option.key)}
                                className={`flex-1 rounded-[12px] px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-white/[0.12] text-white' : 'text-white/48 hover:text-white/80'}`}
                              >
                                <span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5" /> {option.label}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
                          <div className="space-y-1.5">
                            {mode === 'video'
                              ? videoModels.map((model) => (
                                <ModelRow
                                  key={model.key}
                                  title={shortVideoModelLabel(model)}
                                  badges={[
                                    ...(model.resolutionLabels ?? []),
                                    ...(model.key === 'sora2' ? ['Premium'] : []),
                                    ...(model.key === 'fal_ltx23_i2v' ? ['Image to Video'] : []),
                                  ]}
                                  active={selectedVideoModelKey === model.key}
                                  disabled={model.enabled === false}
                                  onClick={() => {
                                    setSelectedVideoModelKey(model.key);
                                    setModelPanelKey(model.key);
                                    setQualityProfile(profileForVideoModel(model.key));
                                    setDurationPreference(getDefaultVideoDurationForModel(model.key));
                                    closeMenus();
                                  }}
                                  onHover={() => setModelPanelKey(model.key)}
                                />
                              ))
                              : imageModels.map((model) => (
                                <ModelRow
                                  key={model.key}
                                  title={model.label}
                                  badges={[
                                    qualityProfile === 'fast_social' ? '1K' : '1.5K',
                                    ...(model.badge ? [model.badge] : []),
                                  ]}
                                  active={selectedImageModelKey === model.key}
                                  onClick={() => {
                                    setSelectedImageModelKey(model.key);
                                    setModelPanelKey(model.key);
                                    setQualityProfile(profileForImageModel(model.key));
                                    closeMenus();
                                  }}
                                  onHover={() => setModelPanelKey(model.key)}
                                />
                              ))}
                          </div>
                          <div className="rounded-[20px] border border-white/8 bg-black/25 p-3">
                            {mode === 'video' && activeVideoModelDetail ? (
                              <div className="space-y-3">
                                <div>
                                  <p className="text-lg font-semibold text-white">{shortVideoModelLabel(activeVideoModelDetail)}</p>
                                  <p className="mt-1 text-xs text-white/52">{activeVideoModelDetail.qualityBadge ?? activeVideoModelDetail.description}</p>
                                </div>
                                <div className="space-y-2">
                                  {(activeVideoModelDetail.resolutionLabels ?? ['720p']).map((label) => (
                                    <button
                                      key={`${activeVideoModelDetail.key}-${label}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedVideoModelKey(activeVideoModelDetail.key);
                                        setModelPanelKey(activeVideoModelDetail.key);
                                        setQualityProfile(profileForVideoModel(activeVideoModelDetail.key));
                                        setDurationPreference(getDefaultVideoDurationForModel(activeVideoModelDetail.key));
                                        closeMenus();
                                      }}
                                      className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${selectedVideoModelKey === activeVideoModelDetail.key && selectedVideoResolution === '720p'
                                        ? 'border border-white/12 bg-white/[0.09]'
                                        : 'border border-transparent bg-white/[0.04] hover:bg-white/[0.07]'
                                        }`}
                                    >
                                      <div>
                                        <p className="text-sm font-semibold text-white">{shortVideoModelLabel(activeVideoModelDetail)}</p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                          <ModelCapabilityBadge label={label} />
                                          {activeVideoModelDetail.key === 'sora2' ? <ModelCapabilityBadge label="Premium" /> : null}
                                          {activeVideoModelDetail.key === 'fal_ltx23_i2v' ? <ModelCapabilityBadge label="Image to Video" /> : null}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-semibold text-white/92">~{creditPerSecondLabel(activeVideoModelDetail.key, label, activeVideoModelDetail.tier === 'premium' ? 'high' : 'standard')} credits</p>
                                        <p className="text-[11px] text-white/42">/sec</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {mode === 'image' && activeImageModelDetail ? (
                              <div className="space-y-3">
                                <div>
                                  <p className="text-lg font-semibold text-white">{activeImageModelDetail.label}</p>
                                  <p className="mt-1 text-xs text-white/52">{activeImageModelDetail.badge ?? activeImageModelDetail.provider ?? 'Image model'}</p>
                                </div>
                                <div className="space-y-2">
                                  {(['1024', '1536'] as const).map((resolution) => (
                                    <button
                                      key={`${activeImageModelDetail.key}-${resolution}`}
                                      type="button"
                                      onClick={() => {
                                        setSelectedImageModelKey(activeImageModelDetail.key);
                                        setModelPanelKey(activeImageModelDetail.key);
                                        setQualityProfile(resolution === '1024' ? 'fast_social' : 'creator_quality');
                                        closeMenus();
                                      }}
                                      className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${selectedImageModelKey === activeImageModelDetail.key && selectedImageResolution === resolution
                                        ? 'border border-white/12 bg-white/[0.09]'
                                        : 'border border-transparent bg-white/[0.04] hover:bg-white/[0.07]'
                                        }`}
                                    >
                                      <div>
                                        <p className="text-sm font-semibold text-white">{activeImageModelDetail.label}</p>
                                        <div className="mt-1 flex flex-wrap gap-1.5">
                                          <ModelCapabilityBadge label={resolution === '1024' ? '1K' : '1.5K'} />
                                          {activeImageModelDetail.badge ? <ModelCapabilityBadge label={activeImageModelDetail.badge} /> : null}
                                        </div>
                                      </div>
                                      <div className="text-right">
                                        <p className="text-sm font-semibold text-white/92">~{imageCreditsLabel(activeImageModelDetail.key, resolution)} credits</p>
                                        <p className="text-[11px] text-white/42">/image</p>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>
                        {modelsLoading ? (
                          <p className="mt-3 px-2 text-xs text-white/46">Refreshing model catalog…</p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === 'aspect' ? null : 'aspect'))}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:text-white hover:bg-white/[0.08]"
                    >
                      <RectangleHorizontal className="h-4 w-4 text-white/60" />
                      {aspectRatio}
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </button>
                    {openMenu === 'aspect' ? (
                      <div className="absolute left-0 top-[calc(100%+10px)] z-50 min-w-[220px] rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.99),hsl(var(--color-elevated)/0.98))] p-2.5 shadow-hard backdrop-blur-xl">
                        <div className="px-3 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Format</p>
                          <p className="mt-1 text-xs text-muted">Pick the output frame that best fits your social placement.</p>
                        </div>
                        {ASPECT_OPTIONS.map((option) => (
                          <button
                            key={option}
                            type="button"
                            onClick={() => { setAspectRatio(option); closeMenus(); }}
                            className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2.5 text-sm transition ${aspectRatio === option ? 'bg-[hsl(var(--color-accent)/0.12)] text-text' : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'}`}
                          >
                            <span>{option}</span>
                            {aspectRatio === option ? <Check className="h-4 w-4 text-[hsl(var(--color-accent))]" /> : null}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  {isAvatarDrivenRecipe ? (
                    <button
                      type="button"
                      onClick={openAvatarPicker}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:text-white hover:bg-white/[0.08]"
                    >
                      {selectedAvatar?.imageUrl ? (
                        <img src={selectedAvatar.imageUrl} alt={selectedAvatar.name} className="h-5 w-5 rounded-full object-cover" />
                      ) : (
                        <UserRound className="h-4 w-4 text-white/60" />
                      )}
                      {selectedAvatar ? selectedAvatar.name : 'Select AI Avatar'}
                      {isAvatarProductRecipe ? <Lock className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                    </button>
                  ) : null}

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === 'more' ? null : 'more'))}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:text-white hover:bg-white/[0.08]"
                    >
                      <EllipsisIcon />
                      More
                    </button>
                    {openMenu === 'more' ? (
                      <div className="absolute left-0 top-[calc(100%+10px)] z-50 min-w-[280px] rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.99),hsl(var(--color-elevated)/0.98))] p-2.5 shadow-hard backdrop-blur-xl">
                        <div className="px-3 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">More</p>
                          <p className="mt-1 text-xs text-muted">
                            {recipeSettingsLocked
                              ? 'Recipe mode keeps quality, duration, captions, and narration locked to the workflow defaults.'
                              : 'Tune clip length, narration, and captions without leaving the composer.'}
                          </p>
                        </div>
                        <div className="rounded-[14px] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Quality</p>
                            {recipeSettingsLocked ? <span className="text-[11px] text-muted">Recipe controlled</span> : null}
                          </div>
                          <div className="mt-2 grid gap-1">
                            {visibleQualityProfiles.map((option) => {
                              const disabled = recipeSettingsLocked;
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => {
                                    if (disabled) return;
                                    setQualityProfile(option.key);
                                  }}
                                  disabled={disabled}
                                  className={`flex items-start justify-between rounded-[12px] px-2 py-2 text-left text-sm ${
                                    qualityProfile === option.key
                                      ? 'bg-[hsl(var(--color-accent)/0.12)] text-text'
                                      : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'
                                  } ${disabled ? 'cursor-not-allowed opacity-65' : ''}`}
                                >
                                  <span>
                                    <span className="block font-semibold text-inherit">{option.label}</span>
                                    <span className="mt-0.5 block text-xs text-muted">{option.helper}</span>
                                  </span>
                                  {qualityProfile === option.key ? <Check className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" /> : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="rounded-[14px] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Duration</p>
                            {recipeSettingsLocked ? (
                              <span className="text-[11px] text-muted">
                                {isAvatarProductRecipe ? '15s · recipe controlled' : isRecipeLongForm ? 'Auto · recipe controlled' : 'Recipe controlled'}
                              </span>
                            ) : null}
                          </div>
                          {recipeSettingsLocked && isAvatarProductRecipe ? (
                            <div className="mt-2 rounded-[12px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.52)] px-3 py-3 text-sm text-text">
                              <p className="font-semibold">15 second recipe flow</p>
                              <p className="mt-1 text-xs leading-5 text-muted">
                                Avatar Product currently renders as three planned scenes of about 5 seconds each. The generic 5s and 10s options do not override this recipe.
                              </p>
                            </div>
                          ) : (
                            <div className="mt-2 grid gap-1">
                              {(['auto', '5', '10'] as const).map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    if (recipeSettingsLocked) return;
                                    setDurationPreference(option);
                                  }}
                                  disabled={recipeSettingsLocked}
                                  className={`flex items-center justify-between rounded-[12px] px-2 py-2 text-sm ${
                                    durationPreference === option ? 'bg-[hsl(var(--color-accent)/0.12)] text-text' : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'
                                  } ${recipeSettingsLocked ? 'cursor-not-allowed opacity-65' : ''}`}
                                >
                                  <span>{option === 'auto' ? 'Auto' : `${option}s`}</span>
                                  {durationPreference === option ? <Check className="h-4 w-4 text-[hsl(var(--color-accent))]" /> : null}
                                </button>
                              ))}
                            </div>
                          )}
                          {recipeSettingsLocked && activeRecipeDurationSeconds && !isAvatarProductRecipe ? (
                            <p className="mt-2 px-2 text-xs text-muted">
                              This recipe renders about {activeRecipeDurationSeconds}s in its own planned scene structure.
                            </p>
                          ) : null}
                        </div>
                        <div className="mt-1 border-t border-[hsl(var(--color-border)/0.6)] px-3 py-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (recipeSettingsLocked) return;
                              setVoiceEnabled((current) => !current);
                            }}
                            disabled={recipeSettingsLocked}
                            className={`flex w-full items-center justify-between rounded-[12px] px-2 py-2 text-sm text-text hover:bg-[hsl(var(--color-bg)/0.7)] ${
                              recipeSettingsLocked ? 'cursor-not-allowed opacity-65' : ''
                            }`}
                          >
                            <span>Voice</span>
                            <span className="text-xs text-muted">{voiceEnabled ? 'On' : 'Off'}</span>
                          </button>
                          {voiceEnabled && languageOptions.length > 0 ? (
                            <label className="mt-2 block px-2">
                              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Language</span>
                              <select
                                value={selectedLanguage}
                                onChange={(event) => setSelectedLanguage(event.target.value)}
                                className="w-full rounded-[12px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.72)] px-3 py-2 text-sm text-text outline-none transition focus:border-[hsl(var(--color-accent)/0.5)]"
                              >
                                {languageOptions.map((option) => (
                                  <option key={`${option.code}-${option.label}`} value={option.code}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {voiceEnabled && avatarGenderFilteredVoiceOptions.length > 0 ? (
                            <label className="mt-3 block px-2">
                              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Voice</span>
                              <select
                                value={selectedVoice}
                                onChange={(event) => setSelectedVoice(event.target.value)}
                                disabled={avatarVoiceLocked}
                                className="w-full rounded-[12px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.72)] px-3 py-2 text-sm text-text outline-none transition focus:border-[hsl(var(--color-accent)/0.5)]"
                              >
                                {avatarGenderFilteredVoiceOptions.map((option) => (
                                  <option key={option.key} value={option.key}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {avatarVoiceLocked ? (
                            <p className="mt-2 px-2 text-xs leading-5 text-muted">
                              Voice is locked to the selected AI avatar for avatar-driven talking scenes.
                            </p>
                          ) : null}
                          {voiceEnabled ? (
                            <div className="mt-3 px-2">
                              <Button
                                type="button"
                                variant="secondary"
                                className="h-9 w-full rounded-[12px]"
                                onClick={() => void previewComposerVoice()}
                                disabled={voicePreviewing || !selectedVoice || !composerVoicePreviewText}
                              >
                                {voicePreviewing ? 'Previewing…' : 'Preview voice'}
                              </Button>
                              <p className="mt-2 text-xs leading-5 text-muted">
                                {composerVoicePreviewText
                                  ? 'Preview reads a short cleaned version of your current prompt with the selected Sarvam voice.'
                                  : 'Add a prompt to preview this voice.'}
                              </p>
                              {voicePreviewMessage ? <p className="mt-2 text-xs text-muted">{voicePreviewMessage}</p> : null}
                              {voicePreviewUrl ? <audio className="mt-3 w-full" controls src={voicePreviewUrl} /> : null}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              if (recipeSettingsLocked) return;
                              setCaptionsEnabled((current) => !current);
                            }}
                            disabled={recipeSettingsLocked}
                            className={`flex w-full items-center justify-between rounded-[12px] px-2 py-2 text-sm text-text hover:bg-[hsl(var(--color-bg)/0.7)] ${
                              recipeSettingsLocked ? 'cursor-not-allowed opacity-65' : ''
                            }`}
                          >
                            <span>Captions</span>
                            <span className="text-xs text-muted">{captionsEnabled ? 'On' : 'Off'}</span>
                          </button>
                          {recipeSettingsLocked && isAvatarProductRecipe ? (
                            <p className="mt-2 px-2 text-xs leading-5 text-muted">
                              Captions stay on for this recipe and are applied from the final script during export. They are readable burned-in overlays, not word-level synced subtitles yet.
                            </p>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>

                </div>

                <Button
                  type="button"
                  onClick={() => void launchUnifiedFlow()}
                  disabled={loading}
                  className="h-12 rounded-full border-0 bg-[linear-gradient(to_right,#818cf8,#a855f7)] px-6 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.24)] hover:opacity-95"
                >
                  {loading ? (
                    'Preparing…'
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Play className="h-4 w-4 fill-current" />
                      Generate
                    </span>
                  )}
                </Button>
              </div>
            </div>

            <div className="pt-0.5 text-[12px] text-muted">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/6 bg-transparent px-2.5 py-1 text-white/58">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                  {activeRecipeLabel ? 'Start with a recipe. Refine it in the composer.' : `${currentModelLabel} · ${currentModelHint || currentProfileLabel}. You can refine this later.`}
                </span>
                {latestGeneratedImage ? (
                  <button
                    type="button"
                    onClick={() => setImageResultOpen(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                    Open last image
                  </button>
                ) : null}
                {uploadedComposerAsset?.previewUrl ? (
                  <button
                    type="button"
                    onClick={() => setUploadedComposerAsset(null)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                  >
                    <img src={uploadedComposerAsset.previewUrl} alt={uploadedComposerAsset.label} className="h-4 w-4 rounded-full object-cover" />
                    Remove reference
                  </button>
                ) : null}
                <Link
                  href="/library"
                  onClick={(event) => navigateWithComposerLoader(event, '/library', 'library')}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Open library
                </Link>
                <Link
                  href="/projects"
                  onClick={(event) => navigateWithComposerLoader(event, '/projects', 'projects')}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-white/78 transition hover:bg-white/[0.08] hover:text-white"
                >
                  Open projects
                </Link>
              </div>
            </div>

            <Modal open={Boolean(assetPicker)} onClose={() => setAssetPicker(null)}>
              {assetPicker ? (
                <div className="grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]">
                  <div className="rounded-[20px] border border-[hsl(var(--color-border)/0.76)] bg-[hsl(var(--color-bg)/0.55)] p-2">
                    <button
                      type="button"
                      onClick={() => {
                        openUploadPickerForTarget(assetPicker.slotId);
                      }}
                      className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm text-text transition hover:bg-[hsl(var(--color-bg)/0.7)]"
                    >
                      <Upload className="h-4 w-4" />
                      Upload
                    </button>
                    <Link
                      href="/influencer"
                      onClick={() => setAssetPicker(null)}
                      className="flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm text-text transition hover:bg-[hsl(var(--color-bg)/0.7)]"
                    >
                      <UserRound className="h-4 w-4" />
                      Virtual avatar
                    </Link>
                    <button
                      type="button"
                      disabled
                      className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-sm text-muted opacity-70"
                    >
                      <Sparkles className="h-4 w-4" />
                      AI generate soon
                    </button>
                  </div>

                  <div className="rounded-[20px] border border-[hsl(var(--color-border)/0.76)] bg-[hsl(var(--color-bg)/0.5)] p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">{assetPicker.slotLabel}</p>
                    {assetPicker.samplePreviewUrl ? (
                      <div className="mt-3 overflow-hidden rounded-[18px] border border-[hsl(var(--color-border)/0.72)] bg-black/30">
                        <img src={assetPicker.samplePreviewUrl} alt={assetPicker.sampleLabel || assetPicker.slotLabel} className="h-[220px] w-full object-cover" />
                      </div>
                    ) : (
                      <div className="mt-3 flex h-[220px] items-center justify-center rounded-[18px] border border-dashed border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.4)] text-sm text-muted">
                        No preview yet
                      </div>
                    )}
                    <Button
                      type="button"
                      className="mt-3 w-full rounded-[16px] py-3 text-sm font-semibold"
                      disabled={!assetPicker.samplePreviewUrl}
                      onClick={() => {
                        if (!assetPicker.samplePreviewUrl) return;
                        applySlotAsset(assetPicker.slotId, {
                          label: assetPicker.sampleLabel || assetPicker.slotLabel,
                          previewUrl: assetPicker.samplePreviewUrl,
                          assetUrl: assetPicker.samplePreviewUrl,
                          source: 'sample',
                        });
                      }}
                    >
                      Use this image
                    </Button>
                  </div>
                </div>
              ) : null}
            </Modal>

            {error ? (
              <div className="rounded-[18px] border border-[hsl(var(--color-danger)/0.5)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">
                {error}
              </div>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;

              const uploadTarget = pendingUploadTarget;

              try {
                if (uploadTarget && uploadTarget !== 'composer-asset') {
                  const uploaded = await api.uploadFileDirect({ file, kind: 'recipe_input' }, userId);

                  applySlotAsset(uploadTarget, {
                    label: file.name,
                    previewUrl: uploaded.public_url,
                    assetUrl: uploaded.public_url,
                    source: 'upload',
                  });

                  show({
                    title: 'Image attached',
                    message: 'Your recipe input is ready to use.',
                    variant: 'success',
                  });
                } else {
                  const uploaded = await api.uploadFileDirect({ file, kind: 'reference' }, userId);
                  setUploadedAssetName(file.name);
                  setUploadedComposerAsset({
                    label: file.name,
                    previewUrl: uploaded.public_url,
                    assetUrl: uploaded.public_url,
                    source: 'upload',
                  });
                  setAssetPicker(null);
                  show({
                    title: 'Reference image attached',
                    message: 'We will use this as one visual reference for your next freeform image or video generation.',
                    variant: 'success',
                  });
                }
              } catch (uploadError) {
                const message = getFriendlyErrorMessage(uploadError) || 'Could not upload that image.';
                setError(message);
                show({ title: 'Upload failed', message, variant: 'error' });
              } finally {
                setPendingUploadTarget(null);
                input.value = '';
              }
            }}
          />
        </section>
      </section>

      <section className="space-y-5 pt-0.5">
        <div className="sticky top-[84px] z-10 -mx-2 rounded-[24px] border border-[hsl(var(--color-border)/0.5)] bg-[hsl(var(--color-bg)/0.82)] px-2 py-3 backdrop-blur-xl sm:top-[92px] sm:-mx-3 sm:px-3 xl:top-6 xl:mx-0 xl:px-0 xl:py-0 xl:border-0 xl:bg-transparent xl:backdrop-blur-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Recipes</p>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Recipes</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted">Start with proven video formats. Pick a recipe and create instantly.</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {RECIPE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setRecipeTab(tab.key)}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition ${recipeTab === tab.key ? 'border border-[hsl(var(--color-accent)/0.34)] bg-[hsl(var(--color-accent)/0.18)] text-text' : 'border border-[hsl(var(--color-border)/0.74)] bg-[hsl(var(--color-surface)/0.72)] text-muted hover:text-text'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {recipeTab === 'inspiration_photos' ? (
          loadingInspirationPhotos ? (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={`inspiration-skeleton-${index}`}
                  className={`mb-4 break-inside-avoid animate-pulse rounded-[28px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.55)] ${index % 4 === 0 ? 'h-[340px]' : index % 4 === 1 ? 'h-[460px]' : index % 4 === 2 ? 'h-[390px]' : 'h-[520px]'
                    }`}
                />
              ))}
            </div>
          ) : (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
              {inspirationPhotoCards.map((item) => (
                <ComposerPoster
                  key={item.id}
                  title={item.title}
                  previewUrl={item.previewUrl}
                  onClick={() => setSelectedInspirationPhoto(item)}
                  badge={item.badge}
                  ctaLabel="Use this style"
                />
              ))}
            </div>
          )
        ) : loadingRecipes ? (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                key={`recipe-skeleton-${index}`}
                className={`mb-4 break-inside-avoid animate-pulse rounded-[28px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.55)] ${index % 4 === 0 ? 'h-[340px]' : index % 4 === 1 ? 'h-[460px]' : index % 4 === 2 ? 'h-[390px]' : 'h-[520px]'
                  }`}
              />
            ))}
          </div>
        ) : (
          <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
            {filteredRecipes.map((recipe) => (
              <ComposerPoster
                key={recipe.id}
                title={recipe.title}
                previewUrl={recipe.previewUrl}
                previewVideoUrl={recipe.previewVideoUrl}
                onClick={() => setSelectedRecipe(recipe)}
                badge={recipe.badge}
                ctaLabel="Use this recipe"
              />
            ))}
          </div>
        )}
      </section>

      {latestGeneratedImage ? (
        <ImageDetailModal
          open={imageResultOpen}
          onClose={() => setImageResultOpen(false)}
          imageUrl={latestGeneratedImage.image_url}
          imageAlt={latestGeneratedImage.prompt}
          title="Image ready"
          prompt={latestGeneratedImage.prompt}
          imageAspectRatio={aspectRatioToCss(latestGeneratedImage.aspect_ratio)}
          badges={
            <>
              <Badge variant="outline">AI image</Badge>
              <Badge variant="outline">{latestGeneratedImage.model_key}</Badge>
              <Badge variant="outline">{latestGeneratedImage.aspect_ratio}</Badge>
              <Badge variant="outline">{latestGeneratedImage.resolution}</Badge>
              {latestGeneratedImage.is_public_inspiration ? <Badge variant="outline">{latestGeneratedImage.moderation_status}</Badge> : null}
            </>
          }
          actions={
            <>
              <Button
                type="button"
                variant="secondary"
                onClick={() => void toggleGeneratedImagePublish(latestGeneratedImage)}
                disabled={publishingImageId === latestGeneratedImage.id}
              >
                {publishingImageId === latestGeneratedImage.id
                  ? 'Updating...'
                  : latestGeneratedImage.is_public_inspiration
                    ? 'Unpublish'
                    : 'Publish to inspiration'}
              </Button>
              <a href={latestGeneratedImage.image_url} target="_blank" rel="noreferrer" className="flex-1 sm:flex-none">
                <Button type="button" className="w-full rounded-[16px] py-3 text-sm font-semibold">
                  Open full image
                </Button>
              </a>
              <Link
                href="/library"
                className="flex-1 sm:flex-none"
                onClick={(event) => navigateWithComposerLoader(event, '/library', 'library')}
              >
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full rounded-[16px] py-3 text-sm font-semibold"
                >
                  Open library
                </Button>
              </Link>
            </>
          }
        />
      ) : null}

      <Modal open={Boolean(selectedRecipe)} onClose={() => setSelectedRecipe(null)}>
        {selectedRecipe ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.75)]">
              {selectedRecipe.previewVideoUrl ? (
                <video
                  src={selectedRecipe.previewVideoUrl}
                  poster={selectedRecipe.previewUrl}
                  controls
                  className="w-full bg-black object-contain"
                  style={{ aspectRatio: aspectRatioToCss(selectedRecipe.aspectRatio) }}
                  preload="metadata"
                />
              ) : (
                <img src={selectedRecipe.previewUrl} alt={selectedRecipe.title} className="w-full object-cover" style={{ aspectRatio: aspectRatioToCss(selectedRecipe.aspectRatio) }} />
              )}
            </div>
            <div className="flex h-full flex-col rounded-[24px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.82)] p-5">
              <div className="space-y-4">
                {selectedRecipe.badge ? <Badge variant="outline">{selectedRecipe.badge}</Badge> : null}
                <div>
                  <h3 className="font-heading text-3xl font-extrabold tracking-tight text-text">{selectedRecipe.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{selectedRecipe.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted">
                  <Badge variant="outline">AI video</Badge>
                  {selectedRecipe.credits ? <Badge variant="outline">≈ {selectedRecipe.credits} credits</Badge> : null}
                  {selectedRecipe.helper ? <Badge variant="outline">{selectedRecipe.helper}</Badge> : null}
                </div>
              </div>
              <div className="mt-auto pt-6">
                <Button type="button" onClick={() => applyRecipeToComposer(selectedRecipe)} className="w-full rounded-[16px] py-3 text-sm font-semibold">
                  {recipeModalCopy(selectedRecipe)}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {selectedInspirationPhoto ? (
        <ImageDetailModal
          open={Boolean(selectedInspirationPhoto)}
          onClose={() => setSelectedInspirationPhoto(null)}
          imageUrl={selectedInspirationPhoto.previewUrl}
          imageAlt={selectedInspirationPhoto.title}
          title={selectedInspirationPhoto.title}
          prompt={selectedInspirationPhoto.prompt}
          imageAspectRatio={aspectRatioToCss(selectedInspirationPhoto.aspectRatio)}
          badges={
            <>
              {selectedInspirationPhoto.badge ? <Badge variant="outline">{selectedInspirationPhoto.badge}</Badge> : null}
              <Badge variant="outline">{selectedInspirationPhoto.creatorName}</Badge>
              <Badge variant="outline">{selectedInspirationPhoto.modelKey}</Badge>
            </>
          }
          actions={
            <Button type="button" onClick={() => applyInspirationPhotoToComposer(selectedInspirationPhoto)} className="w-full rounded-[16px] py-3 text-sm font-semibold sm:w-auto">
              Use this style
            </Button>
          }
        />
      ) : null}

      <CreateCustomAvatarModal
        open={showCreateCustomAvatarModal}
        onClose={() => setShowCreateCustomAvatarModal(false)}
        userId={userId}
        uploadImage={async (file) => {
          const uploaded = await api.uploadFileDirect(
            { file, kind: 'avatar_source' },
            userId,
          );

          return {
            publicUrl: uploaded.public_url,
          };
        }}
        onAvatarCreated={(avatar) => {
          setSelectedAvatar({
            personaId: avatar.avatarId,
            name: avatar.name,
            imageUrl: avatar.imageUrl,
            source: 'saved',
            sourceLabel: 'Saved',
            isCustomAvatar: true,
            genderPresentation: avatar.gender,
            preferredVoice: avatar.preferredVoice || null,
            preferredLanguage: avatar.preferredLanguage || null,
            languageTags: avatar.preferredLanguage ? [avatar.preferredLanguage] : [],
            styleLabel: 'Custom avatar',
            languageInfo: selectedLanguageLabel || null,
            voiceInfo: avatar.preferredVoice ? `${avatar.preferredVoice} voice selected` : 'Uses your selected Sarvam voice',
            previewVideoUrl: null,
            description: `${avatar.name} is now available as a reusable saved avatar for talking scenes.`,
          });
          setSavedAvatars((current) => [
            {
              id: avatar.avatarId,
              name: avatar.name,
              scope: 'own',
              style: 'custom_avatar',
              provider: 'heygen',
              provider_api_version: 'v2_photo_avatar',
              avatar_family: 'avatar_iv',
              avatar_type: 'photo_avatar',
              ownership: 'private',
              supports_avatar_video_generation: true,
              gender: avatar.gender,
              language_tags: avatar.preferredLanguage ? [avatar.preferredLanguage] : [],
              thumbnail_url: avatar.imageUrl,
              tags: ['custom', 'ugc'],
              category: 'custom_avatar',
              reference_images: avatar.referenceImages,
              primary_image: avatar.referenceImages[0] || avatar.imageUrl,
              preview_video_url: null,
              recommended_voice: avatar.preferredVoice || null,
              status: 'ready_for_preview',
              description: `${avatar.name} is now available as a reusable saved avatar for talking scenes.`,
            },
            ...current.filter((item) => item.id !== avatar.avatarId),
          ]);

          show({
            title: 'Avatar created',
            message: `${avatar.name} is now available in your saved personas.`,
            variant: 'success',
          });
        }}
        onPreviewCompleted={(preview) => {
          setSavedAvatars((current) =>
            current.map((avatar) =>
              avatar.id === preview.avatarId
                ? {
                    ...avatar,
                    preview_video_url: preview.videoUrl,
                  }
                : avatar,
            ),
          );
          setSelectedAvatar((current) =>
            current?.personaId === preview.avatarId
              ? {
                  ...current,
                  previewVideoUrl: preview.videoUrl,
                }
              : current,
          );
          show({
            title: 'Preview ready',
            message: 'Your talking avatar preview has been generated successfully.',
            variant: 'success',
          });
        }}
      />
    </div>
  );
}

function EllipsisIcon() {
  return <span className="text-base leading-none">…</span>;
}
