'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import {
  Box,
  Check,
  ChevronDown,
  LayoutTemplate,
  LoaderCircle,
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
import { LandingVideo } from '@/components/landing/LandingVideo';
import { ImageDetailModal } from '@/components/ui/ImageDetailModal';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { buildVideoModelsForApiFallback, getNormalVideoFamilyConfigs, getVideoModelMap } from '@/config/videoModels';
import creditEngine from '@/config/creditEngine';
import { TEMPLATE_OPTIONS } from '@/components/videos/create/constants';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import { calculateVideoCredits } from '@/lib/pricingEstimates';
import { isVideoInspiration, sortPublicInspiration, type PublicInspirationItem } from '@/lib/inspiration';
import type {
  AIVideoModel,
  Avatar,
  AvatarProductAssistResponse,
  AvatarLibraryResponse,
  GeneratedImage,
  ImageModel,
  InspirationImage,
  InspirationVideo,
  RecipeCatalog,
  TTSCatalogResponse,
  TTSLanguageOption,
  TTSVoiceOption,
  VideoCreateRequest,
} from '@/types/api';


type ComposerMode = 'image' | 'video';
type ResolvedMode = 'image' | 'video';
type AudioMode = 'silent' | 'auto_scene_sound';
type QualityProfile = 'fast_social' | 'creator_quality' | 'affordable' | 'standard' | 'high_quality' | 'premium';
type RecipeTab = 'all' | 'ads' | 'explainer' | 'inspiration_photos';
type InspirationTabFilter = 'all' | 'image' | 'video';
type OpenMenu = 'assets' | 'model' | 'aspect' | 'more' | null;
type RecentEntryKind = 'recipe' | 'draft';
type RecipeSlotKind = 'text' | 'upload' | 'avatar' | 'select' | 'reference-image';
type RecipeSourceKind = 'recipe';
type VideoIntent = 'explainer' | 'cinematic' | 'quick_reel' | 'generic';
type VideoGenerationMode = 'text_to_video' | 'image_to_video';
type ComposerPromptMode = 'prompt' | 'json';
type StructuredPromptShape = 'object' | 'array';
type StructuredPromptValue = Record<string, unknown> | Array<Record<string, unknown>>;


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
  submitTarget?: 'image' | 'video' | 'text' | string;
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
  initialDurationSeconds: string;
  initialCaptionsEnabled: boolean;
  initialNarrationEnabled: boolean;
};

type AspectRatio = '9:16' | '16:9' | '1:1';

type ParsedStructuredPrompt = {
  raw: StructuredPromptValue;
  shape: StructuredPromptShape;
  shotCount: number;
  assetCount: number;
  summary: string;
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
  previewVideoUrl: string | null;
  creatorName: string;
  modelKey: string;
  createdAt: string;
  badge: string | null;
  raw: PublicInspirationItem;
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
  mediaKind?: 'image' | 'video';
  analysis?: {
    durationSeconds: number;
    billedDurationSeconds: number;
    hasAudio: boolean;
  } | null;
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



type AssetPickerState = {
  slotId: string;
  slotLabel: string;
  sampleLabel?: string;
  samplePreviewUrl?: string | null;
  left: number;
  top: number;
};


type AvatarProductAdvancedControls = {
  product_category: string;
  product_subcategory: string;
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

  video_model_key: string;
  quality_profile: string;
};


type ActiveRecipeSource =
  | { kind: 'recipe'; recipe: RecipeCard }
  | null;

const MODE_OPTIONS: Array<{ key: ComposerMode; label: string; icon: typeof Wand2 }> = [
  { key: 'image', label: 'Image', icon: Sparkles },
  { key: 'video', label: 'Video', icon: Video },
];
const COMPOSER_PROMPT_MAX_CHARS = 2000;
const COMPOSER_JSON_EXAMPLE = `{
  "shot": {
    "composition": "POV time-freeze with hands moving through frozen environment",
    "lens": "ultra-wide cinematic lens with subtle distortion",
    "camera_movement": "slow walk, precise hand movements, sudden time release burst"
  },
  "subject": {
    "description": "person moving while everything else is frozen mid-action"
  },
  "scene": {
    "location": "busy city street",
    "environment": "people frozen mid-motion, objects suspended in air"
  }
}`;

const QUALITY_PROFILES: Array<{ key: QualityProfile; label: string; helper: string }> = [
  { key: 'fast_social', label: 'Fast Social', helper: 'Best for quick image concepts and fast iterations' },
  { key: 'creator_quality', label: 'Creator Quality', helper: 'More polished image output for standout posts' },
  { key: 'affordable', label: 'Affordable', helper: 'Most-Popular, budget-friendly avatar product ads using Seedance Lite' },
  { key: 'standard', label: 'Standard', helper: 'Affordable UGC quality for avatar/product videos' },
  { key: 'high_quality', label: 'High Quality', helper: 'Better motion and product clarity' },
  { key: 'premium', label: 'Premium', helper: 'Highest reference consistency. Costs more credits.' },
];

const VIDEO_MODEL_FALLBACK = buildVideoModelsForApiFallback();
const VIDEO_MODEL_MAP = getVideoModelMap();
const NORMAL_VIDEO_FAMILIES = getNormalVideoFamilyConfigs();
const NORMAL_VIDEO_FAMILY_MAP = Object.fromEntries(NORMAL_VIDEO_FAMILIES.map((family) => [family.key, family]));
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

const COMPOSER_SNAPSHOT_KEY = 'rangmanch:create:catalog-snapshot:v1';

type ComposerCatalogSnapshot = {
  recipes: RecipeCatalog[];
  videoModels: AIVideoModel[];
  imageModels: ImageModel[];
  storedAt: number;
};

function readComposerCatalogSnapshot(): ComposerCatalogSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(COMPOSER_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ComposerCatalogSnapshot;
    if (!Array.isArray(parsed.recipes) || !Array.isArray(parsed.videoModels) || !Array.isArray(parsed.imageModels)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeComposerCatalogSnapshot(snapshot: ComposerCatalogSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(COMPOSER_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch {
    // Ignore quota or private-mode failures.
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function countStructuredPromptAssets(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((total, item) => total + countStructuredPromptAssets(item), 0);
  if (!isPlainObject(node)) return 0;
  return Object.entries(node).reduce((total, [key, value]) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.startsWith('https://') && /(?:image|video|asset|url|reference)/i.test(key)) {
        return total + 1;
      }
      return total;
    }
    return total + countStructuredPromptAssets(value);
  }, 0);
}

function parseStructuredPromptInput(raw: string): ParsedStructuredPrompt | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as unknown;

  if (Array.isArray(parsed)) {
    if (!parsed.length) throw new Error('JSON shot array cannot be empty.');
    if (!parsed.every((item) => isPlainObject(item))) {
      throw new Error('JSON shot arrays must contain only objects.');
    }
    return {
      raw: parsed as Array<Record<string, unknown>>,
      shape: 'array',
      shotCount: parsed.length,
      assetCount: countStructuredPromptAssets(parsed),
      summary: `Structured JSON detected · ${parsed.length} shot${parsed.length === 1 ? '' : 's'} parsed`,
    };
  }

  if (isPlainObject(parsed)) {
    const nestedShots = Array.isArray(parsed.shots) ? parsed.shots.filter((item) => isPlainObject(item)).length : 0;
    return {
      raw: parsed,
      shape: 'object',
      shotCount: nestedShots || 1,
      assetCount: countStructuredPromptAssets(parsed),
      summary: `Structured JSON detected · ${nestedShots || 1} shot${nestedShots === 1 || nestedShots === 0 ? '' : 's'} parsed`,
    };
  }

  throw new Error('JSON mode expects either one object or an array of shot objects.');
}

const ASPECT_OPTIONS: AspectRatio[] = ['9:16', '16:9', '1:1'];

function normalizeAspectRatio(value: string | null | undefined): AspectRatio {
  return value === '16:9' || value === '1:1' || value === '9:16' ? value : '9:16';
}
const RECENT_STORAGE_KEY = 'rangmanch:create-hub:recent:v1';
const DEFAULT_AVATAR_PRODUCT_ADVANCED_CONTROLS: AvatarProductAdvancedControls = {
  product_category: '',
  product_subcategory: '',
  campaign_objective: '',
  platform: 'Instagram Reels',
  duration_seconds: '10',
  brand_tone: 'creator_casual',
  cta_preference: '',
  language: 'Hindi (India)',
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

  video_model_key: 'seedance_v1_lite_reference',
  quality_profile: 'affordable',
};

const AVATAR_PRODUCT_CATEGORY_BACKEND_MAP: Record<string, string> = {
  clothing: 'fashion_footwear',
  footwear: 'fashion_footwear',
  bags_accessories: 'fashion_footwear',
  jewellery: 'fashion_footwear',
  beauty_skincare: 'skincare_beauty',
  food_beverage: 'food_snacks',
  electronics: 'electronics_gadgets',
  home_decor: 'home_kitchen',
  fitness_wellness: 'health_wellness',
  kids_toys: 'baby_kids',
  other: 'generic_ecommerce',
};

const AVATAR_PRODUCT_CATEGORY_OPTIONS = [
  { value: 'clothing', label: 'Clothing / Fashion' },
  { value: 'jewellery', label: 'Jewellery' },
  { value: 'beauty_skincare', label: 'Beauty / Skincare' },
  { value: 'food_beverage', label: 'Food / Beverage' },
  { value: 'electronics', label: 'Electronics / Gadgets' },
  { value: 'home_decor', label: 'Home / Decor' },
  { value: 'fitness_wellness', label: 'Fitness / Wellness' },
  { value: 'kids_toys', label: 'Kids / Toys' },
  { value: 'footwear', label: 'Footwear' },
  { value: 'bags_accessories', label: 'Bags / Accessories' },
  { value: 'other', label: 'Other' },
];

const RECIPE_TABS: Array<{ key: RecipeTab; label: string; icon?: typeof LayoutTemplate }> = [
  { key: 'all', label: 'All' },
  { key: 'ads', label: 'Ads' },
  { key: 'explainer', label: 'Explainer' },
  { key: 'inspiration_photos', label: 'Inspiration' },
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

function buildPixverseFreeformPrompt(prompt: string) {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (!normalized) return '@subject';
  if (/@subject\b/i.test(normalized)) return normalized;
  return `@subject ${normalized}`;
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
  audioMode?: AudioMode;
  personaId?: string;
  useAvatarForTalkingScenes?: boolean;
} | {
  type: 'freeform';
  templateLabel: string;
  script?: string;
  modelKey: string;
  modelFamily: string;
  generationMode: VideoGenerationMode;
  lane: 'creator_pro' | 'premium';
  promptMode?: ComposerPromptMode;
  structuredPrompt?: StructuredPromptValue;
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution: '360p' | '480p' | '540p' | '720p' | '1080p' | '1440p' | '2160p' | '4K';
  quality: 'standard' | 'high' | 'premium';
  durationSeconds: number;
  captionsEnabled: boolean;
  narrationEnabled: boolean;
  audioMode?: AudioMode;
  language: string;
  voice: string;
  imageUrl?: string | null;
  imageReferences?: Array<{
    ref_name: string;
    type: string;
    image_url: string;
  }>;
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
      audioMode: input.audioMode,
      personaId: input.personaId,
      useAvatarForTalkingScenes: input.useAvatarForTalkingScenes,
    };
  }

  return {
    template: input.templateLabel,
    script: input.script
      ? (input.modelFamily === 'pixverse_c1_reference' ? buildPixverseFreeformPrompt(input.script) : input.script)
      : undefined,
    promptMode: input.promptMode ?? 'prompt',
    structuredPrompt: input.structuredPrompt,
    tags: [],
    modelKey: input.modelKey,
    modelFamily: input.modelFamily,
    generationMode: input.generationMode,
    modeId: input.lane,
    language: input.language,
    voice: input.voice,
    imageUrls: input.imageUrl ? [input.imageUrl] : [],
    imageReferences: input.imageReferences,
    music: {
      type: 'none',
      url: null,
    },
    audioSettings: {
      volume: 20,
      ducking: true,
      sampleRateHz: 48000,
      nativeAudioEnabled: input.audioMode === 'auto_scene_sound',
    },
    aspectRatio: input.aspectRatio,
    resolution: input.resolution,
    quality: input.quality,
    durationMode: 'custom',
    durationSeconds: input.durationSeconds,
    captionsEnabled: input.captionsEnabled,
    captionStyle: 'classic',
    narrationEnabled: input.narrationEnabled,
    audioMode: input.audioMode,
  };
}

function serializeAvatarProductAdvancedControls(controls: AvatarProductAdvancedControls): Record<string, string | string[] | boolean | number> {
  const normalizedCategory = normalizeAvatarProductCategoryValue(controls.product_category);
  return {
    ...controls,
    product_category: normalizedCategory,
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
    if (key === 'product_category') {
      const normalizedCategory = normalizeAvatarProductCategoryValue(String(value ?? ''));
      if (normalizedCategory) {
        inputs[key] = normalizedCategory;
      }
      return;
    }
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


function normalizeAvatarProductCategory(value: string) {
  const normalized = value.trim();
  const lower = normalized.toLowerCase();

  if (!normalized) {
    return {
      product_category: '',
      product_subcategory: '',
    };
  }

  if (lower.includes('cloth') || lower.includes('fashion') || lower.includes('apparel') || lower.includes('kurti') || lower.includes('dress') || lower.includes('top')) {
    return {
      product_category: 'clothing',
      product_subcategory: lower.includes('kurti') ? 'women kurti' : normalized,
    };
  }

  if (lower.includes('jewel') || lower.includes('necklace') || lower.includes('pendant') || lower.includes('earring') || lower.includes('ring')) {
    return {
      product_category: 'jewellery',
      product_subcategory: normalized,
    };
  }

  if (lower.includes('skin') || lower.includes('serum') || lower.includes('beauty') || lower.includes('cream') || lower.includes('cosmetic')) {
    return {
      product_category: 'beauty_skincare',
      product_subcategory: normalized,
    };
  }

  if (lower.includes('food') || lower.includes('drink') || lower.includes('beverage') || lower.includes('snack')) {
    return {
      product_category: 'food_beverage',
      product_subcategory: normalized,
    };
  }

  if (lower.includes('electronic') || lower.includes('gadget') || lower.includes('charger') || lower.includes('phone') || lower.includes('power bank')) {
    return {
      product_category: 'electronics',
      product_subcategory: normalized,
    };
  }

  return {
    product_category: normalized,
    product_subcategory: normalized,
  };
}

function normalizeAvatarProductCategoryValue(value: string) {
  const normalized = value.trim();
  if (!normalized) return '';
  return AVATAR_PRODUCT_CATEGORY_BACKEND_MAP[normalized] ?? normalized;
}

function isEnglishLanguageSelection(value: string | null | undefined) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'en-in' || normalized === 'english' || normalized === 'english (india)';
}

function profileForAvatarProductModelKey(modelKey: string): QualityProfile {
  if (modelKey === 'seedance_v1_lite_reference') return 'affordable';
  if (modelKey === 'kling_o3_4k_reference') return 'premium';
  if (modelKey === 'kling_o3_pro_reference' || modelKey === 'kling_v16_pro_elements') return 'high_quality';
  return 'standard';
}

function isAllowedAvatarProductModelKey(modelKey: string) {
  return new Set([
    'seedance_v1_lite_reference',
    'fal_ltx23_i2v',
    'kling_o3_standard_reference',
    'kling_o3_pro_reference',
    'kling_o3_4k_reference',
    'kling_v16_standard_elements',
    'kling_v16_pro_elements',
    'kling_o3_reference',
  ]).has(modelKey);
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
    const categoryPatch = normalizeAvatarProductCategory(normalized);

    return {
      ...categoryPatch,
      category_specific_details: normalized,
    };
  }

  switch (primaryMissing) {
    case 'product_name':
      return { product_name: normalized };
    case 'product_category': {
      const categoryPatch = normalizeAvatarProductCategory(normalized);

      return {
        ...categoryPatch,
        category_specific_details: normalized,
      };
    }
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

function resolveVideoModelKeyFromQuality(profile: QualityProfile): string {
  if (profile === 'premium') return 'kling_o3_reference';
  if (profile === 'high_quality') return 'kling_v16_pro_elements';
  return 'kling_v16_standard_elements';
}



function resolveAvatarProductVideoModelKeyFromQuality(profile: QualityProfile): string {
  if (profile === 'affordable') return 'seedance_v1_lite_reference';
  if (profile === 'premium') return 'kling_o3_4k_reference';
  if (profile === 'high_quality') return 'kling_o3_pro_reference';
  return 'kling_o3_standard_reference';
}


function normalizeVideoProfile(profile: QualityProfile): { lane: 'creator_pro' | 'premium'; modelKey: string; resolution: '720p' } {
  if (profile === 'premium') {
    return { lane: 'premium', modelKey: 'kling_o3_reference', resolution: '720p' };
  }
  if (profile === 'high_quality') {
    return { lane: 'premium', modelKey: 'kling_v16_pro_elements', resolution: '720p' };
  }
  return { lane: 'creator_pro', modelKey: 'kling_v16_standard_elements', resolution: '720p' };
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

function getSupportedVideoDurationOptions(modelKey: string): string[] {
  const presets = VIDEO_MODEL_MAP[modelKey]?.durationPresets ?? [];
  const normalized = [...new Set(presets.filter((value) => Number.isFinite(value) && value > 0))].sort((a, b) => a - b);
  const standardPresets = normalized.filter((value) => value === 5 || value === 10 || value === 15);
  const finalPresets = standardPresets.length > 0 ? standardPresets : normalized;
  return finalPresets.map((value) => String(value));
}

function getDefaultVideoDurationForModel(modelKey: string): string {
  const presets = getSupportedVideoDurationOptions(modelKey);
  const configuredDefault = String(VIDEO_MODEL_MAP[modelKey]?.defaultDurationSeconds ?? '').trim();
  if (configuredDefault && presets.includes(configuredDefault)) return configuredDefault;
  if (presets.includes('10')) return '10';
  if (presets.includes('5')) return '5';
  return presets[0] ?? '10';
}

function normalizeFamilyQualityKey(profile: QualityProfile): 'standard' | 'high' | 'premium' {
  if (profile === 'premium') return 'premium';
  if (profile === 'high_quality') return 'high';
  return 'standard';
}

function profileFromFamilyQuality(key: string): QualityProfile {
  if (key === 'premium') return 'premium';
  if (key === 'high') return 'high_quality';
  return 'standard';
}

function familyForModelKey(modelKey: string): string | null {
  return (
    Object.values(NORMAL_VIDEO_FAMILY_MAP).find((family) =>
      Object.values(family.providerRoutesByGenerationModeAndQuality || {}).some((mapping) =>
        Object.values(mapping || {}).includes(modelKey),
      ),
    )?.key ?? null
  );
}

function getVisibleNormalVideoFamilies(models: AIVideoModel[]) {
  return NORMAL_VIDEO_FAMILIES.filter((family) => {
    if (family.hidden) return false;
    if (family.devOnly) return false;
    const routeKeys = Object.values(family.providerRoutesByGenerationModeAndQuality || {}).flatMap((mapping) => Object.values(mapping || {}));
    return routeKeys.some((routeKey) => models.some((model) => model.key === routeKey && model.enabled !== false));
  });
}

function mergeVideoModelCatalog(apiModels: AIVideoModel[]) {
  const fallbackByKey = new Map(VIDEO_MODEL_FALLBACK.map((model) => [model.key, model]));
  const merged = new Map<string, AIVideoModel>();

  VIDEO_MODEL_FALLBACK.forEach((model) => {
    merged.set(model.key, { ...model });
  });

  apiModels.forEach((model) => {
    const fallback = fallbackByKey.get(model.key);
    merged.set(model.key, fallback ? { ...fallback, ...model } : model);
  });

  return Array.from(merged.values());
}

function inferVideoGenerationMode(hasImage: boolean): VideoGenerationMode {
  return hasImage ? 'image_to_video' : 'text_to_video';
}

function resolveRouteForFamily(params: {
  familyKey: string;
  qualityKey: 'standard' | 'high' | 'premium';
  generationMode: VideoGenerationMode;
}): string {
  const family = NORMAL_VIDEO_FAMILY_MAP[params.familyKey];
  return family?.providerRoutesByGenerationModeAndQuality?.[params.generationMode]?.[params.qualityKey] ?? '';
}

function resolutionForFamily(params: {
  familyKey: string;
  qualityKey: 'standard' | 'high' | 'premium';
}): string {
  const family = NORMAL_VIDEO_FAMILY_MAP[params.familyKey];
  const qualityEntry = family?.supportedQualities.find((item) => item.key === params.qualityKey);
  return qualityEntry?.resolution ?? family?.supportedResolutions?.[0] ?? '720p';
}

function profileForVideoModel(modelKey: string): QualityProfile {
  if (['kling_o3_4k_t2v', 'kling_o3_4k_i2v', 'kling_o3_4k_reference', 'sora2'].includes(modelKey)) return 'premium';
  if (['kling_o3_pro_t2v', 'kling_o3_pro_i2v', 'kling_v16_pro_elements', 'kling_o3_standard_reference', 'kling_o3_pro_reference'].includes(modelKey)) return 'high_quality';
  return 'standard';
}

function profileForImageModel(modelKey: string): QualityProfile {
  if (['budget_image_model', 'gemini_flash_image'].includes(modelKey)) return 'fast_social';
  return 'creator_quality';
}

function shortVideoModelLabel(model: AIVideoModel) {
  return model.shortLabel ?? model.label;
}

function creditPerSecondLabel(modelKey: string, resolutionLabel: string, quality: 'standard' | 'high') {
  const resolutionKey = resolutionLabel === '4K' ? '2160p' : resolutionLabel === '2K' ? '1440p' : resolutionLabel.toLowerCase();
  const total = calculateVideoCredits({
    modelKey,
    resolution: resolutionKey,
    durationSeconds: 5,
    quality,
    narrationEnabled: false,
    captionsEnabled: false,
    audioMode: 'silent',
    referenceImages: 0,
  });
  const value = total / 5;
  return value.toFixed(2);
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

const AVATAR_PRODUCT_GEMINI_VOICE_MAP: Record<string, string> = {
  Priya: 'Kore',
  Shubh: 'Puck',
};

const AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP: Record<string, string> = {
  'en-IN': 'English (India)',
  English: 'English (India)',
  'English (India)': 'English (India)',
  'hi-IN': 'Hindi (India)',
  'hi-IN-x-hinglish': 'Hindi (India)',
  Hindi: 'Hindi (India)',
  'Hindi (India)': 'Hindi (India)',
  'mr-IN': 'Marathi (India)',
  Marathi: 'Marathi (India)',
  'Marathi (India)': 'Marathi (India)',
  'ta-IN': 'Tamil (India)',
  Tamil: 'Tamil (India)',
  'Tamil (India)': 'Tamil (India)',
  'te-IN': 'Telugu (India)',
  Telugu: 'Telugu (India)',
  'Telugu (India)': 'Telugu (India)',
  'gu-IN': 'Gujarati (India)',
  Gujarati: 'Gujarati (India)',
  'Gujarati (India)': 'Gujarati (India)',
  'kn-IN': 'Kannada (India)',
  Kannada: 'Kannada (India)',
  'Kannada (India)': 'Kannada (India)',
  'ml-IN': 'Malayalam (India)',
  Malayalam: 'Malayalam (India)',
  'Malayalam (India)': 'Malayalam (India)',
  'od-IN': 'Odia (India)',
  Odia: 'Odia (India)',
  'Odia (India)': 'Odia (India)',
  'pa-IN': 'Punjabi (India)',
  Punjabi: 'Punjabi (India)',
  'Punjabi (India)': 'Punjabi (India)',
  'bn-IN': 'Bangla (Bangladesh)',
  Bangla: 'Bangla (Bangladesh)',
  'Bangla (Bangladesh)': 'Bangla (Bangladesh)',
};

function resolveAvatarProductPreferredVoice(avatar: AvatarSelection): string {
  const explicitVoice = String(avatar.preferredVoice || '').trim();
  if (explicitVoice && Object.values(AVATAR_PRODUCT_GEMINI_VOICE_MAP).includes(explicitVoice)) {
    return explicitVoice;
  }
  if (explicitVoice && AVATAR_PRODUCT_GEMINI_VOICE_MAP[explicitVoice]) {
    return AVATAR_PRODUCT_GEMINI_VOICE_MAP[explicitVoice];
  }
  const normalizedGender = String(avatar.genderPresentation || '').trim().toLowerCase();
  if (normalizedGender.startsWith('m')) return 'Puck';
  return 'Kore';
}

function resolveAvatarProductPreferredLanguage(avatar: AvatarSelection): string {
  const explicitLanguage = String(avatar.preferredLanguage || '').trim();
  const normalizedGender = String(avatar.genderPresentation || '').trim().toLowerCase();
  const supportsHindi =
    explicitLanguage === 'Hindi (India)'
    || (avatar.languageTags || []).some((tag) => {
      const normalized = String(tag || '').trim();
      return normalized === 'hi-IN' || AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[normalized] === 'Hindi (India)';
    });
  if (normalizedGender.startsWith('f') && supportsHindi) {
    return 'Hindi (India)';
  }
  if (explicitLanguage && Object.values(AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP).includes(explicitLanguage)) {
    return explicitLanguage;
  }
  if (explicitLanguage && AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[explicitLanguage]) {
    return AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[explicitLanguage];
  }
  const hindiTag = (avatar.languageTags || []).find((tag) => {
    const normalized = String(tag || '').trim();
    return normalized === 'hi-IN' || AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[normalized] === 'Hindi (India)';
  });
  if (hindiTag) {
    return 'Hindi (India)';
  }
  const firstTag = (avatar.languageTags || []).find((tag) => typeof tag === 'string' && tag.trim().length > 0);
  if (firstTag && AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[firstTag.trim()]) {
    return AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[firstTag.trim()];
  }
  return 'Hindi (India)';
}

function preferredAvatarProductLanguageLabel(languageTags: string[] | null | undefined): string | null {
  const normalizedTags = (languageTags || [])
    .map((tag) => String(tag || '').trim())
    .filter(Boolean);
  if (normalizedTags.some((tag) => tag === 'hi-IN' || AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[tag] === 'Hindi (India)')) {
    return 'Hindi (India)';
  }
  const firstSupported = normalizedTags.find((tag) => AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[tag]);
  return firstSupported ? AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[firstSupported] : null;
}

function resolveAvatarPreferredLanguage(avatar: AvatarSelection): string | null {
  const explicitLanguage = String(avatar.preferredLanguage || '').trim();
  if (explicitLanguage) return explicitLanguage;
  const firstTag = (avatar.languageTags || []).find((tag) => typeof tag === 'string' && tag.trim().length > 0);
  return firstTag ? firstTag.trim() : null;
}

function getSupportedLanguagesForAvatarProduct(
  languageOptions: TTSLanguageOption[],
  selectedAvatar: AvatarSelection | null,
): TTSLanguageOption[] {
  const avatarLanguageTags = selectedAvatar?.languageTags || [];

  if (avatarLanguageTags.length > 0) {
    const allowedCodes = new Set(
      avatarLanguageTags
        .map((tag) => AVATAR_PRODUCT_GEMINI_LANGUAGE_MAP[String(tag).trim()] || null)
        .filter(Boolean),
    );
    const filtered = languageOptions.filter((option) => allowedCodes.has(option.code));
    if (filtered.length > 0) return filtered;
  }

  const v1AllowedCodes = new Set(['English (India)', 'Hindi (India)']);
  return languageOptions.filter((option) => v1AllowedCodes.has(option.code));
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
  return calculateVideoCredits({
    modelKey: String(defaults.model_key ?? 'fal_ltx23_i2v'),
    resolution: String(defaults.resolution ?? '720p'),
    durationSeconds: Number(defaults.duration_seconds ?? 5),
    quality: String(defaults.quality ?? 'standard'),
    captionsEnabled: false,
    narrationEnabled: Boolean(defaults.narration_enabled),
    recipeId: recipe.id,
    recipeInputs: {
      quality_profile: defaults.quality,
      duration_seconds: defaults.duration_seconds,
    },
  });
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

function mapInspirationToCard(item: PublicInspirationItem): InspirationPhotoCard {
  const videoPreview = isVideoInspiration(item) ? (toAbsoluteUrl(item.video_url) || item.video_url) : null;
  const imagePreview = isVideoInspiration(item)
    ? (toAbsoluteUrl(item.thumbnail_url) || videoPreview || '')
    : (toAbsoluteUrl(item.image_url) || item.image_url);
  return {
    id: item.id,
    title: item.title,
    prompt: item.prompt,
    aspectRatio: item.aspect_ratio || '9:16',
    previewUrl: imagePreview,
    previewVideoUrl: videoPreview,
    creatorName: item.creator_name,
    modelKey: item.model_key,
    createdAt: item.created_at,
    badge: isVideoInspiration(item) ? 'Published video' : 'Published image',
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

function seedRecipeComposerDefaults(recipe: RecipeCard, composerState: RecipeComposerState): RecipeComposerState {
  const defaults = recipe.recipe.generation_defaults ?? {};
  const nextValues = { ...composerState.values };

  if ('duration_seconds' in nextValues && !String(nextValues.duration_seconds || '').trim()) {
    nextValues.duration_seconds = String(defaults.duration_seconds ?? recipe.recipe.duration_seconds ?? 5);
  }
  if ('quality_profile' in nextValues && !String(nextValues.quality_profile || '').trim()) {
    nextValues.quality_profile = String(defaults.quality ?? 'standard');
  }

  return {
    ...composerState,
    values: nextValues,
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
  mediaKind,
  loading = false,
  onClick,
}: {
  slot: RecipeComposerSlot;
  value: string;
  previewUrl?: string | null;
  mediaKind?: 'image' | 'video';
  loading?: boolean;
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void;
}) {
  const isVideo = mediaKind === 'video' || slot.submitTarget === 'video';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition ${value
        ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.1)] text-text'
        : 'border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.62)] text-muted hover:border-[hsl(var(--color-accent)/0.35)] hover:text-text'
        } ${loading ? 'cursor-wait opacity-80' : ''} dark:bg-white/[0.06] dark:text-white`}
    >
      {loading ? (
        <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
      ) : previewUrl && !isVideo ? (
        <img src={previewUrl} alt={value || slot.label} className="h-6 w-6 rounded-full object-cover" />
      ) : isVideo ? (
        <Video className="h-3.5 w-3.5" />
      ) : (
        <Upload className="h-3.5 w-3.5" />
      )}
      {loading ? (isVideo ? 'Uploading video…' : 'Uploading image…') : (value || slot.placeholder)}
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

function capabilityBadgeTone(label: string) {
  if (label === 'Text to Video') {
    return 'border border-sky-400/30 bg-sky-500/14 text-sky-100';
  }
  if (label === 'Image to Video') {
    return 'border border-emerald-400/30 bg-emerald-500/14 text-emerald-100';
  }
  if (label === 'Reference to Video') {
    return 'border border-amber-300/30 bg-amber-500/14 text-amber-100';
  }
  if (label === 'Native audio available') {
    return 'border border-fuchsia-400/25 bg-fuchsia-500/12 text-fuchsia-100';
  }
  if (label === 'Native audio') {
    return 'border border-fuchsia-400/25 bg-fuchsia-500/12 text-fuchsia-100';
  }
  return 'bg-black/30 text-white/78';
}

function ModelCapabilityBadge({ label }: { label: string }) {
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${capabilityBadgeTone(label)}`}>
      {label}
    </span>
  );
}

function isReferenceVideoFamily(family: ReturnType<typeof getNormalVideoFamilyConfigs>[number]) {
  if (family.key.includes('reference')) return true;
  const requiredTextInputs = family.requiredInputsByGenerationMode?.text_to_video ?? [];
  const requiredImageInputs = family.requiredInputsByGenerationMode?.image_to_video ?? [];
  return !family.supportsTextToVideo && family.supportsImageToVideo && (requiredTextInputs.includes('image_url') || requiredImageInputs.includes('image_url'));
}

function getAvailableGenerationBadgesForFamily(family: ReturnType<typeof getNormalVideoFamilyConfigs>[number]) {
  if (isReferenceVideoFamily(family)) return ['Reference to Video'];
  const badges: string[] = [];
  if (family.supportsTextToVideo) badges.push('Text to Video');
  if (family.supportsImageToVideo) badges.push('Image to Video');
  return badges;
}

function getSelectedGenerationBadgeForFamily(
  family: ReturnType<typeof getNormalVideoFamilyConfigs>[number],
  generationMode: VideoGenerationMode,
) {
  if (isReferenceVideoFamily(family)) return 'Reference to Video';
  return generationMode === 'image_to_video' ? 'Image to Video' : 'Text to Video';
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

      if (first?.type === 'string_too_long' && Array.isArray(first?.loc) && (first.loc.includes('topic') || first.loc.includes('prompt'))) {
        const max = first?.ctx?.max_length ?? COMPOSER_PROMPT_MAX_CHARS;
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

export function UnifiedCreateStudioClient({
  userId,
  initialDefaultAspectRatio,
}: {
  userId: string;
  initialDefaultAspectRatio?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const defaultAspectRatio = normalizeAspectRatio(initialDefaultAspectRatio);
  const [idea, setIdea] = useState('');
  const [composerPromptMode, setComposerPromptMode] = useState<ComposerPromptMode>('prompt');
  const [jsonComposerText, setJsonComposerText] = useState('');
  const [mode, setMode] = useState<ComposerMode>('video');
  const [qualityProfile, setQualityProfile] = useState<QualityProfile>('standard');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(defaultAspectRatio);
  const [durationPreference, setDurationPreference] = useState<string>('auto');
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [captionsEnabled] = useState(false);
  const [audioMode, setAudioMode] = useState<AudioMode>('silent');
  const [loading, setLoading] = useState(false);
  const [uploadingAsset, setUploadingAsset] = useState(false);
  const [, setVideoLaunch] = useState<VideoLaunchState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipes, setRecipes] = useState<RecipeCatalog[]>([]);
  const [inspirationPhotos, setInspirationPhotos] = useState<InspirationImage[]>([]);
  const [inspirationVideos, setInspirationVideos] = useState<InspirationVideo[]>([]);
  const [videoModels, setVideoModels] = useState<AIVideoModel[]>(VIDEO_MODEL_FALLBACK);
  const [imageModels, setImageModels] = useState<ImageModel[]>(IMAGE_MODEL_FALLBACK);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedVideoModelKey, setSelectedVideoModelKey] = useState('fal_ltx23_t2v');
  const [selectedNormalVideoFamilyKey, setSelectedNormalVideoFamilyKey] = useState('ltx_23_22b');
  const [selectedImageModelKey, setSelectedImageModelKey] = useState('gpt_image_1_5');
  const [modelPanelKey, setModelPanelKey] = useState<string | null>(null);
  const [loadingRecipes, setLoadingRecipes] = useState(true);
  const [loadingInspirationPhotos, setLoadingInspirationPhotos] = useState(false);
  const [recipeTab, setRecipeTab] = useState<RecipeTab>('all');
  const [inspirationTabFilter, setInspirationTabFilter] = useState<InspirationTabFilter>('all');
  const [selectedRecipe, setSelectedRecipe] = useState<RecipeCard | null>(null);
  const [selectedInspirationPhoto, setSelectedInspirationPhoto] = useState<InspirationPhotoCard | null>(null);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const [activeRecipeLabel, setActiveRecipeLabel] = useState<string | null>(null);
  const [uploadedAssetName, setUploadedAssetName] = useState<string | null>(null);
  const [uploadedComposerAsset, setUploadedComposerAsset] = useState<SlotAssetState | null>(null);
  const [recentEntries, setRecentEntries] = useState<RecentEntry[]>([]);
  const [recipeComposer, setRecipeComposer] = useState<RecipeComposerState | null>(null);
  const [recipeSlotAssets, setRecipeSlotAssets] = useState<Record<string, SlotAssetState>>({});
  const [activeUploadSlotId, setActiveUploadSlotId] = useState<string | null>(null);
  const [pendingUploadTarget, setPendingUploadTarget] = useState<'composer-asset' | string | null>(null);
  const [assetPicker, setAssetPicker] = useState<AssetPickerState | null>(null);
  const [activeRecipeSource, setActiveRecipeSource] = useState<ActiveRecipeSource>(null);
  const [latestGeneratedImage, setLatestGeneratedImage] = useState<GeneratedImage | null>(null);
  const [imageResultOpen, setImageResultOpen] = useState(false);
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<TTSLanguageOption[]>([]);
  const [avatarProductVoiceOptions, setAvatarProductVoiceOptions] = useState<TTSVoiceOption[]>([]);
  const [avatarProductLanguageOptions, setAvatarProductLanguageOptions] = useState<TTSLanguageOption[]>([]);
  const [selectedVoice, setSelectedVoice] = useState('Shubh');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [voicePreviewMessage, setVoicePreviewMessage] = useState<string | null>(null);
  const [publishingImageId, setPublishingImageId] = useState<string | null>(null);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarSelection | null>(null);
  const [avatarPreviewPersonaId, setAvatarPreviewPersonaId] = useState<string | null>(null);
  const [avatarPreviewModal, setAvatarPreviewModal] = useState<AvatarSelection | null>(null);
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
  const structuredPromptParse = useMemo(() => {
    if (composerPromptMode !== 'json' || recipeComposer || mode !== 'video') return null;
    try {
      return {
        parsed: parseStructuredPromptInput(jsonComposerText),
        error: null as string | null,
      };
    } catch (error) {
      return {
        parsed: null,
        error: error instanceof Error ? error.message : 'Invalid JSON input.',
      };
    }
  }, [composerPromptMode, jsonComposerText, mode, recipeComposer]);
  const activeFreeformComposerValue = composerPromptMode === 'json' ? jsonComposerText : idea;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingRecipeUploadSlot = useMemo(
    () => (pendingUploadTarget && pendingUploadTarget !== 'composer-asset' ? recipeComposer?.slots.find((slot) => slot.id === pendingUploadTarget) ?? null : null),
    [pendingUploadTarget, recipeComposer],
  );
  const fileInputAccept = pendingRecipeUploadSlot?.submitTarget === 'video' ? 'video/*' : 'image/*';
  const avatarSyncKeyRef = useRef<string | null>(null);
  const hasLoadedVoiceCatalogRef = useRef(false);
  const hasLoadedAvatarProductVoiceCatalogRef = useRef(false);
  const hasLoadedAvatarLibraryRef = useRef(false);
  const hasLoadedInspirationPhotosRef = useRef(false);
  const secondaryDeferredFetchScheduledRef = useRef(false);

  useEffect(() => {
    const snapshot = readComposerCatalogSnapshot();
    if (!snapshot) return;
    if (Array.isArray(snapshot.recipes) && snapshot.recipes.length > 0) {
      setRecipes(snapshot.recipes);
    }
    if (Array.isArray(snapshot.videoModels) && snapshot.videoModels.length > 0) {
      const mergedCatalog = mergeVideoModelCatalog(snapshot.videoModels);
      const enabledFirst = [...mergedCatalog].sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
      setVideoModels(enabledFirst);
      const visibleFamilies = getVisibleNormalVideoFamilies(enabledFirst);
      const fallbackFamily = visibleFamilies[0]?.key ?? 'ltx_23_22b';
      setSelectedNormalVideoFamilyKey((current) =>
        visibleFamilies.some((family) => family.key === current) ? current : fallbackFamily,
      );
      const defaultRoute = resolveRouteForFamily({
        familyKey: fallbackFamily,
        qualityKey: 'standard',
        generationMode: 'text_to_video',
      });
      setSelectedVideoModelKey((current) =>
        enabledFirst.some((model) => model.key === current)
          ? current
          : (defaultRoute || enabledFirst[0]?.key || 'fal_ltx23_t2v'),
      );
    }
    if (Array.isArray(snapshot.imageModels) && snapshot.imageModels.length > 0) {
      setImageModels(snapshot.imageModels);
      setSelectedImageModelKey((current) =>
        snapshot.imageModels.some((model) => model.key === current)
          ? current
          : (snapshot.imageModels[0]?.key || 'gpt_image_1_5'),
      );
    }
  }, []);
  const { show } = useToast();

  const isAvatarProductRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'avatar_product',
    [activeRecipeSource],
  );
  const isTalkingAvatarRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'talking_avatar',
    [activeRecipeSource],
  );
  const isPixverseAnimeRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'anime_lofi_reel',
    [activeRecipeSource],
  );
  const isPixverseAdvancedRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'reference_video_generator_advanced',
    [activeRecipeSource],
  );
  const isMakeAnythingDanceRecipe = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && activeRecipeSource.recipe.recipe.id === 'make_anything_dance',
    [activeRecipeSource],
  );
  const makeAnythingDanceVideoAsset = useMemo(
    () => (isMakeAnythingDanceRecipe ? recipeSlotAssets.dance_video ?? null : null),
    [isMakeAnythingDanceRecipe, recipeSlotAssets],
  );
  const makeAnythingDanceAnalysis = makeAnythingDanceVideoAsset?.analysis ?? null;
  const visibleAspectOptions = useMemo(
    () => (isMakeAnythingDanceRecipe ? (['9:16'] as const) : ASPECT_OPTIONS),
    [isMakeAnythingDanceRecipe],
  );
  const isPixverseRecipe = isPixverseAnimeRecipe || isPixverseAdvancedRecipe;
  const effectiveNormalVideoFamilyKey = useMemo(() => {
    if (mode === 'video' && activeRecipeSource?.kind !== 'recipe') {
      if (NORMAL_VIDEO_FAMILY_MAP[selectedNormalVideoFamilyKey]) {
        return selectedNormalVideoFamilyKey;
      }
      const derivedFamilyKey = familyForModelKey(selectedVideoModelKey);
      if (derivedFamilyKey && NORMAL_VIDEO_FAMILY_MAP[derivedFamilyKey]) {
        return derivedFamilyKey;
      }
    }
    const derivedFamilyKey = familyForModelKey(selectedVideoModelKey);
    if (derivedFamilyKey && NORMAL_VIDEO_FAMILY_MAP[derivedFamilyKey]) {
      return derivedFamilyKey;
    }
    return selectedNormalVideoFamilyKey;
  }, [activeRecipeSource, mode, selectedNormalVideoFamilyKey, selectedVideoModelKey]);
  const visibleQualityProfiles = useMemo(
    () =>
      mode === 'image'
        ? QUALITY_PROFILES.filter((item) => item.key === 'fast_social' || item.key === 'creator_quality')
        : isAvatarProductRecipe
          ? QUALITY_PROFILES.filter((item) => item.key === 'affordable' || item.key === 'standard' || item.key === 'high_quality' || item.key === 'premium')
          : NORMAL_VIDEO_FAMILY_MAP[effectiveNormalVideoFamilyKey]
            ? QUALITY_PROFILES.filter((item) =>
              (NORMAL_VIDEO_FAMILY_MAP[effectiveNormalVideoFamilyKey]?.supportedQualities ?? []).some((quality) => profileFromFamilyQuality(quality.key) === item.key),
            )
            : QUALITY_PROFILES.filter((item) => item.key === 'standard' || item.key === 'high_quality' || item.key === 'premium'),
    [effectiveNormalVideoFamilyKey, mode, isAvatarProductRecipe],
  );

  const visibleAvatarProductDurationOptions = useMemo(() => {
    if (
      isAvatarProductRecipe &&
      avatarProductAdvancedControls.quality_profile === 'affordable'
    ) {
      return ['5', '10'] as const;
    }

    return ['5', '10', '15'] as const;
  }, [isAvatarProductRecipe, avatarProductAdvancedControls.quality_profile]);
  const visibleNormalVideoFamilies = useMemo(
    () => getVisibleNormalVideoFamilies(videoModels),
    [videoModels],
  );
  const selectedNormalVideoFamily = useMemo(
    () => NORMAL_VIDEO_FAMILY_MAP[effectiveNormalVideoFamilyKey] ?? visibleNormalVideoFamilies[0] ?? null,
    [effectiveNormalVideoFamilyKey, visibleNormalVideoFamilies],
  );
  const isPixverseFreeformFamily = useMemo(
    () => mode === 'video' && activeRecipeSource?.kind !== 'recipe' && selectedNormalVideoFamily?.key === 'pixverse_c1_reference',
    [activeRecipeSource, mode, selectedNormalVideoFamily?.key],
  );
  const supportedFreeformDurationOptions = useMemo(
    () =>
      selectedNormalVideoFamily
        ? [...selectedNormalVideoFamily.supportedDurations].sort((a, b) => a - b).map((value) => String(value))
        : getSupportedVideoDurationOptions(selectedVideoModelKey),
    [selectedNormalVideoFamily, selectedVideoModelKey],
  );
  const initialCatalogLoading = loadingRecipes || modelsLoading;



  useEffect(() => {
    if (!isAvatarProductRecipe) return;

    if (
      avatarProductAdvancedControls.quality_profile === 'affordable' &&
      avatarProductAdvancedControls.duration_seconds === '15'
    ) {
      setDurationPreference('10');

      setAvatarProductAdvancedControls((current) => ({
        ...current,
        duration_seconds: '10',
      }));
    }
  }, [
    isAvatarProductRecipe,
    avatarProductAdvancedControls.quality_profile,
    avatarProductAdvancedControls.duration_seconds,
  ]);


  const isAvatarProductCompatibleAvatar = (avatar: Avatar) => {
    return (
      Boolean(
        avatar.primary_image ||
        avatar.thumbnail_url ||
        avatar.reference_images?.[0]
      )
    );
  };

  const freeformHasReferenceImage = Boolean(uploadedComposerAsset?.assetUrl);
  const inferredFreeformGenerationMode = inferVideoGenerationMode(freeformHasReferenceImage);
  const selectedFreeformQualityKey = normalizeFamilyQualityKey(qualityProfile);
  const resolvedFreeformModelKey = selectedNormalVideoFamily
    ? resolveRouteForFamily({
      familyKey: selectedNormalVideoFamily.key,
      qualityKey: selectedFreeformQualityKey,
      generationMode: inferredFreeformGenerationMode,
    })
    : selectedVideoModelKey;
  const resolvedFreeformResolution = selectedNormalVideoFamily
    ? resolutionForFamily({
      familyKey: selectedNormalVideoFamily.key,
      qualityKey: selectedFreeformQualityKey,
    })
    : getVideoResolutionForModel(selectedVideoModelKey, qualityProfile);
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
  useEffect(() => {
    if (mode !== 'video' || activeRecipeSource?.kind === 'recipe') return;
    if (selectedNormalVideoFamily && resolvedFreeformModelKey && selectedVideoModelKey !== resolvedFreeformModelKey) {
      setSelectedVideoModelKey(resolvedFreeformModelKey);
      setModelPanelKey(resolvedFreeformModelKey);
    }
  }, [activeRecipeSource, mode, resolvedFreeformModelKey, selectedNormalVideoFamily, selectedVideoModelKey]);

  const recipeCards = useMemo(
    () =>
      sortRecipes(
        recipes
          .map(mapCatalogRecipeToCard)
          .filter((item): item is RecipeCard => item !== null && item.id !== 'ugc_ad' && item.id !== 'deep_dive_explainer' && item.id !== 'reference_video_generator_advanced'),
      ),
    [recipes],
  );

  const filteredRecipes = useMemo(() => {
    return recipeCards.filter((item) => recipeMatchesTab(item, recipeTab)).slice(0, 12);
  }, [recipeCards, recipeTab]);

  const inspirationItems = useMemo(() => {
    const merged: PublicInspirationItem[] = [...inspirationVideos, ...inspirationPhotos];
    const filtered =
      inspirationTabFilter === 'image'
        ? merged.filter((item) => !isVideoInspiration(item))
        : inspirationTabFilter === 'video'
          ? merged.filter((item) => isVideoInspiration(item))
          : merged;
    return sortPublicInspiration(filtered, 'newest').slice(0, 12);
  }, [inspirationPhotos, inspirationTabFilter, inspirationVideos]);

  const inspirationPhotoCards = useMemo(
    () => inspirationItems.map(mapInspirationToCard),
    [inspirationItems],
  );
  const composerVoicePreviewText = useMemo(() => {
    if (recipeComposer) {
      return buildComposerVoicePreviewText(assembleRecipePrompt(recipeComposer));
    }
    if (composerPromptMode === 'json') {
      return buildComposerVoicePreviewText(structuredPromptParse?.parsed?.summary || 'Structured cinematic video prompt');
    }
    return buildComposerVoicePreviewText(idea);
  }, [composerPromptMode, idea, recipeComposer, structuredPromptParse]);

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
      if (hasLoadedInspirationPhotosRef.current) {
        if (result.is_public_inspiration && result.moderation_status === 'approved') {
          const publishedImage: InspirationImage = {
            id: image.id,
            creator_name: 'You',
            model_key: image.model_key,
            title: (image.prompt || 'Generated image').split('.')[0]?.slice(0, 72) || 'Generated image',
            prompt: image.prompt,
            image_url: image.image_url,
            aspect_ratio: image.aspect_ratio,
            resolution: image.resolution,
            created_at: new Date().toISOString(),
            reference_urls: image.reference_urls,
            tags: [...image.auto_tags, ...image.user_tags].slice(0, 8),
            like_count: result.like_count,
            liked_by_user: false,
            moderation_status: result.moderation_status,
          };
          setInspirationPhotos((current) => [
            publishedImage,
            ...current.filter((item) => item.id !== image.id),
          ].slice(0, 12));
        } else if (!result.is_public_inspiration) {
          setInspirationPhotos((current) => current.filter((item) => item.id !== image.id));
        }
      }
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
    () =>
      (isAvatarProductRecipe ? avatarProductLanguageOptions : languageOptions).find((option) => option.code === selectedLanguage)?.label
      ?? selectedLanguage,
    [avatarProductLanguageOptions, isAvatarProductRecipe, languageOptions, selectedLanguage],
  );
  const recipeSettingsLocked = useMemo(
    () => activeRecipeSource?.kind === 'recipe' && Boolean(recipeComposer),
    [activeRecipeSource, recipeComposer],
  );
  const avatarProductModelUnlocked = recipeSettingsLocked && isAvatarProductRecipe;
  const effectiveVoiceOptions = useMemo(
    () => (isAvatarProductRecipe ? avatarProductVoiceOptions : voiceOptions),
    [avatarProductVoiceOptions, isAvatarProductRecipe, voiceOptions],
  );
  const effectiveLanguageOptions = useMemo(
    () => (isAvatarProductRecipe ? avatarProductLanguageOptions : languageOptions),
    [avatarProductLanguageOptions, isAvatarProductRecipe, languageOptions],
  );
  const avatarVoiceLocked = useMemo(
    () =>
      recipeSettingsLocked &&
      activeRecipeSource?.kind === 'recipe' &&
      activeRecipeSource.recipe.recipe.id === 'talking_avatar' &&
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
    const presetItems = presetAvatars.map((avatar) => ({
      personaId: avatar.id,
      name: avatar.name,
      imageUrl: avatar.primary_image || avatar.thumbnail_url,
      source: 'preset' as const,
      sourceLabel: 'Preset' as const,
      isCustomAvatar: avatar.category === 'custom_avatar',
      genderPresentation: avatar.gender || null,
      preferredLanguage: preferredAvatarProductLanguageLabel(avatar.language_tags),
      preferredVoice: avatar.recommended_voice || null,
      languageTags: avatar.language_tags || [],
      styleLabel: avatar.avatar_type || avatar.category || avatar.style || 'Preset avatar',
      languageInfo: summarizeLanguageTags(avatar.language_tags),
      voiceInfo: isAvatarProductRecipe
        ? `${resolveAvatarProductPreferredVoice({
          personaId: avatar.id,
          name: avatar.name,
          source: 'preset',
          sourceLabel: 'Preset',
          genderPresentation: avatar.gender || null,
          preferredVoice: avatar.recommended_voice || null,
          preferredLanguage: preferredAvatarProductLanguageLabel(avatar.language_tags),
          languageTags: avatar.language_tags || [],
        })} recommended`
        : avatar.recommended_voice ? `${avatar.recommended_voice} recommended` : 'Uses your selected voice',
      previewVideoUrl: avatar.preview_video_url || null,
      description:
        avatar.description ||
        `${avatar.name} is tuned for creator-style talking scenes.`,
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
      preferredLanguage: preferredAvatarProductLanguageLabel(avatar.language_tags),
      languageTags: avatar.language_tags || [],
      styleLabel: avatar.avatar_type || avatar.category || avatar.style || 'Saved avatar',
      languageInfo: summarizeLanguageTags(avatar.language_tags) || selectedLanguageLabel || null,
      voiceInfo: isAvatarProductRecipe
        ? `${resolveAvatarProductPreferredVoice({
          personaId: avatar.id,
          name: avatar.name,
          source: 'saved',
          sourceLabel: 'Saved',
          genderPresentation: avatar.gender || null,
          preferredVoice: avatar.recommended_voice || null,
          preferredLanguage: preferredAvatarProductLanguageLabel(avatar.language_tags),
          languageTags: avatar.language_tags || [],
        })} recommended`
        : avatar.recommended_voice ? `${avatar.recommended_voice} recommended` : (selectedVoice ? `${selectedVoice} voice selected` : 'Uses your selected voice'),
      previewVideoUrl: avatar.preview_video_url || null,
      description:
        avatar.description ||
        `${avatar.name} is one of your saved avatars for repeatable avatar-led ads.`,
    }));

    return [...presetItems, ...savedItems];
  }, [isAvatarProductRecipe, presetAvatars, savedAvatars, selectedLanguageLabel, selectedVoice]);


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
    void loadAvatarLibrary();
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
    if (isAvatarProductRecipe && !avatar) {
      return;
    }

    setSelectedAvatar(avatar);
    if (isAvatarDrivenRecipe && avatar) {
      const preferredVoice = isAvatarProductRecipe
        ? resolveAvatarProductPreferredVoice(avatar)
        : resolveAvatarPreferredVoice(avatar);
      if (preferredVoice && avatarGenderFilteredVoiceOptions.some((option) => option.key === preferredVoice)) {
        setSelectedVoice(preferredVoice);
      }
      const preferredLanguage = isAvatarProductRecipe
        ? resolveAvatarProductPreferredLanguage(avatar)
        : resolveAvatarPreferredLanguage(avatar);
      if (preferredLanguage && effectiveLanguageOptions.some((option) => option.code === preferredLanguage)) {
        setSelectedLanguage(preferredLanguage);
        if (isAvatarProductRecipe) {
          setAvatarProductAdvancedControls((current) => ({
            ...current,
            language: preferredLanguage,
          }));
        }
      }
    }
    setIsAvatarPickerOpen(false);
  };
  const firstEmptySlotId = useMemo(() => firstEmptyRecipeTextSlot(recipeComposer), [recipeComposer]);
  const composerIntent = useMemo(() => detectVideoIntent(idea), [idea]);

  const visibleLanguageOptions = useMemo(
    () =>
      isAvatarProductRecipe
        ? getSupportedLanguagesForAvatarProduct(effectiveLanguageOptions, selectedAvatar)
        : effectiveLanguageOptions,
    [effectiveLanguageOptions, isAvatarProductRecipe, selectedAvatar],
  );
  useEffect(() => {
    if (!isAvatarProductRecipe) return;
    if (!visibleLanguageOptions.length) return;

    const isCurrentSupported = visibleLanguageOptions.some((option) => option.code === selectedLanguage);
    if (!isCurrentSupported) {
      const fallbackLanguage =
        visibleLanguageOptions.find((option) => option.code === 'English (India)') ||
        visibleLanguageOptions[0];

      setSelectedLanguage(fallbackLanguage.code);
      setAvatarProductAdvancedControls((current) => ({
        ...current,
        language: fallbackLanguage.code,
      }));
    }
  }, [isAvatarProductRecipe, selectedLanguage, visibleLanguageOptions]);
  const isAvatarDrivenRecipe = isAvatarProductRecipe || isTalkingAvatarRecipe;
  const freeformSupportsAutoSceneSound = useMemo(
    () => Boolean(selectedNormalVideoFamily?.supportsNativeAudio),
    [selectedNormalVideoFamily],
  );
  const currentSupportsAutoSceneSound = useMemo(() => {
    if (isPixverseRecipe) return true;
    if (activeRecipeSource?.kind === 'recipe') {
      return Boolean(displayedVideoModel?.supportsNativeAudio);
    }
    return freeformSupportsAutoSceneSound;
  }, [activeRecipeSource, displayedVideoModel, freeformSupportsAutoSceneSound, isPixverseRecipe]);
  const showNativeAudioSelector = mode === 'video' && !isMakeAnythingDanceRecipe && ((activeRecipeSource?.kind !== 'recipe' && !isAvatarDrivenRecipe) || isPixverseRecipe);
  const showVoiceControls = (Boolean(activeRecipeSource?.kind === 'recipe') || isAvatarDrivenRecipe) && !isPixverseRecipe && !isMakeAnythingDanceRecipe;
  const recipeReferenceImageCount = useMemo(() => {
    if (!recipeComposer) return 0;
    const hasImage = recipeComposer.slots.some((slot) => {
      if (!(slot.submitTarget === 'image' || slot.kind === 'reference-image')) return false;
      const slotAsset = recipeSlotAssets[slot.id];
      const slotValue = String(recipeComposer.values[slot.id] || '').trim();
      return Boolean(slotAsset?.assetUrl || slotValue);
    });
    return hasImage ? 1 : 0;
  }, [recipeComposer, recipeSlotAssets]);
  const avatarProductInlineAnswerPatch = useMemo(
    () => buildAvatarProductInlineAnswerPatch(avatarProductInlineAnswer, avatarProductAssist),
    [avatarProductAssist, avatarProductInlineAnswer],
  );
  const avatarGenderFilteredVoiceOptions = useMemo(() => {
    if (isAvatarProductRecipe) {
      return effectiveVoiceOptions;
    }
    const avatarGender = String(selectedAvatar?.genderPresentation || '').trim().toLowerCase();
    const isCustomAvatar = Boolean(selectedAvatar?.isCustomAvatar);
    if (!isCustomAvatar || !isAvatarDrivenRecipe || (avatarGender !== 'female' && avatarGender !== 'male')) {
      return effectiveVoiceOptions;
    }
    return effectiveVoiceOptions.filter((option) => option.gender.toLowerCase() === avatarGender);
  }, [effectiveVoiceOptions, isAvatarDrivenRecipe, isAvatarProductRecipe, selectedAvatar]);
  useEffect(() => {
    if (!isAvatarDrivenRecipe || !selectedAvatar) {
      avatarSyncKeyRef.current = null;
      return;
    }

    const syncKey = `${selectedAvatar.personaId}:${effectiveVoiceOptions.length}:${effectiveLanguageOptions.length}:${isAvatarProductRecipe ? 'avatar_product' : 'legacy'}`;
    if (avatarSyncKeyRef.current === syncKey) return;

    const preferredVoice = isAvatarProductRecipe
      ? resolveAvatarProductPreferredVoice(selectedAvatar)
      : resolveAvatarPreferredVoice(selectedAvatar);
    if (preferredVoice && avatarGenderFilteredVoiceOptions.some((option) => option.key === preferredVoice)) {
      setSelectedVoice(preferredVoice);
    } else if (avatarGenderFilteredVoiceOptions[0]?.key) {
      setSelectedVoice(avatarGenderFilteredVoiceOptions[0].key);
    }
    const preferredLanguage = isAvatarProductRecipe
      ? resolveAvatarProductPreferredLanguage(selectedAvatar)
      : resolveAvatarPreferredLanguage(selectedAvatar);
    if (preferredLanguage && effectiveLanguageOptions.some((option) => option.code === preferredLanguage)) {
      setSelectedLanguage(preferredLanguage);
      if (isAvatarProductRecipe) {
        setAvatarProductAdvancedControls((current) => ({
          ...current,
          language: preferredLanguage,
        }));
      }
    }
    avatarSyncKeyRef.current = syncKey;
  }, [avatarGenderFilteredVoiceOptions, effectiveLanguageOptions, effectiveVoiceOptions.length, isAvatarDrivenRecipe, isAvatarProductRecipe, selectedAvatar]);
  useEffect(() => {
    if (!isAvatarProductRecipe) {
      setAvatarProductAssist(null);
      setAvatarProductAssistLoading(false);
      setAvatarProductInlineAnswer('');
    }
  }, [isAvatarProductRecipe]);


  useEffect(() => {
    if (!isAvatarProductRecipe) return;
    if (selectedAvatar && avatarOptions.some((item) => item.personaId === selectedAvatar.personaId)) return;

    const defaultAvatar =
      avatarOptions.find((item) => item.personaId === 'av-chitrakala') ||
      avatarOptions[0] ||
      null;

    if (defaultAvatar) {
      setSelectedAvatar(defaultAvatar);
    }
  }, [isAvatarProductRecipe, avatarOptions, selectedAvatar]);

  useEffect(() => {
    if (isAvatarProductRecipe || !showNativeAudioSelector) {
      setAudioMode('silent');
      return;
    }
    if (!freeformSupportsAutoSceneSound && audioMode !== 'silent') {
      setAudioMode('silent');
    }
  }, [audioMode, freeformSupportsAutoSceneSound, isAvatarProductRecipe, showNativeAudioSelector]);
  useEffect(() => {
    if (mode !== 'video' || activeRecipeSource?.kind === 'recipe') return;
    if (!supportedFreeformDurationOptions.length) return;
    if (durationPreference === 'auto' || !supportedFreeformDurationOptions.includes(durationPreference)) {
      setDurationPreference(getDefaultVideoDurationForModel(selectedVideoModelKey));
    }
  }, [activeRecipeSource, durationPreference, mode, selectedVideoModelKey, supportedFreeformDurationOptions]);
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

  const applyVoiceCatalog = useCallback((catalog: TTSCatalogResponse, options?: { preserveSelection?: boolean }) => {
    setVoiceOptions(catalog.voices);
    setLanguageOptions(catalog.languages);
    if (options?.preserveSelection) {
      return;
    }
    const preferredVoice = catalog.voices.find((voice) => voice.key === 'Shubh') ?? catalog.voices[0];
    const preferredLanguage = catalog.languages.find((language) => language.code === 'en-IN') ?? catalog.languages[0];
    if (preferredVoice) {
      setSelectedVoice(preferredVoice.key);
    }
    if (preferredLanguage) {
      setSelectedLanguage(preferredLanguage.code);
    }
  }, []);

  const applyAvatarProductVoiceCatalog = useCallback((catalog: TTSCatalogResponse) => {
    setAvatarProductVoiceOptions(catalog.voices);
    setAvatarProductLanguageOptions(catalog.languages);

    if (!catalog.voices.some((voice) => voice.key === selectedVoice)) {
      const fallbackVoice = catalog.voices.find((voice) => voice.key === 'Kore') ?? catalog.voices[0];
      if (fallbackVoice) {
        setSelectedVoice(fallbackVoice.key);
      }
    }

    if (!catalog.languages.some((language) => language.code === selectedLanguage)) {
      const fallbackLanguage = catalog.languages.find((language) => language.code === 'Hindi (India)')
        ?? catalog.languages.find((language) => language.code === 'English (India)')
        ?? catalog.languages[0];
      if (fallbackLanguage) {
        setSelectedLanguage(fallbackLanguage.code);
        setAvatarProductAdvancedControls((current) => ({
          ...current,
          language: fallbackLanguage.code,
        }));
      }
    }
  }, [selectedLanguage, selectedVoice]);

  const applyAvatarLibrary = useCallback((library: AvatarLibraryResponse) => {
    const compatibleAvatars = (
      library.avatars?.length
        ? library.avatars
        : [...(library.preset_avatars || []), ...(library.user_avatars || [])]
    ).filter(isAvatarProductCompatibleAvatar);

    const publicAvatars = compatibleAvatars.filter((avatar) =>
      avatar.scope === 'public' ||
      avatar.avatar_type === 'system' ||
      avatar.provider === 'reference_image'
    );

    const privateAvatars = compatibleAvatars.filter((avatar) =>
      avatar.scope !== 'public' &&
      avatar.avatar_type !== 'system' &&
      avatar.provider !== 'reference_image'
    );

    setPresetAvatars(publicAvatars);
    setSavedAvatars(privateAvatars);
    setAvatarLoadError(null);

    if (process.env.NODE_ENV === 'development') {
      console.info('avatar_picker_loaded', {
        public_actor_count: publicAvatars.length,
        saved_avatar_count: privateAvatars.length,
        total_count: compatibleAvatars.length,
        avatar_ids: compatibleAvatars.map((avatar) => avatar.id),
      });
    }
  }, []);

  const loadAvatarLibrary = useCallback(async () => {
    if (hasLoadedAvatarLibraryRef.current || isAvatarLoading) return;

    setIsAvatarLoading(true);
    try {
      const library = await api.listAvatarLibrary(userId);
      hasLoadedAvatarLibraryRef.current = true;
      applyAvatarLibrary(library);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load avatars.';
      setAvatarLoadError(message);
      setPresetAvatars([]);
      setSavedAvatars([]);
      show({
        title: 'Avatar library unavailable',
        message: 'Avatars could not be loaded for this picker.',
        variant: 'error',
        durationMs: 5200,
      });
    } finally {
      setIsAvatarLoading(false);
    }
  }, [applyAvatarLibrary, isAvatarLoading, show, userId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingRecipes(true);
    setModelsLoading(true);
    void Promise.allSettled([
      api.listRecipes(userId, { type: 'video', active: true }),
      api.listAIVideoModels(userId),
      api.listImageModels(userId),
    ]).then(([recipeResult, videoModelResult, imageModelResult]) => {
      if (cancelled) return;

      if (recipeResult.status === 'fulfilled') {
        setRecipes(recipeResult.value);
      }
      if (videoModelResult.status === 'fulfilled' && videoModelResult.value.length > 0) {
        const mergedCatalog = mergeVideoModelCatalog(videoModelResult.value);
        const enabledFirst = [...mergedCatalog].sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
        setVideoModels(enabledFirst);
        const visibleFamilies = getVisibleNormalVideoFamilies(enabledFirst);
        const fallbackFamily = visibleFamilies[0]?.key ?? 'ltx_23_22b';
        setSelectedNormalVideoFamilyKey((current) =>
          visibleFamilies.some((family) => family.key === current) ? current : fallbackFamily,
        );
        const defaultRoute = resolveRouteForFamily({
          familyKey: fallbackFamily,
          qualityKey: 'standard',
          generationMode: 'text_to_video',
        });
        setSelectedVideoModelKey((current) =>
          enabledFirst.some((model) => model.key === current)
            ? current
            : (defaultRoute || enabledFirst[0]?.key || 'fal_ltx23_t2v'),
        );
      } else {
        const fallbackCatalog = [...VIDEO_MODEL_FALLBACK].sort((a, b) => Number(b.enabled !== false) - Number(a.enabled !== false));
        setVideoModels(fallbackCatalog);
        const visibleFamilies = getVisibleNormalVideoFamilies(fallbackCatalog);
        const fallbackFamily = visibleFamilies[0]?.key ?? 'ltx_23_22b';
        setSelectedNormalVideoFamilyKey((current) =>
          visibleFamilies.some((family) => family.key === current) ? current : fallbackFamily,
        );
      }
      if (imageModelResult.status === 'fulfilled' && imageModelResult.value.length > 0) {
        setImageModels(imageModelResult.value);
        setSelectedImageModelKey((current) =>
          imageModelResult.value.some((model) => model.key === current)
            ? current
            : (imageModelResult.value[0]?.key || 'gpt_image_1_5'),
        );
      }
      setLoadingRecipes(false);
      setModelsLoading(false);
      if (
        recipeResult.status === 'fulfilled' &&
        videoModelResult.status === 'fulfilled' &&
        imageModelResult.status === 'fulfilled'
      ) {
        writeComposerCatalogSnapshot({
          recipes: recipeResult.value,
          videoModels: videoModelResult.value,
          imageModels: imageModelResult.value,
          storedAt: Date.now(),
        });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    if (secondaryDeferredFetchScheduledRef.current) return;
    if (loadingRecipes || modelsLoading) return;
    secondaryDeferredFetchScheduledRef.current = true;

    const timer = window.setTimeout(() => {
      if (!hasLoadedVoiceCatalogRef.current) {
        void api.getTtsCatalog(userId)
          .then((catalog) => {
            hasLoadedVoiceCatalogRef.current = true;
            applyVoiceCatalog(catalog, { preserveSelection: isAvatarProductRecipe });
          })
          .catch(() => {
            // keep fallback voice/language defaults
          });
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [applyVoiceCatalog, isAvatarProductRecipe, loadingRecipes, modelsLoading, userId]);

  useEffect(() => {
    if (recipeTab !== 'inspiration_photos') return;
    if (hasLoadedInspirationPhotosRef.current || loadingInspirationPhotos) return;

    let cancelled = false;
    setLoadingInspirationPhotos(true);
    void Promise.allSettled([
      api.listPublicImageInspiration({ limit: 12, sort: 'newest' }),
      api.listPublicVideoInspiration({ limit: 12, sort: 'newest' }),
    ])
      .then(([imageResult, videoResult]) => {
        if (cancelled) return;
        hasLoadedInspirationPhotosRef.current = true;
        setInspirationPhotos(
          imageResult.status === 'fulfilled'
            ? imageResult.value.filter((item) => Boolean(item.image_url))
            : [],
        );
        setInspirationVideos(
          videoResult.status === 'fulfilled'
            ? videoResult.value.filter((item) => Boolean(item.video_url))
            : [],
        );
      })
      .catch(() => {
        if (cancelled) return;
        setInspirationPhotos([]);
        setInspirationVideos([]);
      })
      .finally(() => {
        if (cancelled) return;
        setLoadingInspirationPhotos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadingInspirationPhotos, recipeTab]);

  useEffect(() => {
    if (!showVoiceControls && !isAvatarDrivenRecipe) return;
    if (hasLoadedVoiceCatalogRef.current) return;

    let cancelled = false;
    void api.getTtsCatalog(userId)
      .then((catalog) => {
        if (cancelled) return;
        hasLoadedVoiceCatalogRef.current = true;
        applyVoiceCatalog(catalog, { preserveSelection: isAvatarProductRecipe });
      })
      .catch(() => {
        // keep fallback voice/language defaults
      });

    return () => {
      cancelled = true;
    };
  }, [applyVoiceCatalog, isAvatarDrivenRecipe, isAvatarProductRecipe, showVoiceControls, userId]);

  useEffect(() => {
    if (!isAvatarProductRecipe) return;
    if (hasLoadedAvatarProductVoiceCatalogRef.current) return;

    let cancelled = false;
    void api.getAvatarProductTtsCatalog(userId)
      .then((catalog) => {
        if (cancelled) return;
        hasLoadedAvatarProductVoiceCatalogRef.current = true;
        applyAvatarProductVoiceCatalog(catalog);
      })
      .catch(() => {
        // keep safe fallback defaults until recipe-scoped catalog is available
      });

    return () => {
      cancelled = true;
    };
  }, [applyAvatarProductVoiceCatalog, isAvatarProductRecipe, userId]);

  useEffect(() => {
    if (!isAvatarDrivenRecipe && !isAvatarPickerOpen) return;
    if (hasLoadedAvatarLibraryRef.current || isAvatarLoading) return;

    let cancelled = false;
    setIsAvatarLoading(true);
    void loadAvatarLibrary().finally(() => {
      if (cancelled) return;
    });

    return () => {
      cancelled = true;
    };
  }, [isAvatarDrivenRecipe, isAvatarPickerOpen, loadAvatarLibrary]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent | PointerEvent | TouchEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-composer-menu="true"]')) return;
      closeMenus();
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
      if (!isEnglishLanguageSelection(selectedLanguage)) {
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
    if (slot.kind === 'upload' || slot.kind === 'reference-image') {
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
    const isMakeAnythingDance = recipe.id === 'make_anything_dance';
    const composerState = seedRecipeComposerDefaults(recipe, resolveRecipeComposer(recipe));
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
    setAspectRatio(
      isMakeAnythingDance
        ? '9:16'
        : normalizeAspectRatio(
          (defaults.aspect_ratio as AspectRatio | undefined) ||
          (recipe.aspectRatio as AspectRatio | undefined) ||
          defaultAspectRatio,
        ),
    );
    setDurationPreference(Number(recipe.recipe.duration_seconds || defaults.duration_seconds || 0) > 10 ? 'auto' : (String(defaults.duration_seconds ?? 5) === '10' ? '10' : '5'));
    setAudioMode('silent');
    setVoiceEnabled(Boolean(defaults.narration_enabled ?? true));
    if (defaults.voice) {
      setSelectedVoice(String(defaults.voice));
    }
    if (defaults.language) {
      const matchingLanguage =
        effectiveLanguageOptions.find((option) => option.code === defaults.language) ??
        effectiveLanguageOptions.find((option) => option.label === defaults.language) ??
        effectiveLanguageOptions.find((option) => option.label.toLowerCase().includes(String(defaults.language).toLowerCase()));
      setSelectedLanguage(matchingLanguage?.code ?? String(defaults.language));
    }
    setQualityProfile(
      isMakeAnythingDance
        ? 'standard'
        : nextMode === 'video'
        ? defaults.quality === 'high'
          ? 'high_quality'
          : 'standard'
        : 'creator_quality',
    );
    if (isMakeAnythingDance) {
      setSelectedVideoModelKey('kling_v26_standard_motion_control');
      setModelPanelKey('kling_v26_standard_motion_control');
    }
    if (recipe.id === 'avatar_product') {
      void loadAvatarLibrary();
      const safeRecipeModelKey = isAllowedAvatarProductModelKey(recipeModelKey) ? recipeModelKey : 'seedance_v1_lite_reference';
      const defaultQuality: QualityProfile = profileForAvatarProductModelKey(safeRecipeModelKey);
      const defaultModelKey = safeRecipeModelKey || resolveAvatarProductVideoModelKeyFromQuality(defaultQuality);
      const defaultAvatar =
        avatarOptions.find((item) => item.personaId === 'av-chitrakala') ||
        avatarOptions[0] ||
        null;

      setSelectedVideoModelKey(defaultModelKey);
      setModelPanelKey(defaultModelKey);
      setQualityProfile(defaultQuality);

      if (defaultAvatar) {
        setSelectedAvatar(defaultAvatar);
        setSelectedVoice(resolveAvatarProductPreferredVoice(defaultAvatar));
      }

      const preferredLanguage = defaultAvatar ? resolveAvatarProductPreferredLanguage(defaultAvatar) : null;
      const defaultLanguage =
        preferredLanguage && effectiveLanguageOptions.some((option) => option.code === preferredLanguage)
          ? preferredLanguage
          : 'Hindi (India)';

      setSelectedLanguage(defaultLanguage);

      setAvatarProductAdvancedControls((current) => ({
        ...current,
        duration_seconds: String(recipe.recipe.duration_seconds || defaults.duration_seconds || 5),
        video_model_key: defaultModelKey,
        quality_profile: defaultQuality,
        language: defaultLanguage,
      }));
    }
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
      aspectRatio: normalizeAspectRatio(
        (defaults.aspect_ratio as AspectRatio | undefined) ||
        (recipe.aspectRatio as AspectRatio | undefined) ||
        defaultAspectRatio,
      ),
      qualityProfile: nextMode === 'video' ? (defaults.quality === 'high' ? 'high_quality' : 'standard') : 'creator_quality',
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
      aspectRatio: defaultAspectRatio,
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



  const avatarProductPromptText = recipeComposer ? assembleRecipePrompt(recipeComposer) : idea;

  const avatarProductImageSlot = recipeComposer?.slots.find(
    (slot) => slot.submitTarget === 'image' || slot.kind === 'upload' || slot.kind === 'reference-image',
  );

  const avatarProductImageUrl =
    (avatarProductImageSlot ? recipeSlotAssets[avatarProductImageSlot.id]?.assetUrl : null) ||
    (avatarProductImageSlot ? recipeComposer?.values[avatarProductImageSlot.id] : '') ||
    '';

  const canAutoFillAvatarProduct =
    Boolean(avatarProductPromptText.trim()) &&
    Boolean(String(avatarProductImageUrl || '').trim()) &&
    Boolean(avatarProductAdvancedControls.product_category.trim());


  const handleAvatarProductAutofill = async () => {
    const promptText = avatarProductPromptText;
    const imageUrl = String(avatarProductImageUrl || '').trim();

    if (!canAutoFillAvatarProduct) {
      setAvatarProductAdvancedOpen(true);

      show({
        title: 'Complete required details first',
        message: 'Add the product brief, upload the product image, and select a product category before using Auto AI Fill.',
        variant: 'error',
      });

      return;
    }

    try {
      setAvatarProductAssistLoading(true);

      const result = await api.autofillAvatarProduct({
        text: promptText,
        image_url: imageUrl,
        advanced_controls: avatarProductAdvancedControls,
      });

      setAvatarProductAdvancedControls((current) => ({
        ...current,
        ...result,
        product_category: current.product_category || String(result.product_category || ''),
        product_subcategory: current.product_subcategory || String(result.product_subcategory || ''),
      }));

      setAvatarProductAdvancedOpen(true);

      show({
        title: 'Advanced controls filled',
        message: 'AI suggestions have been added. You can edit them before generating.',
        variant: 'success',
      });
    } catch (error) {
      const message = getFriendlyErrorMessage(error) || 'Could not auto-fill product details.';
      show({ title: 'Auto-fill failed', message, variant: 'error' });
    } finally {
      setAvatarProductAssistLoading(false);
    }
  };


  const launchUnifiedFlow = async () => {
    const recipePrompt = recipeComposer ? assembleRecipePrompt(recipeComposer) : activeFreeformComposerValue;
    const trimmedIdea = recipePrompt.trim();
    const structuredPromptPayload = composerPromptMode === 'json' ? structuredPromptParse?.parsed ?? null : null;
    if (!trimmedIdea) {
      setError(composerPromptMode === 'json' ? 'Paste structured JSON first so we can prepare the right creation flow.' : 'Add a prompt first so we can prepare the right creation flow.');
      return;
    }
    if (!recipeComposer && composerPromptMode !== 'json' && trimmedIdea.length > COMPOSER_PROMPT_MAX_CHARS) {
      setError(`Prompt is too long. Please keep it under ${COMPOSER_PROMPT_MAX_CHARS} characters.`);
      return;
    }
    if (!recipeComposer && mode === 'video' && composerPromptMode === 'json') {
      if (structuredPromptParse?.error) {
        setError(structuredPromptParse.error);
        return;
      }
      if (!structuredPromptPayload) {
        setError('Paste valid JSON first. JSON mode accepts either one object or an array of shot objects.');
        return;
      }
    }

    if (recipeComposer) {
      const missingRequired = recipeComposer.slots.find((slot) => {
        if (!slot.required) return false;
        const slotAsset = recipeSlotAssets[slot.id];
        const rawValue =
          slot.kind === 'upload' || slot.kind === 'reference-image'
            ? (slotAsset?.assetUrl || recipeComposer.values[slot.id] || '')
            : (recipeComposer.values[slot.id] || '');
        return !String(rawValue || '').trim();
      });
      if (missingRequired) {
        setError(`Fill ${missingRequired.label.toLowerCase()} first so we can prepare the right creation flow.`);
        return;
      }
    }
    setLoading(true);
    setError(null);
    closeMenus();
    if (composerPromptMode === 'json') {
      setJsonComposerText(trimmedIdea);
    } else {
      setIdea(trimmedIdea);
    }

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
        for (const slot of recipeComposer.slots) {
          const slotAsset = recipeSlotAssets[slot.id];
          const rawValue =
            slot.kind === 'upload' || slot.kind === 'reference-image'
              ? (slotAsset?.assetUrl || recipeComposer.values[slot.id] || '')
              : (recipeComposer.values[slot.id] || '');
          const normalizedValue = String(rawValue || '').trim();
          if (slot.required && !normalizedValue) {
            throw new Error(`${slot.label} is required before we can run this recipe.`);
          }
          if (normalizedValue) {
            inputs[slot.id] = normalizedValue;
          }
        }
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
        if (recipe.id === 'make_anything_dance') {
          const danceAnalysis = recipeSlotAssets.dance_video?.analysis ?? null;
          const keepOriginalSoundValue = String(inputs.keep_original_sound || recipeComposer.values.keep_original_sound || 'on').trim().toLowerCase();
          if (!danceAnalysis) {
            throw new Error('Upload a dance video first so we can detect its timing and audio.');
          }
          inputs.character_image = String(inputs.character_image || '').trim();
          inputs.dance_video = String(inputs.dance_video || '').trim();
          inputs.duration_seconds = String(danceAnalysis.billedDurationSeconds);
          inputs.has_audio = danceAnalysis.hasAudio ? 'true' : 'false';
          inputs.keep_original_sound = keepOriginalSoundValue === 'off' ? 'false' : 'true';
          inputs.aspect_ratio = aspectRatio;
          inputs.character_description = String(inputs.character_description || recipeComposer.values.character_description || 'uploaded character').trim() || 'uploaded character';
          inputs.user_prompt = trimmedIdea;
        }

        if (recipe.id === 'avatar_product') {
          if (!selectedAvatar?.personaId) {
            setError('Select an AI avatar first so the avatar product recipe knows who should appear in the ad.');
            setLoading(false);
            return;
          }

          if (!avatarProductAdvancedControls.product_category.trim()) {
            setAvatarProductAdvancedOpen(true);
            setError('Select a product category first.');
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
            narrationEnabled: isPixverseRecipe ? false : voiceEnabled,
            audioMode: recipe.id === 'avatar_product' ? 'silent' : (isPixverseRecipe ? audioMode : undefined),
            personaId: isAvatarDrivenRecipe ? (selectedAvatar?.personaId || undefined) : undefined,
            useAvatarForTalkingScenes: isAvatarDrivenRecipe ? Boolean(selectedAvatar?.personaId) : undefined,
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

      if (isPixverseFreeformFamily && !uploadedComposerAsset?.assetUrl) {
        setError('Upload one reference image first. PixVerse freeform needs a subject image before it can animate your prompt.');
        setLoading(false);
        return;
      }

      const detectedIntent = composerPromptMode === 'json' ? 'generic' : detectVideoIntent(trimmedIdea);
      if (composerPromptMode !== 'json' && shouldAutoUseExplainerRecipe(detectedIntent, nextMode, activeRecipeSource)) {
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
            narrationEnabled: false,
            audioMode,
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
        lane: selectedFreeformQualityKey === 'premium' ? 'premium' : 'creator_pro' as 'creator_pro' | 'premium',
        modelKey: resolvedFreeformModelKey || selectedVideoModelKey,
        modelFamily: selectedNormalVideoFamily?.key || familyForModelKey(selectedVideoModelKey) || '',
        generationMode: inferredFreeformGenerationMode,
        resolution: resolvedFreeformResolution as '360p' | '480p' | '540p' | '720p' | '1080p' | '1440p' | '2160p' | '4K',
        quality: selectedFreeformQualityKey,
      };
      if (profile.modelKey === 'ltx') {
        const videoResult = await api.createAIVideo(
          buildVideoCreatePayload({
            type: 'freeform',
            templateLabel: 'LTX Storyboard',
            script: composerPromptMode === 'json' ? undefined : trimmedIdea,
            modelKey: profile.modelKey,
            modelFamily: profile.modelFamily,
            generationMode: profile.generationMode,
            lane: 'creator_pro',
            promptMode: composerPromptMode,
            structuredPrompt: structuredPromptPayload?.raw,
            aspectRatio,
            resolution: '720p',
            quality: 'standard',
            durationSeconds: 24,
            captionsEnabled,
            narrationEnabled: false,
            audioMode,
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
          ? Number(getDefaultVideoDurationForModel(profile.modelKey))
          : Number(durationPreference);
      const templateKey = pickVideoTemplateKey(
        composerPromptMode === 'json' ? structuredPromptPayload?.summary || 'Structured JSON cinematic brief' : trimmedIdea,
      );
      const templateLabel = TEMPLATE_OPTIONS.find((item) => item.key === templateKey)?.label || 'Story / Scene Reel';
      const videoResult = await api.createAIVideo(
        buildVideoCreatePayload({
          type: 'freeform',
          templateLabel,
          script:
            composerPromptMode === 'json'
              ? undefined
              : (await api.generateScriptV2(
                {
                  template: templateLabel,
                  topic: trimmedIdea,
                  language: 'English',
                  tone: 'Creator-first, emotionally engaging, social-ready',
                  lane: profile.lane === 'premium' ? 'Premium' : 'Creator Pro',
                  modelKey: profile.modelKey,
                  modelLabel: displayedVideoModel?.label ?? profile.modelKey,
                  aspectRatio: aspectRatio,
                  resolution: profile.resolution,
                  quality: profile.quality,
                  durationSeconds,
                  narrationEnabled: false,
                  captionsEnabled,
                },
                userId,
              )).script,
          modelKey: profile.modelKey,
          modelFamily: profile.modelFamily,
          generationMode: profile.generationMode,
          lane: profile.lane,
          promptMode: composerPromptMode,
          structuredPrompt: structuredPromptPayload?.raw,
          aspectRatio,
          resolution: profile.resolution,
          quality: profile.quality,
          durationSeconds,
          captionsEnabled,
          narrationEnabled: false,
          audioMode,
          language: selectedLanguage,
          voice: selectedVoice,
          imageUrl: uploadedComposerAsset?.assetUrl,
          imageReferences:
            profile.modelFamily === 'pixverse_c1_reference' && uploadedComposerAsset?.assetUrl
              ? [{ ref_name: 'subject', type: 'subject', image_url: uploadedComposerAsset.assetUrl }]
              : undefined,
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
  const currentModelLabel = mode === 'video'
    ? activeRecipeSource?.kind === 'recipe'
      ? shortVideoModelLabel(displayedVideoModel)
      : selectedNormalVideoFamily?.displayName ?? shortVideoModelLabel(displayedVideoModel)
    : displayedImageModel?.label ?? 'Image';
  const currentModelHint = mode === 'video'
    ? activeRecipeSource?.kind === 'recipe'
      ? displayedVideoModel?.qualityBadge ?? displayedVideoModel?.frontendHint
      : selectedNormalVideoFamily?.description ?? displayedVideoModel?.qualityBadge ?? displayedVideoModel?.frontendHint
    : displayedImageModel?.badge ?? displayedImageModel?.frontend_hint;
  const selectedGenerationBadge = mode === 'video' && !recipeComposer && selectedNormalVideoFamily
    ? getSelectedGenerationBadgeForFamily(selectedNormalVideoFamily, inferredFreeformGenerationMode)
    : null;
  const selectedVideoResolution = resolvedFreeformResolution;
  const selectedImageResolution: '1024' | '1536' = qualityProfile === 'fast_social' ? '1024' : '1536';
  const effectiveFreeformDurationSeconds = Number(
    durationPreference === 'auto'
      ? (supportedFreeformDurationOptions[0] ?? getDefaultVideoDurationForModel(selectedVideoModelKey))
      : durationPreference,
  );
  const liveVideoEstimateCredits = useMemo(() => {
    const recipeMode =
      recipeComposer?.mode ??
      (activeRecipeSource?.kind === 'recipe' ? activeRecipeSource.recipe.contentType : null);
    const resolvedMode = resolveComposerMode(mode, recipeMode);
    if (resolvedMode !== 'video') return null;

    if (recipeComposer && activeRecipeSource?.kind === 'recipe') {
      const recipe = activeRecipeSource.recipe.recipe;
      const defaults = recipe.generation_defaults ?? {};
      const recipePrompt = assembleRecipePrompt(recipeComposer);

      if (recipe.id === 'avatar_product') {
        const avatarDuration = Number(
          avatarProductAdvancedControls.duration_seconds || durationPreference || defaults.duration_seconds || 5,
        );
        const avatarModelKey = String(
          avatarProductAdvancedControls.video_model_key
          || resolveAvatarProductVideoModelKeyFromQuality(avatarProductAdvancedControls.quality_profile as QualityProfile),
        );
        return calculateVideoCredits({
          modelKey: avatarModelKey,
          resolution: String(defaults.resolution ?? '720p'),
          durationSeconds: avatarDuration,
          quality: avatarProductAdvancedControls.quality_profile,
          captionsEnabled: false,
          narrationEnabled: true,
          voiceKey: selectedVoice,
          sampleRateHz: 48000,
          referenceImages: recipeReferenceImageCount,
          audioMode: 'silent',
          nativeAudioEnabled: false,
          recipeId: recipe.id,
          recipeInputs: {
            quality_profile: avatarProductAdvancedControls.quality_profile,
            duration_seconds: String(avatarProductAdvancedControls.duration_seconds || avatarDuration),
          },
          scriptText: recipePrompt,
        });
      }

      if (recipe.id === 'make_anything_dance') {
        const detectedDuration = makeAnythingDanceAnalysis?.billedDurationSeconds ?? 0;
        if (!detectedDuration) {
          return null;
        }
        const keepOriginalSound = String(recipeComposer.values.keep_original_sound || 'on').trim().toLowerCase() !== 'off';
        const hasAudio = Boolean(makeAnythingDanceAnalysis?.hasAudio);
        return calculateVideoCredits({
          modelKey: 'kling_v26_standard_motion_control',
          modelFamily: 'motion_control',
          resolution: String(defaults.resolution ?? '720p'),
          durationSeconds: detectedDuration,
          quality: 'standard',
          captionsEnabled: false,
          narrationEnabled: false,
          audioMode: keepOriginalSound && hasAudio ? 'auto_scene_sound' : 'silent',
          nativeAudioEnabled: keepOriginalSound && hasAudio,
          referenceImages: 1,
          recipeId: recipe.id,
          recipeInputs: {
            duration_seconds: String(detectedDuration),
            has_audio: hasAudio ? 'true' : 'false',
            keep_original_sound: keepOriginalSound ? 'true' : 'false',
            aspect_ratio: aspectRatio,
          },
          scriptText: recipePrompt,
        });
      }

      if (recipe.id === 'anime_lofi_reel' || recipe.id === 'reference_video_generator_advanced') {
        const recipeInputs = recipeComposer.slots.reduce<Record<string, string>>((acc, slot) => {
          const slotAsset = recipeSlotAssets[slot.id];
          const rawValue =
            slot.kind === 'upload' || slot.kind === 'reference-image'
              ? (slotAsset?.assetUrl || recipeComposer.values[slot.id] || '')
              : (recipeComposer.values[slot.id] || '');
          const normalizedValue = String(rawValue || '').trim();
          if (normalizedValue) {
            acc[slot.id] = normalizedValue;
          }
          return acc;
        }, {});
        recipeInputs.audio_mode = audioMode;
        const quality = String(recipeInputs.quality_profile || defaults.quality || 'standard');
        const durationSeconds = Number(recipeInputs.duration_seconds || defaults.duration_seconds || recipe.duration_seconds || 5);
        return calculateVideoCredits({
          modelKey: 'pixverse_c1_reference',
          resolution: quality === 'premium' ? '720p' : quality === 'high' ? '540p' : '360p',
          durationSeconds,
          quality,
          captionsEnabled: false,
          narrationEnabled: false,
          audioMode,
          nativeAudioEnabled: audioMode === 'auto_scene_sound',
          referenceImages:
            recipe.id === 'reference_video_generator_advanced'
              ? [recipeInputs.subject_image, recipeInputs.background_image].filter(Boolean).length
              : (recipeInputs.character_image ? 1 : 0),
          recipeId: recipe.id,
          recipeInputs,
          scriptText: recipePrompt,
        });
      }

      const durationSeconds = Number(defaults.duration_seconds ?? recipe.duration_seconds ?? 5);
      return calculateVideoCredits({
        modelKey: String(defaults.model_key ?? selectedVideoModelKey),
        resolution: String(defaults.resolution ?? selectedVideoResolution),
        durationSeconds,
        quality: String(defaults.quality ?? 'standard'),
        captionsEnabled: false,
        narrationEnabled: Boolean(defaults.narration_enabled),
        voiceKey: selectedVoice,
        sampleRateHz: 48000,
        referenceImages: recipeReferenceImageCount,
        audioMode: String(defaults.narration_enabled) === 'true' ? 'silent' : undefined,
        nativeAudioEnabled: false,
        recipeId: recipe.id,
        recipeInputs: {
          quality_profile: String(defaults.quality ?? 'standard'),
          duration_seconds: String(durationSeconds),
        },
        scriptText: recipePrompt,
      });
    }

    return calculateVideoCredits({
      modelKey: resolvedFreeformModelKey || selectedVideoModelKey,
      modelFamily: selectedNormalVideoFamily?.key,
      resolution: selectedVideoResolution,
      durationSeconds: effectiveFreeformDurationSeconds,
      quality: selectedFreeformQualityKey,
      captionsEnabled: false,
      narrationEnabled: false,
      voiceKey: selectedVoice,
      sampleRateHz: 48000,
      referenceImages: uploadedComposerAsset?.assetUrl ? 1 : 0,
      audioMode,
      nativeAudioEnabled: audioMode === 'auto_scene_sound',
      scriptText: idea,
    });
  }, [
    activeRecipeSource,
    audioMode,
    avatarProductAdvancedControls.duration_seconds,
    avatarProductAdvancedControls.quality_profile,
    durationPreference,
    effectiveFreeformDurationSeconds,
    idea,
    mode,
    recipeComposer,
    recipeReferenceImageCount,
    recipeSlotAssets,
    resolvedFreeformModelKey,
    makeAnythingDanceAnalysis?.billedDurationSeconds,
    makeAnythingDanceAnalysis?.hasAudio,
    selectedVideoModelKey,
    selectedNormalVideoFamily?.key,
    selectedFreeformQualityKey,
    aspectRatio,
    selectedVideoResolution,
    selectedVoice,
    supportedFreeformDurationOptions,
    uploadedComposerAsset?.assetUrl,
  ]);

  return (
    <div className="space-y-6">
      <LoadingOverlay
        open={Boolean(navigationOverlayLabel)}
        title={`Opening ${navigationOverlayLabel ?? 'workspace'}`}
        description="Preparing the next workspace for you."
        stepLabel="Navigating"
        accentLabel="Create"
      />
      <LoadingOverlay
        open={uploadingAsset}
        title="Uploading asset"
        description={fileInputAccept.startsWith('video') ? 'Preparing your dance video for analysis and generation.' : 'Preparing your image for generation.'}
        stepLabel="Upload"
        accentLabel="Create"
      />
      <LoadingOverlay
        open={initialCatalogLoading}
        title="Loading create studio"
        description="Fetching recipes, models, and defaults for your workspace."
        stepLabel="Preparing"
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
              </div>
            </div>

            {isAvatarLoading ? (
              <div className="py-10 text-center text-sm text-muted">Loading avatars...</div>
            ) : (
              <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_340px]">
                <div className="space-y-5">
                  {avatarLoadError ? (
                    <div className="rounded-[16px] border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                      {isAvatarProductRecipe
                        ? 'Avatar Product could not load the avatar library just now. Please retry in a moment.'
                        : 'Public actors could not be loaded just now. Saved avatars are still available as fallback.'}
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
                                className={`rounded-[20px] border p-3 transition ${isFocused
                                  ? 'border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.08)]'
                                  : 'border-[hsl(var(--color-border)/0.74)] bg-[hsl(var(--color-surface)/0.72)]'
                                  }`}
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAvatarPreviewPersonaId(avatar.personaId);
                                    setAvatarPreviewModal(avatar);
                                  }}
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
                                    className={`flex-1 rounded-[12px] px-3 py-2 text-xs font-semibold transition ${isSelected
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
                      {isAvatarProductRecipe
                        ? 'No avatars are available yet for Avatar Product. Seed or add a public avatar first, then reopen this picker.'
                        : 'No avatars found yet. Create one to use a repeatable talking persona in your UGC ad flow.'}
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

        <Modal open={Boolean(avatarPreviewModal)} onClose={() => setAvatarPreviewModal(null)}>
          {avatarPreviewModal ? (
            <div className="mx-auto max-w-[420px] space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                    Avatar Preview
                  </p>
                  <h3 className="text-lg font-semibold text-text">{avatarPreviewModal.name}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setAvatarPreviewModal(null)}
                  className="rounded-full border border-[hsl(var(--color-border)/0.7)] px-3 py-1 text-sm text-muted transition hover:text-text"
                >
                  Close
                </button>
              </div>

              {avatarPreviewModal.previewVideoUrl ? (
                <video
                  src={avatarPreviewModal.previewVideoUrl}
                  poster={avatarPreviewModal.imageUrl}
                  controls
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="max-h-[70vh] w-full rounded-[20px] bg-black object-contain"
                />
              ) : avatarPreviewModal.imageUrl ? (
                <img
                  src={avatarPreviewModal.imageUrl}
                  alt={avatarPreviewModal.name}
                  className="max-h-[70vh] w-full rounded-[20px] object-contain"
                />
              ) : (
                <div className="rounded-[20px] border border-dashed border-[hsl(var(--color-border)/0.74)] p-6 text-sm text-muted">
                  No preview available.
                </div>
              )}

              <Button
                type="button"
                onClick={() => {
                  applyAvatarSelection(avatarPreviewModal);
                  setAvatarPreviewModal(null);
                }}
                className="w-full rounded-[14px]"
              >
                Use this avatar
              </Button>
            </div>
          ) : null}
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
                {mode === 'video' && !recipeComposer ? (
                  <div className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.62)] p-1 dark:border-white/12 dark:bg-white/5">
                    {(['prompt', 'json'] as const).map((option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => setComposerPromptMode(option)}
                        className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                          composerPromptMode === option
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-foreground))]'
                            : 'text-muted hover:text-text'
                        }`}
                      >
                        {option === 'prompt' ? 'Prompt' : 'JSON'}
                      </button>
                    ))}
                  </div>
                ) : null}
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
                            mediaKind={recipeSlotAssets[slot.id]?.mediaKind}
                            loading={activeUploadSlotId === slot.id}
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
                  {isMakeAnythingDanceRecipe ? (
                    <div className="space-y-2 rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.56)] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <div>
                        <p className="text-sm font-semibold text-text">Best results</p>
                        <p className="mt-1 text-xs leading-5 text-muted">
                          Use a clear character image and a dance video with one clearly visible dancer. Full-body dance videos work best.
                        </p>
                      </div>
                      <div className="grid gap-2 text-xs text-muted sm:grid-cols-3">
                        <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.45)] px-3 py-2.5">
                          <p className="font-semibold text-text">Detected length</p>
                          <p className="mt-1">{makeAnythingDanceAnalysis ? `${makeAnythingDanceAnalysis.durationSeconds.toFixed(1)}s` : 'Waiting for dance video'}</p>
                        </div>
                        <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.45)] px-3 py-2.5">
                          <p className="font-semibold text-text">Original audio</p>
                          <p className="mt-1">
                            {makeAnythingDanceAnalysis
                              ? (makeAnythingDanceAnalysis.hasAudio ? 'Detected in uploaded dance clip' : 'No audio detected')
                              : 'We will check after upload'}
                          </p>
                        </div>
                        <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.45)] px-3 py-2.5">
                          <p className="font-semibold text-text">Estimated credits</p>
                          <p className="mt-1">{liveVideoEstimateCredits !== null ? `${liveVideoEstimateCredits} credits` : 'Upload dance video first'}</p>
                        </div>
                      </div>
                    </div>
                  ) : null}
                  {isPixverseAdvancedRecipe ? (
                    <p className="text-xs text-muted">Best results with 1–2 references and simple motion. Use `@subject` in the prompt, and `@background` only if you upload the second reference.</p>
                  ) : null}
                  {isAvatarProductRecipe ? (
                    <div className="space-y-3 rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.56)] p-4 dark:border-white/10 dark:bg-white/[0.04]">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">Avatar product assistant</p>
                          <p className="mt-1 text-xs text-muted">
                            Select the product category, then generate. Auto AI Fill can help complete the remaining brand details.
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            variant="secondary"
                            className="h-9 rounded-full px-3 text-xs font-semibold"
                            onClick={() => void handleAvatarProductAutofill()}
                            disabled={avatarProductAssistLoading || loading || !canAutoFillAvatarProduct}
                          >
                            {avatarProductAssistLoading ? 'Filling…' : 'Auto AI Fill'}
                          </Button>

                          <Badge variant="outline" className="rounded-full">
                            {avatarProductAssistLoading ? 'Checking…' : 'Checks happen on generate'}
                          </Badge>
                          {!canAutoFillAvatarProduct ? (
                            <p className="mt-2 text-xs text-muted">
                              Auto AI Fill unlocks after you add a product brief, upload the product image, and select a product category.
                            </p>
                          ) : null}

                        </div>
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
                            <label className="space-y-1 text-sm">
                              <span className="text-muted">
                                Product category <span className="text-[hsl(var(--color-danger))]">*</span>
                              </span>
                              <Select
                                value={avatarProductAdvancedControls.product_category}
                                onChange={(event) =>
                                  setAvatarProductAdvancedControls((current) => ({
                                    ...current,
                                    product_category: event.target.value,
                                  }))
                                }
                              >
                                <option value="">Select category</option>
                                {AVATAR_PRODUCT_CATEGORY_OPTIONS.map((option) => (
                                  <option key={option.value} value={option.value}>
                                    {option.label}
                                  </option>
                                ))}
                              </Select>
                            </label>

                            <label className="space-y-1 text-sm">
                              <span className="text-muted">Product subcategory</span>
                              <Input
                                value={avatarProductAdvancedControls.product_subcategory}
                                onChange={(event) =>
                                  setAvatarProductAdvancedControls((current) => ({
                                    ...current,
                                    product_subcategory: event.target.value,
                                  }))
                                }
                                placeholder="Example: women kurti, pendant necklace, face serum"
                              />
                            </label>
                            {avatarProductAssist?.nextQuestion && !avatarProductAdvancedControls.product_category ? (
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
                              <Input value={avatarProductAdvancedControls.tagline} onChange={(event) => setAvatarProductAdvancedControls((current) => ({ ...current, tagline: event.target.value }))} placeholder="Everyday comfort, effortless style" />
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
                composerPromptMode === 'json' && mode === 'video' ? (
                  <div className="space-y-3">
                    <Textarea
                      ref={textareaRef}
                      rows={10}
                      value={jsonComposerText}
                      onChange={(event) => setJsonComposerText(event.target.value)}
                      placeholder={COMPOSER_JSON_EXAMPLE}
                      className="min-h-[220px] rounded-[20px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-surface)/0.58)] px-4 py-3 font-mono text-[0.95rem] leading-7 text-[hsl(var(--color-text))] shadow-none outline-none placeholder:text-[hsl(var(--color-muted))] focus:border-[hsl(var(--color-accent)/0.5)] focus:ring-0 focus-visible:ring-0 dark:text-white dark:placeholder:text-white/45"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-muted">
                        Paste one structured object or a JSON array of shot objects. Public asset links must use `https://`.
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        {structuredPromptParse?.parsed ? (
                          <>
                            <Badge variant="outline">Structured JSON detected</Badge>
                            <Badge variant="outline">{structuredPromptParse.parsed.shotCount} shot{structuredPromptParse.parsed.shotCount === 1 ? '' : 's'}</Badge>
                            <Badge variant="outline">{structuredPromptParse.parsed.shape}</Badge>
                            {structuredPromptParse.parsed.assetCount ? <Badge variant="outline">{structuredPromptParse.parsed.assetCount} asset{structuredPromptParse.parsed.assetCount === 1 ? '' : 's'}</Badge> : null}
                          </>
                        ) : null}
                        {structuredPromptParse?.error ? (
                          <span className="text-xs text-[hsl(var(--color-danger))]">{structuredPromptParse.error}</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Textarea
                    ref={textareaRef}
                    rows={4}
                    value={idea}
                    onChange={(event) => setIdea(event.target.value)}
                    maxLength={COMPOSER_PROMPT_MAX_CHARS}
                    placeholder={'Create a motivational reel about consistency\nGenerate a premium product image for Instagram\nCreate a story-based reel about a struggling creator'}
                    className="min-h-[104px] rounded-[20px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-surface)/0.58)] px-4 py-3 text-base font-medium leading-7 text-[hsl(var(--color-text))] shadow-none outline-none placeholder:text-[hsl(var(--color-muted))] placeholder:text-[1rem] placeholder:leading-7 focus:border-[hsl(var(--color-accent)/0.5)] focus:ring-0 focus-visible:ring-0 dark:text-white dark:placeholder:text-white/55 sm:min-h-[112px] sm:text-lg"
                  />
                )
              )}

              {!recipeComposer ? (
                <div className="mt-2 flex items-center justify-end">
                  {composerPromptMode === 'json' && mode === 'video' ? (
                    <p className="text-xs text-muted">{jsonComposerText.length} characters</p>
                  ) : (
                    <p className={`text-xs ${idea.length > COMPOSER_PROMPT_MAX_CHARS * 0.92 ? 'text-amber-300' : 'text-muted'}`}>
                      {idea.length}/{COMPOSER_PROMPT_MAX_CHARS}
                    </p>
                  )}
                </div>
              ) : null}

              {mode === 'video' && activeFreeformComposerValue.trim() && !recipeComposer ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {composerPromptMode === 'json' && structuredPromptParse?.parsed ? (
                    <>
                      <Badge variant="outline">JSON mode active</Badge>
                      <p className="text-xs text-muted">
                        We’ll preserve your camera, lens, VFX, environment, and audio intent as structured prompt metadata.
                      </p>
                    </>
                  ) : willAutoRouteToExplainer ? (
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
                  <p className="text-xs text-muted">
                    {freeformHasReferenceImage ? 'Animating your uploaded image.' : 'Creating from prompt.'}
                  </p>
                </div>
              ) : null}

              {mode === 'video' && !recipeComposer && selectedGenerationBadge ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <ModelCapabilityBadge label={selectedGenerationBadge} />
                  {selectedNormalVideoFamily?.supportsNativeAudio ? <ModelCapabilityBadge label="Native audio available" /> : null}
                  <p className="text-xs text-muted">
                    {selectedGenerationBadge === 'Reference to Video'
                      ? 'This model animates an uploaded reference image instead of starting from text alone.'
                      : selectedGenerationBadge === 'Image to Video'
                        ? 'This model switches to image-led animation when you upload a reference image.'
                        : 'This model can generate directly from your written prompt.'}
                  </p>
                </div>
              ) : null}

              <div className="flex flex-col gap-3 border-t border-white/8 pt-2.5 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === 'assets' ? null : 'assets'))}
                      data-composer-menu="true"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    {openMenu === 'assets' ? (
                      <div data-composer-menu="true" className="fixed inset-x-3 top-[86px] z-50 rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.99),hsl(var(--color-elevated)/0.98))] p-2.5 shadow-hard backdrop-blur-xl sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+10px)] sm:min-w-[250px]">
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
                        {isAvatarDrivenRecipe ? (
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
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {!isMakeAnythingDanceRecipe ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        if (recipeSettingsLocked && !avatarProductModelUnlocked) return;
                        setOpenMenu((current) => (current === 'model' ? null : 'model'));
                      }}
                      data-composer-menu="true"
                      disabled={recipeSettingsLocked && !avatarProductModelUnlocked}
                      className={`inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border px-3 py-2 text-sm transition ${recipeSettingsLocked && !avatarProductModelUnlocked
                        ? 'cursor-not-allowed border-white/6 bg-white/[0.03] text-white/38'
                        : 'border-white/10 bg-white/[0.04] text-white/74 hover:bg-white/[0.08] hover:text-white'
                        }`}
                    >
                      <Box className="h-4 w-4 text-white/60" />
                      <span className="max-w-[120px] truncate sm:max-w-[180px]">{currentModelLabel}</span>
                      {recipeSettingsLocked && !avatarProductModelUnlocked ? <Lock className="h-3.5 w-3.5 text-white/40" /> : null}
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </button>
                    {openMenu === 'model' ? (
                      <div data-composer-menu="true" className="fixed inset-x-3 top-[86px] z-50 max-h-[75vh] overflow-y-auto rounded-[24px] border border-white/10 bg-[rgba(27,25,34,0.96)] p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-[22px] sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+10px)] sm:max-h-[min(78vh,720px)] sm:w-[min(92vw,760px)] sm:overflow-visible">
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
                            {mode === 'video' && !recipeComposer
                              ? visibleNormalVideoFamilies.map((family) => (
                                <ModelRow
                                  key={family.key}
                                  title={family.displayName}
                                  badges={[...getAvailableGenerationBadgesForFamily(family), ...family.tags]}
                                  active={effectiveNormalVideoFamilyKey === family.key}
                                  disabled={false}
                                  onClick={() => {
                                    setSelectedNormalVideoFamilyKey(family.key);
                                    const defaultQuality = family.supportedQualities[0]?.key ?? 'standard';
                                    setQualityProfile(profileFromFamilyQuality(defaultQuality));
                                    setDurationPreference(String(family.supportedDurations[0] ?? 5));
                                  }}
                                  onHover={() => setSelectedNormalVideoFamilyKey(family.key)}
                                />
                              ))
                              : mode === 'video'
                              ? videoModels
                                .filter((model) => !isAvatarProductRecipe || isAllowedAvatarProductModelKey(model.key))
                                .map((model) => (
                                <ModelRow
                                  key={model.key}
                                  title={shortVideoModelLabel(model)}
                                  badges={[
                                    ...(model.resolutionLabels ?? []),
                                    ...(model.key === 'sora2' ? ['Premium'] : []),
                                    ...((model.key === 'fal_ltx23_i2v' || model.key === 'seedance_v1_lite_i2v') ? ['Image to Video'] : []),
                                  ]}
                                  active={selectedVideoModelKey === model.key}
                                  disabled={model.enabled === false}
                                  onClick={() => {
                                    setSelectedVideoModelKey(model.key);
                                    setModelPanelKey(model.key);
                                    const nextQuality = isAvatarProductRecipe
                                      ? profileForAvatarProductModelKey(model.key)
                                      : profileForVideoModel(model.key);
                                    const nextDuration = isAvatarProductRecipe
                                      ? (model.key === 'seedance_v1_lite_reference' ? '10' : String(avatarProductAdvancedControls.duration_seconds || '5'))
                                      : getDefaultVideoDurationForModel(model.key);
                                    setQualityProfile(nextQuality);
                                    setDurationPreference(nextDuration);
                                    if (isAvatarProductRecipe) {
                                      setAvatarProductAdvancedControls((current) => ({
                                        ...current,
                                        video_model_key: model.key,
                                        quality_profile: nextQuality,
                                        duration_seconds: nextDuration,
                                      }));
                                    }
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
                            {mode === 'video' && !recipeComposer && selectedNormalVideoFamily ? (
                              <div className="space-y-3">
                                <div>
                                  <p className="text-lg font-semibold text-white">{selectedNormalVideoFamily.displayName}</p>
                                  <p className="mt-1 text-xs text-white/52">{selectedNormalVideoFamily.description}</p>
                                  <div className="mt-2 flex flex-wrap gap-1.5">
                                    <ModelCapabilityBadge label={getSelectedGenerationBadgeForFamily(selectedNormalVideoFamily, inferredFreeformGenerationMode)} />
                                    {selectedNormalVideoFamily.supportsNativeAudio ? <ModelCapabilityBadge label="Native audio" /> : null}
                                  </div>
                                  {selectedNormalVideoFamily.key === 'pixverse_c1_reference' ? (
                                    <p className="mt-2 text-[11px] text-white/48">Requires one uploaded reference image. Your freeform prompt stays in control.</p>
                                  ) : null}
                                </div>
                                <div className="space-y-2">
                                  {selectedNormalVideoFamily.supportedQualities.map((qualityOption) => {
                                    const estimate = calculateVideoCredits({
                                      modelKey: resolveRouteForFamily({
                                        familyKey: selectedNormalVideoFamily.key,
                                        qualityKey: qualityOption.key as 'standard' | 'high' | 'premium',
                                        generationMode: inferredFreeformGenerationMode,
                                      }),
                                      modelFamily: selectedNormalVideoFamily.key,
                                      resolution: qualityOption.resolution,
                                      durationSeconds: Number(supportedFreeformDurationOptions[0] ?? 5),
                                      quality: qualityOption.key,
                                      narrationEnabled: false,
                                      captionsEnabled: false,
                                      audioMode: qualityOption.key === selectedFreeformQualityKey ? audioMode : 'silent',
                                      nativeAudioEnabled: qualityOption.key === selectedFreeformQualityKey ? audioMode === 'auto_scene_sound' : false,
                                      referenceImages: freeformHasReferenceImage ? 1 : 0,
                                    });
                                    return (
                                      <button
                                        key={`${selectedNormalVideoFamily.key}-${qualityOption.key}`}
                                        type="button"
                                        onClick={() => {
                                          setQualityProfile(profileFromFamilyQuality(qualityOption.key));
                                          closeMenus();
                                        }}
                                        className={`flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition ${
                                          selectedFreeformQualityKey === qualityOption.key
                                            ? 'border border-white/12 bg-white/[0.09]'
                                            : 'border border-transparent bg-white/[0.04] hover:bg-white/[0.07]'
                                        }`}
                                      >
                                        <div>
                                          <p className="text-sm font-semibold text-white">{qualityOption.label}</p>
                                          <div className="mt-1 flex flex-wrap gap-1.5">
                                            <ModelCapabilityBadge label={qualityOption.resolution} />
                                          </div>
                                        </div>
                                        <div className="text-right">
                                          <p className="text-sm font-semibold text-white/92">~{estimate} credits</p>
                                          <p className="text-[11px] text-white/42">/{supportedFreeformDurationOptions[0] ?? '5'}s</p>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            ) : mode === 'video' && activeVideoModelDetail && !isMakeAnythingDanceRecipe ? (
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
                                          {(activeVideoModelDetail.key === 'fal_ltx23_i2v' || activeVideoModelDetail.key === 'seedance_v1_lite_i2v') ? <ModelCapabilityBadge label="Image to Video" /> : null}
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
                  ) : null}

                  {!isMakeAnythingDanceRecipe ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === 'aspect' ? null : 'aspect'))}
                      data-composer-menu="true"
                      className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <RectangleHorizontal className="h-4 w-4 text-white/60" />
                      {aspectRatio}
                      <ChevronDown className="h-4 w-4 text-muted" />
                    </button>
                    {openMenu === 'aspect' ? (
                      <div data-composer-menu="true" className="fixed inset-x-3 top-[86px] z-50 rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.99),hsl(var(--color-elevated)/0.98))] p-2.5 shadow-hard backdrop-blur-xl sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+10px)] sm:min-w-[220px]">
                        <div className="px-3 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Format</p>
                          <p className="mt-1 text-xs text-muted">Pick the output frame that best fits your social placement.</p>
                        </div>
                        {visibleAspectOptions.map((option) => (
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
                  ) : null}

                  {isAvatarDrivenRecipe ? (
                    <button
                      type="button"
                      onClick={openAvatarPicker}
                      className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      {selectedAvatar?.imageUrl ? (
                        <img src={selectedAvatar.imageUrl} alt={selectedAvatar.name} className="h-5 w-5 rounded-full object-cover" />
                      ) : (
                        <UserRound className="h-4 w-4 text-white/60" />
                      )}
                      <span className="max-w-[120px] truncate sm:max-w-[180px]">{selectedAvatar ? selectedAvatar.name : 'Select AI Avatar'}</span>
                            {isAvatarProductRecipe ? <Lock className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
                    </button>
                  ) : null}

                  {!isMakeAnythingDanceRecipe ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setOpenMenu((current) => (current === 'more' ? null : 'more'))}
                      data-composer-menu="true"
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/74 transition hover:bg-white/[0.08] hover:text-white"
                    >
                      <EllipsisIcon />
                      More
                    </button>
                    {openMenu === 'more' ? (
                      <div data-composer-menu="true" className="fixed inset-x-3 top-[86px] z-50 max-h-[75vh] overflow-y-auto rounded-[20px] border border-[hsl(var(--color-border)/0.8)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.99),hsl(var(--color-elevated)/0.98))] p-2.5 shadow-hard backdrop-blur-xl sm:absolute sm:left-0 sm:right-auto sm:top-[calc(100%+10px)] sm:min-w-[280px] sm:max-h-[min(78vh,720px)]">
                        <div className="px-3 pb-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">More</p>
                          <p className="mt-1 text-xs text-muted">
                            {isAvatarProductRecipe
                              ? 'Choose from recipe-safe models, then tune quality and duration. Voice is matched to the selected avatar.'
                              : recipeSettingsLocked
                                ? 'Recipe mode keeps settings locked to the workflow defaults.'
                                : 'Tune clip length, audio, and quality without leaving the composer.'}
                          </p>
                        </div>
                        <div className="rounded-[14px] px-3 py-2">
                          <div className="flex items-center justify-between">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Quality</p>
                            {recipeSettingsLocked && !isAvatarProductRecipe && !isPixverseRecipe ? (
                              <span className="text-[11px] text-muted">Recipe controlled</span>
                            ) : null}
                          </div>
                          <div className="mt-2 grid gap-1">
                            {visibleQualityProfiles.map((option) => {
                              const disabled = recipeSettingsLocked && !isAvatarProductRecipe && !isPixverseRecipe;
                              return (
                                <button
                                  key={option.key}
                                  type="button"
                                  onClick={() => {
                                    if (disabled) return;

                                    setQualityProfile(option.key);

                                    if (mode === 'video') {
                                      const modelKey = isAvatarProductRecipe
                                        ? resolveAvatarProductVideoModelKeyFromQuality(option.key)
                                        : resolveRouteForFamily({
                                          familyKey: selectedNormalVideoFamily?.key || selectedNormalVideoFamilyKey,
                                          qualityKey: normalizeFamilyQualityKey(option.key),
                                          generationMode: inferredFreeformGenerationMode,
                                        });

                                      if (modelKey) {
                                        setSelectedVideoModelKey(modelKey);
                                        setModelPanelKey(modelKey);
                                      }

                                      if (isAvatarProductRecipe) {
                                        setAvatarProductAdvancedControls((current) => ({
                                          ...current,
                                          video_model_key: modelKey,
                                          quality_profile: option.key,
                                        }));
                                      } else if (isPixverseRecipe) {
                                        updateRecipeSlotValue('quality_profile', normalizeFamilyQualityKey(option.key));
                                      }
                                    }
                                    closeMenus();
                                  }}
                                  disabled={disabled}
                                  className={`flex items-start justify-between rounded-[12px] px-2 py-2 text-left text-sm ${qualityProfile === option.key
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
                            {isMakeAnythingDanceRecipe ? (
                              <span className="text-[11px] text-muted">
                                {makeAnythingDanceAnalysis
                                  ? `${makeAnythingDanceAnalysis.durationSeconds.toFixed(1)}s detected`
                                  : 'Auto-detected from dance video'}
                              </span>
                            ) : recipeSettingsLocked ? (
                              <span className="text-[11px] text-muted">
                                {isAvatarProductRecipe
                                  ? avatarProductAdvancedControls.quality_profile === 'affordable'
                                    ? '5s / 10s · affordable'
                                    : `${durationPreference === '15' ? '15s' : durationPreference === '10' ? '10s' : '5s'} · selectable`
                                  : isPixverseRecipe
                                    ? `${durationPreference === '10' ? '10s' : '5s'} · selectable`
                                  : isRecipeLongForm
                                    ? 'Auto · recipe controlled'
                                    : 'Recipe controlled'}
                              </span>
                            ) : null}
                          </div>
                          {isMakeAnythingDanceRecipe ? (
                            <div className="mt-2 rounded-[14px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.62)] px-3 py-2.5 text-xs leading-5 text-muted">
                              {makeAnythingDanceAnalysis ? (
                                <>
                                  <p className="font-semibold text-text">Detected dance length: {makeAnythingDanceAnalysis.durationSeconds.toFixed(1)}s</p>
                                  <p className="mt-1">
                                    Billing follows the uploaded dance clip length. {makeAnythingDanceAnalysis.hasAudio ? 'Original audio is available for reuse.' : 'No original audio was detected in this clip.'}
                                  </p>
                                </>
                              ) : (
                                <p>Upload the dance video first. We will auto-detect clip length and audio, then use that timing for generation and credits.</p>
                              )}
                            </div>
                          ) : recipeSettingsLocked && isAvatarProductRecipe ? (
                            <div className="mt-2 grid gap-1">
                              {visibleAvatarProductDurationOptions.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    setDurationPreference(option);
                                    if (isAvatarProductRecipe) {
                                      setAvatarProductAdvancedControls((current) => ({
                                        ...current,
                                        duration_seconds: option,
                                      }));
                                    }
                                    closeMenus();
                                  }}
                                  className={`flex items-center justify-between rounded-[12px] px-2 py-2 text-sm ${durationPreference === option
                                    ? 'bg-[hsl(var(--color-accent)/0.12)] text-text'
                                    : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'
                                    }`}
                                >
                                  <span>{option}s</span>
                                  {durationPreference === option ? (
                                    <Check className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : recipeSettingsLocked && isPixverseRecipe ? (
                            <div className="mt-2 grid gap-1">
                              {(['5', '10'] as const).map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    setDurationPreference(option);
                                    updateRecipeSlotValue('duration_seconds', option);
                                    closeMenus();
                                  }}
                                  className={`flex items-center justify-between rounded-[12px] px-2 py-2 text-sm ${durationPreference === option
                                    ? 'bg-[hsl(var(--color-accent)/0.12)] text-text'
                                    : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'
                                    }`}
                                >
                                  <span>{option}s</span>
                                  {durationPreference === option ? (
                                    <Check className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                                  ) : null}
                                </button>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-2 grid gap-1">
                              {supportedFreeformDurationOptions.map((option) => (
                                <button
                                  key={option}
                                  type="button"
                                  onClick={() => {
                                    if (recipeSettingsLocked) return;
                                    setDurationPreference(option);
                                  }}
                                  disabled={recipeSettingsLocked}
                                  className={`flex items-center justify-between rounded-[12px] px-2 py-2 text-sm ${durationPreference === option ? 'bg-[hsl(var(--color-accent)/0.12)] text-text' : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'
                                    } ${recipeSettingsLocked ? 'cursor-not-allowed opacity-65' : ''}`}
                                >
                                  <span>{option}s</span>
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
                          {showNativeAudioSelector ? (
                            <div className="px-2 py-1">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Audio</p>
                                <span className="text-[11px] text-muted">
                                  {currentSupportsAutoSceneSound ? 'Silent or native scene sound' : 'Silent only'}
                                </span>
                              </div>
                              <div className="mt-2 grid gap-1">
                                {([
                                  { key: 'silent', label: 'Silent', helper: 'No narration and no native scene sound.' },
                                  ...(currentSupportsAutoSceneSound
                                    ? [{ key: 'auto_scene_sound', label: 'Auto scene sound', helper: 'Use model-native ambient or scene audio when supported.' }]
                                    : []),
                                ] as Array<{ key: AudioMode; label: string; helper: string }>).map((option) => (
                                  <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => setAudioMode(option.key)}
                                    className={`flex items-start justify-between rounded-[12px] px-2 py-2 text-left text-sm ${
                                      audioMode === option.key
                                        ? 'bg-[hsl(var(--color-accent)/0.12)] text-text'
                                        : 'text-muted hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text'
                                    }`}
                                  >
                                    <span>
                                      <span className="block font-semibold text-inherit">{option.label}</span>
                                      <span className="mt-0.5 block text-xs text-muted">{option.helper}</span>
                                    </span>
                                    {audioMode === option.key ? <Check className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" /> : null}
                                  </button>
                                ))}
                              </div>
                              {modelsLoading ? <p className="mt-2 text-xs text-muted">Refreshing model capabilities…</p> : null}
                            </div>
                          ) : null}
                          {showVoiceControls ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (recipeSettingsLocked) return;
                                setVoiceEnabled((current) => !current);
                              }}
                              disabled={recipeSettingsLocked}
                              className={`flex w-full items-center justify-between rounded-[12px] px-2 py-2 text-sm text-text hover:bg-[hsl(var(--color-bg)/0.7)] ${recipeSettingsLocked ? 'cursor-not-allowed opacity-65' : ''
                                }`}
                            >
                              <span>Voice</span>
                              <span className="text-xs text-muted">{voiceEnabled ? 'On' : 'Off'}</span>
                            </button>
                          ) : null}
                          {showVoiceControls && voiceEnabled && visibleLanguageOptions.length > 0 ? (
                            <label className="mt-2 block px-2">
                              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Language</span>
                              <select
                                value={selectedLanguage}
                                onChange={(event) => {
                                  const nextLanguage = event.target.value;
                                  setSelectedLanguage(nextLanguage);
                                  if (isAvatarProductRecipe) {
                                    setAvatarProductAdvancedControls((current) => ({
                                      ...current,
                                      language: nextLanguage,
                                    }));
                                  }
                                }}
                                className="w-full rounded-[12px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.72)] px-3 py-2 text-sm text-text outline-none transition focus:border-[hsl(var(--color-accent)/0.5)]"
                              >
                                {visibleLanguageOptions.map((option) => (
                                  <option key={`${option.code}-${option.label}`} value={option.code}>
                                    {option.label}
                                  </option>
                                ))}
                              </select>
                            </label>
                          ) : null}
                          {showVoiceControls && voiceEnabled && avatarGenderFilteredVoiceOptions.length > 0 ? (
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
                          {showVoiceControls && avatarVoiceLocked ? (
                            <p className="mt-2 px-2 text-xs leading-5 text-muted">
                              Voice is matched to the selected AI avatar. You can choose a supported language for the same avatar workflow.
                            </p>
                          ) : null}
                          {showVoiceControls && voiceEnabled ? (
                            <div className="mt-3 px-2">
                              {isAvatarProductRecipe ? (
                                <>
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
                                      ? 'Preview uses Gemini Flash TTS with the selected avatar-product language and voice.'
                                      : 'Add a prompt to preview this voice.'}
                                  </p>
                                  {voicePreviewMessage ? <p className="mt-2 text-xs text-muted">{voicePreviewMessage}</p> : null}
                                  {voicePreviewUrl ? <audio className="mt-3 w-full" controls src={voicePreviewUrl} /> : null}
                                </>
                              ) : (
                                <>
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
                                </>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </div>
                  ) : null}

                </div>

                <div className="flex flex-col items-end gap-2">
                  {liveVideoEstimateCredits !== null ? (
                    <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-white/78">
                      Estimated: <span className="font-semibold text-white">{liveVideoEstimateCredits} credits</span>
                    </div>
                  ) : null}
                  <Button
                    type="button"
                    onClick={() => void launchUnifiedFlow()}
                    disabled={loading || uploadingAsset}
                    className="h-12 rounded-full border-0 bg-[linear-gradient(to_right,#818cf8,#a855f7)] px-6 text-sm font-semibold text-white shadow-[0_18px_40px_rgba(168,85,247,0.24)] hover:opacity-95"
                  >
                    {loading ? (
                      'Preparing…'
                    ) : uploadingAsset ? (
                      'Uploading…'
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <Play className="h-4 w-4 fill-current" />
                        Generate
                      </span>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="pt-0.5 text-[12px] text-muted">
              <div className="flex flex-wrap items-center gap-2">
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
            accept={fileInputAccept}
            className="hidden"
            onChange={async (event) => {
              const input = event.currentTarget;
              const file = input.files?.[0];
              if (!file) return;

              const uploadTarget = pendingUploadTarget;

              try {
                setUploadingAsset(true);
                if (uploadTarget && uploadTarget !== 'composer-asset') {
                  setActiveUploadSlotId(uploadTarget);
                  const uploaded = await api.uploadFileDirect({ file, kind: 'recipe_input' }, userId);
                  const slot = recipeComposer?.slots.find((item) => item.id === uploadTarget);
                  const isVideoUpload = slot?.submitTarget === 'video';
                  let analysis: SlotAssetState['analysis'] = null;
                  if (isVideoUpload) {
                    const inspected = await api.analyzeMakeAnythingDanceVideo(uploaded.public_url, userId);
                    analysis = {
                      durationSeconds: Number(inspected.duration_seconds),
                      billedDurationSeconds: Number(inspected.billed_duration_seconds),
                      hasAudio: Boolean(inspected.has_audio),
                    };
                  }

                  applySlotAsset(uploadTarget, {
                    label: file.name,
                    previewUrl: isVideoUpload ? null : uploaded.public_url,
                    assetUrl: uploaded.public_url,
                    mediaKind: isVideoUpload ? 'video' : 'image',
                    analysis,
                    source: 'upload',
                  });

                  show({
                    title: isVideoUpload ? 'Dance video attached' : 'Image attached',
                    message: isVideoUpload && analysis
                      ? `Detected dance length: ${analysis.durationSeconds.toFixed(1)}s${analysis.hasAudio ? ' · original audio found' : ' · no original audio detected'}.`
                      : 'Your recipe input is ready to use.',
                    variant: 'success',
                  });
                } else {
                  const uploaded = await api.uploadFileDirect({ file, kind: 'reference' }, userId);
                  setUploadedAssetName(file.name);
                  setUploadedComposerAsset({
                    label: file.name,
                    previewUrl: uploaded.public_url,
                    assetUrl: uploaded.public_url,
                    mediaKind: 'image',
                    analysis: null,
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
                const message = getFriendlyErrorMessage(uploadError) || `Could not upload that ${fileInputAccept.startsWith('video') ? 'video' : 'image'}.`;
                setError(message);
                show({ title: 'Upload failed', message, variant: 'error' });
              } finally {
                setUploadingAsset(false);
                setActiveUploadSlotId(null);
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
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {([
                ['all', 'All'],
                ['image', 'Images'],
                ['video', 'Videos'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setInspirationTabFilter(value)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold transition ${inspirationTabFilter === value ? 'border border-[hsl(var(--color-accent)/0.34)] bg-[hsl(var(--color-accent)/0.18)] text-text' : 'border border-[hsl(var(--color-border)/0.74)] bg-[hsl(var(--color-surface)/0.72)] text-muted hover:text-text'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {loadingInspirationPhotos ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-muted">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Loading inspiration
                </div>
                <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <div
                      key={`inspiration-skeleton-${index}`}
                      className={`mb-4 break-inside-avoid animate-pulse rounded-[28px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.55)] ${index % 4 === 0 ? 'h-[340px]' : index % 4 === 1 ? 'h-[460px]' : index % 4 === 2 ? 'h-[390px]' : 'h-[520px]'
                        }`}
                    />
                  ))}
                </div>
              </div>
            ) : inspirationPhotoCards.length === 0 ? (
              <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.52)] px-6 py-10 text-center">
                <p className="text-sm font-semibold text-text">No inspiration yet</p>
                <p className="mt-2 text-sm text-muted">Published approved images and videos will appear here once you open this tab.</p>
              </div>
            ) : (
              <div className="columns-1 gap-4 sm:columns-2 xl:columns-4">
                {inspirationPhotoCards.map((item) => (
                  <ComposerPoster
                    key={item.id}
                    title={item.title}
                    previewUrl={item.previewUrl}
                    previewVideoUrl={item.previewVideoUrl}
                    onClick={() => setSelectedInspirationPhoto(item)}
                    badge={item.badge}
                    ctaLabel={isVideoInspiration(item.raw) ? 'View inspiration' : 'Use this style'}
                  />
                ))}
              </div>
            )}
          </div>
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

      <Modal open={Boolean(selectedRecipe)} onClose={() => setSelectedRecipe(null)} size="md">
        {selectedRecipe ? (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-3">

              {selectedRecipe.previewVideoUrl ? (
                <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.82)] p-2">
                  <p className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Preview</p>
                  <LandingVideo
                    src={selectedRecipe.previewVideoUrl}
                    poster={selectedRecipe.previewUrl}
                    className="w-full rounded-[18px] bg-black object-cover"
                  />
                </div>
              ) : null}
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
                <Button
                  type="button"
                  onClick={() => {
                    if (selectedRecipe?.id === 'avatar_product') {
                      console.log('[DEBUG] Avatar product selected, navigating to category selection');
                      setSelectedRecipe(null);
                      router.push('/story-ad?step=category');
                    } else {
                      applyRecipeToComposer(selectedRecipe);
                    }
                  }}
                  className="w-full rounded-[16px] py-3 text-sm font-semibold"
                >
                  {recipeModalCopy(selectedRecipe)}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>

      {selectedInspirationPhoto ? (
        isVideoInspiration(selectedInspirationPhoto.raw) ? (
          <Modal open={Boolean(selectedInspirationPhoto)} onClose={() => setSelectedInspirationPhoto(null)}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.88)] p-2">
                <LandingVideo
                  src={selectedInspirationPhoto.previewVideoUrl ?? selectedInspirationPhoto.previewUrl}
                  poster={selectedInspirationPhoto.previewUrl}
                  className="w-full rounded-[18px] bg-black object-cover"
                />
              </div>
              <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.78)] p-5">
                <div className="flex flex-wrap gap-2">
                  {selectedInspirationPhoto.badge ? <Badge variant="outline">{selectedInspirationPhoto.badge}</Badge> : null}
                  <Badge variant="outline">{selectedInspirationPhoto.creatorName}</Badge>
                  <Badge variant="outline">{selectedInspirationPhoto.modelKey}</Badge>
                </div>
                <h3 className="mt-4 font-heading text-2xl font-extrabold tracking-tight text-text">{selectedInspirationPhoto.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{selectedInspirationPhoto.prompt}</p>
                <p className="mt-4 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Browse-only inspiration video</p>
              </div>
            </div>
          </Modal>
        ) : (
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
        )
      ) : null}

    </div>
  );
}

function EllipsisIcon() {
  return <span className="text-base leading-none">…</span>;
}
