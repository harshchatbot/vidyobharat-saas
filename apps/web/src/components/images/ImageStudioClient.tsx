'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronRight,
  Clapperboard,
  Copy,
  Download,
  Eraser,
  ExternalLink,
  Filter,
  GalleryVerticalEnd,
  ImageIcon,
  Images,
  Info,
  Lightbulb,
  Heart,
  LoaderCircle,
  Search,
  RotateCcw,
  Sparkles,
  Tag,
  Trash2,
  Upload,
  Wand2,
  Wallet,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useCredits } from '@/components/credits/CreditContext';
import { useCreditEstimator } from '@/components/credits/useCreditEstimator';
import { ActiveProjectBar } from '@/components/projects/ActiveProjectBar';
import { ProjectAssignmentDialog } from '@/components/projects/ProjectAssignmentDialog';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetTagFacet, GeneratedImage, ImageModel, ImageQuickTemplate, InspirationImage, Project, Template, TemplateInputField } from '@/types/api';

type Props = {
  userId: string;
  initialProjectId?: string;
  initialPrompt?: string;
  initialImageMode?: ImageModeKey;
  initialSelectedModelKey?: string;
  initialAspectRatio?: string;
  initialResolution?: string;
  initialAutoGenerate?: boolean;
  embedded?: boolean;
};

type ImageTemplatePreset = {
  id: string;
  category: string;
  title: string;
  description: string;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  model_key: string;
  thumbnail_url: string;
  visual_prompt?: string | null;
  inputs?: TemplateInputField[];
};

type ImageGenerationPayload = {
  model_key: string;
  prompt: string;
  aspect_ratio: string;
  resolution: string;
  image_count?: number;
  reference_urls: string[];
  reference_mode?: 'inspiration' | 'edit';
  project_id?: string;
  mode_id?: string;
  template_id?: string;
  request_id?: string;
};

type ImageModeKey = 'fast_social' | 'premium_realism' | 'design_carousel' | 'portrait_character';
type ReferenceMode = 'inspiration' | 'edit';
type ImageQuickStartKey = 'daily_reel_visual' | 'premium_reel_visual' | 'carousel_ad_visual' | 'character_influencer_portrait';
type ImageQuickStartPreset = {
  title: string;
  description: string;
  imageMode: ImageModeKey;
  aspectRatio: string;
  resolution: string;
  prompt: string;
};

const IMAGE_STUDIO_CACHE_TTL_MS = 2 * 60 * 1000;
const IMAGE_STUDIO_INITIAL_GENERATED_LIMIT = 3;
const IMAGE_STUDIO_LOAD_MORE_STEP = 8;

const fallbackModels: ImageModel[] = [
  {
    key: 'budget_image_model',
    label: 'Fast Social Images',
    description: 'Budget-friendly image generation for quick social content and rapid iteration.',
    frontend_hint: 'Primary fast lane. Uses the cheapest available production image route.',
    provider: 'Together',
    badge: 'Affordable',
    logo_label: 'T',
    provider_id: 'together',
    canonical_model_key: 'budget_image_model',
    mode_ids: ['fast_social'],
    billing_unit: 'per_image',
  },
  {
    key: 'gpt_image_1_5',
    label: 'GPT Image 1.5',
    description: 'Premium realistic image generation with strong prompt fidelity.',
    frontend_hint: 'Best for polished brand visuals, ads, thumbnails, and premium realism.',
    provider: 'OpenAI',
    badge: 'Recommended',
    logo_label: 'O',
    provider_id: 'openai',
    canonical_model_key: 'gpt_image_1_5',
    mode_ids: ['creator_quality'],
    billing_unit: 'per_image',
  },
  {
    key: 'recraft',
    label: 'Recraft',
    description: 'Design-focused image generation for posters, carousels, and structured graphics.',
    frontend_hint: 'Best for graphics, layouts, poster design, and carousel-style outputs.',
    provider: 'Recraft',
    badge: 'Design',
    logo_label: 'R',
    provider_id: 'recraft',
    canonical_model_key: 'recraft',
    mode_ids: ['design_carousel'],
    billing_unit: 'per_image',
  },
  {
    key: 'gemini_flash_image',
    label: 'Gemini 3.1 Flash Image',
    description: 'Fast, affordable Gemini image generation for high-volume creative work.',
    frontend_hint: 'Formerly Nano Banana. Best for social visuals, drafts, and rapid testing.',
    provider: 'Google',
    badge: 'Affordable',
    logo_label: 'G',
    alias_hint: 'Previously Nano Banana',
  },
  {
    key: 'gemini_pro_image',
    label: 'Gemini 3 Pro Image',
    description: 'Higher-end Gemini output for polished brand visuals and premium creative assets.',
    frontend_hint: 'Use this when you want stronger visual refinement from Gemini.',
    provider: 'Google',
    badge: 'Premium',
    logo_label: 'G',
  },
  {
    key: 'openai_image',
    label: 'OpenAI Image',
    description: 'Reliable general-purpose image generation with consistent prompt following.',
    frontend_hint: 'Use this for dependable production output and practical prompt iteration.',
    provider: 'OpenAI',
    badge: 'Premium',
    logo_label: 'O',
  },
  {
    key: 'recraft_studio',
    label: 'Recraft Studio',
    description: 'Design-forward image generation tuned for ads, branding, and polished creative assets.',
    frontend_hint: 'Mapped to Recraft V4 for design systems, product ads, and premium asset work.',
    provider: 'Recraft',
    badge: 'Design',
    logo_label: 'R',
  },
];

const aspectOptions = [
  { value: '9:16', label: 'Reels / Shorts', helper: 'Vertical social' },
  { value: '4:5', label: 'Instagram Feed', helper: 'Portrait post' },
  { value: '1:1', label: 'Square', helper: 'Grid-friendly' },
  { value: '16:9', label: 'YouTube', helper: 'Landscape' },
];

const resolutionOptions = [
  { value: '1024', label: '1K', helper: 'Fast previews' },
  { value: '1536', label: '1.5K', helper: 'Balanced quality' },
  { value: '2048', label: '2K', helper: 'High detail' },
];
const MAX_PROMPT_CHARS = 2000;

const powerWords = [
  'Cinematic',
  'Cyberpunk',
  'Minimalist',
  'Bokeh',
  'Editorial',
  'Luxury',
  'Dramatic lighting',
  'Soft shadows',
  'Ultra-detailed',
  'Photoreal',
];

const quickTemplates: ImageQuickTemplate[] = [
  {
    id: 'ecom-marble',
    category: 'E-commerce',
    title: 'Product on a marble table',
    prompt: 'Premium product hero shot on a marble table, soft studio lighting, luxury commercial styling, subtle reflections, clean background.',
    aspect_ratio: '4:5',
    resolution: '1536',
    model_key: 'recraft_studio',
  },
  {
    id: 'fashion-studio',
    category: 'E-commerce',
    title: 'Model wearing clothes in a studio',
    prompt: 'Fashion campaign portrait of a model wearing street-luxury apparel in a premium studio, editorial lighting, clean backdrop, detailed fabric texture.',
    aspect_ratio: '4:5',
    resolution: '2048',
    model_key: 'gemini_pro_image',
  },
  {
    id: 'thumbnail-bg',
    category: 'YouTube / Social Media',
    title: 'Dramatic thumbnail background',
    prompt: 'High-energy YouTube thumbnail background with dramatic lighting, strong depth, bold contrast, clear subject area, and visual impact.',
    aspect_ratio: '16:9',
    resolution: '1536',
    model_key: 'gemini_flash_image',
  },
  {
    id: 'podcast-cover',
    category: 'YouTube / Social Media',
    title: 'Podcast cover art',
    prompt: 'Modern podcast cover art with bold title space, moody gradients, studio microphone energy, polished creator branding, and clean composition.',
    aspect_ratio: '1:1',
    resolution: '1536',
    model_key: 'recraft_studio',
  },
  {
    id: 'character-concept',
    category: 'Gaming / Fantasy',
    title: 'Character concept art',
    prompt: 'Epic fantasy character concept art, layered costume detail, rich atmosphere, cinematic rim light, painterly depth, premium concept-sheet quality.',
    aspect_ratio: '9:16',
    resolution: '2048',
    model_key: 'recraft_studio',
  },
  {
    id: 'world-landscape',
    category: 'Gaming / Fantasy',
    title: 'World-building landscape',
    prompt: 'Massive fantasy landscape with layered mountains, magical architecture, atmospheric depth, volumetric light, and grand cinematic scale.',
    aspect_ratio: '16:9',
    resolution: '2048',
    model_key: 'gemini_pro_image',
  },
];

const IMAGE_WORKFLOW_OPTIONS: Array<{
  key: ImageModeKey;
  label: string;
  badge: string;
  description: string;
  helper: string;
  candidateModels: string[];
}> = [
  {
    key: 'fast_social',
    label: 'Fast Social',
    badge: 'Affordable',
    description: 'Best for quick daily reel visuals, social drafts, and rapid creative testing.',
    helper: 'Best value for everyday creator content.',
    candidateModels: ['budget_image_model', 'gemini_flash_image'],
  },
  {
    key: 'premium_realism',
    label: 'Creator Quality',
    badge: 'Recommended',
    description: 'Better polish for important posts, premium ads, thumbnails, and hero visuals.',
    helper: 'Use when quality matters more than speed.',
    candidateModels: ['gpt_image_1_5', 'openai_image', 'gemini_pro_image'],
  },
  {
    key: 'design_carousel',
    label: 'Design / Carousel',
    badge: 'Hot',
    description: 'Ideal for branded social posts, carousels, graphics, and layout-first content.',
    helper: 'Use for structured designs, ads, and typography-safe compositions.',
    candidateModels: ['recraft', 'recraft_studio'],
  },
  {
    key: 'portrait_character',
    label: 'Character / Influencer',
    badge: 'Character',
    description: 'Best for portraits, creator avatars, influencer looks, and character-led content.',
    helper: 'Use when identity, face quality, or character presence matters most.',
    candidateModels: ['gemini_pro_image', 'gpt_image_1_5', 'openai_image'],
  },
];

const IMAGE_WORKFLOW_PLACEHOLDERS: Record<ImageModeKey, string> = {
  fast_social:
    'Describe the visual for your reel or post. Example: a bright Indian street-food product shot at golden hour, crisp composition, social-first framing, scroll-stopping daily content style.',
  premium_realism:
    'Describe the visual for your important post or ad. Example: a photoreal premium skincare bottle on wet black stone, cinematic studio lighting, premium reflections, ultra-detailed commercial finish.',
  design_carousel:
    'Describe the design you want to create. Example: a modern carousel cover about 5 habits that improve focus, bold editorial typography, structured layout, brand-safe colors, premium social design style.',
  portrait_character:
    'Describe the character or creator look you want. Example: a confident cinematic portrait of a young Indian creator in a contemporary studio, expressive eyes, natural skin detail, premium influencer poster look.',
};

const IMAGE_QUICK_START_PRESETS: Record<ImageQuickStartKey, ImageQuickStartPreset> = {
  daily_reel_visual: {
    title: 'Daily Reel Visual',
    description: 'A fast creator-ready start for everyday social posts and reels.',
    imageMode: 'fast_social',
    aspectRatio: '9:16',
    resolution: '1536',
    prompt: 'A cinematic vertical visual for a motivational reel about consistency, dramatic lighting, strong focal subject, emotional mood, premium social content style.',
  },
  premium_reel_visual: {
    title: 'Premium Reel Visual',
    description: 'A stronger starting point for standout storytelling and polished social visuals.',
    imageMode: 'premium_realism',
    aspectRatio: '9:16',
    resolution: '1536',
    prompt: 'A high-impact vertical visual for a premium storytelling reel, rich cinematic lighting, dramatic composition, polished textures, and scroll-stopping detail.',
  },
  carousel_ad_visual: {
    title: 'Carousel / Ad Visual',
    description: 'A clean setup for branded graphics, ad creatives, and carousel covers.',
    imageMode: 'design_carousel',
    aspectRatio: '4:5',
    resolution: '1536',
    prompt: 'A clean, premium Instagram carousel cover for a business growth tip, modern design aesthetic, bold focal composition, and space for headline text.',
  },
  character_influencer_portrait: {
    title: 'Character / Influencer Portrait',
    description: 'A guided portrait setup for creators, personas, and character-led visuals.',
    imageMode: 'portrait_character',
    aspectRatio: '9:16',
    resolution: '1536',
    prompt: 'A premium portrait of a confident creator-style character with cinematic lighting, strong facial detail, stylish wardrobe, and high-end social branding aesthetic.',
  },
};

function toFriendlyImageEstimateLabel(component: string, label?: string | null) {
  if (component === 'model_price') return 'Base generation';
  if (component === 'base') return 'Base generation';
  if (component === 'character_consistency') return 'Reference guidance';
  if (component === 'resolution_multiplier') return 'Resolution';
  if (component === 'model_multiplier') return 'Model quality';
  return label || component;
}

function resolveEstimateModel(models: ImageModel[], selectedModelKey: string) {
  const selected =
    models.find((item) => item.key === selectedModelKey) ??
    fallbackModels.find((item) => item.key === selectedModelKey) ??
    null;
  if (!selected) {
    return {
      estimateModelKey: selectedModelKey,
      estimateModelLabel: selectedModelKey,
      displayModel: null as ImageModel | null,
    };
  }
  const canonicalKey = selected.canonical_model_key || selected.key;
  const canonicalModel =
    models.find((item) => item.key === canonicalKey) ??
    fallbackModels.find((item) => item.key === canonicalKey) ??
    null;
  return {
    estimateModelKey: canonicalKey,
    estimateModelLabel: canonicalModel?.label || selected.label,
    displayModel: selected,
  };
}

function getImageModeForModel(models: ImageModel[], modelKey: string): ImageModeKey {
  for (const option of IMAGE_WORKFLOW_OPTIONS) {
    const resolved = option.candidateModels.find((candidate) => models.some((item) => item.key === candidate));
    if (resolved === modelKey) return option.key;
  }
  return 'fast_social';
}

function resolveImageModeModel(models: ImageModel[], modeKey: ImageModeKey) {
  const option = IMAGE_WORKFLOW_OPTIONS.find((item) => item.key === modeKey) ?? IMAGE_WORKFLOW_OPTIONS[0];
  return option.candidateModels.find((candidate) => models.some((item) => item.key === candidate)) ?? null;
}

function isOpenAIImageModel(models: ImageModel[], modelKey: string) {
  const match = models.find((item) => item.key === modelKey) ?? fallbackModels.find((item) => item.key === modelKey) ?? null;
  return match?.provider_id === 'openai' || match?.provider === 'OpenAI';
}

function findOpenAIImageModelKey(models: ImageModel[]) {
  return (
    models.find((item) => item.key === 'openai_image')?.key ??
    fallbackModels.find((item) => item.key === 'openai_image')?.key ??
    models.find((item) => item.provider_id === 'openai' || item.provider === 'OpenAI')?.key ??
    fallbackModels.find((item) => item.provider_id === 'openai' || item.provider === 'OpenAI')?.key ??
    null
  );
}

function normalizeTemplateOptions(field: TemplateInputField): Array<{ label: string; value: string }> {
  return (field.options || []).map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : { label: option.label || option.value, value: option.value },
  );
}

function buildTemplateInputDefaults(template: ImageTemplatePreset | null): Record<string, string> {
  if (!template?.inputs?.length) return {};
  return Object.fromEntries(
    template.inputs.map((field) => [field.key, field.placeholder || (normalizeTemplateOptions(field)[0]?.value ?? '')]),
  );
}

function renderTemplatePrompt(template: ImageTemplatePreset, values: Record<string, string>) {
  let prompt = template.prompt;
  for (const field of template.inputs || []) {
    const placeholder = `{${field.key}}`;
    const replacement = values[field.key]?.trim() || field.placeholder || '';
    prompt = prompt.replaceAll(placeholder, replacement);
  }
  prompt = prompt.replace(/\{[^}]+\}/g, '').replace(/\s+/g, ' ').trim();
  const basePrompt = prompt || template.description || template.title;
  const details: string[] = [basePrompt];
  if (template.visual_prompt) details.push(`Visual direction: ${template.visual_prompt}.`);
  return details.join(' ').trim();
}

function pickTemplatePreviewPrompt(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const payload = value as Record<string, unknown>;
  const direct =
    payload.promptPreview ??
    payload.prompt ??
    payload.imagePrompt ??
    payload.videoPrompt ??
    payload.scriptPreview;
  return typeof direct === 'string' ? direct.trim() : '';
}

function mapUnifiedTemplateToImagePreset(template: Template): ImageTemplatePreset {
  const defaults = template.generation_defaults || {};
  return {
    id: template.id,
    category: template.category,
    title: template.name,
    description: template.short_description || template.description || template.name,
    prompt: template.prompt_template || template.description || template.name,
    aspect_ratio: defaults.aspect_ratio || template.aspect_ratio || '4:5',
    resolution: defaults.resolution || '1536',
    model_key: defaults.model_key || 'budget_image_model',
    thumbnail_url: template.preview_image_url || template.thumbnail_url,
    visual_prompt: template.visual_prompt,
    inputs: template.inputs || [],
  };
}

const PROVIDER_LOGO_STYLES: Record<string, string> = {
  Google: 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]',
  OpenAI: 'bg-[hsl(var(--color-surface)/0.8)] text-text',
  Recraft: 'bg-[hsl(var(--color-danger)/0.12)] text-[hsl(var(--color-danger))]',
};

function toAbsoluteUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

function formatCreatedAt(value: string) {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const maybeDetail = (error as { detail?: unknown }).detail;
    if (typeof maybeDetail === 'string' && maybeDetail.trim()) return maybeDetail;
    if (maybeDetail && typeof maybeDetail === 'object') {
      const message = (maybeDetail as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim()) return message;
      try {
        return JSON.stringify(maybeDetail);
      } catch {
        return fallback;
      }
    }
  }

  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(error.message) as {
      detail?: string | { message?: string };
      message?: string;
      error?: string;
    };
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail;
    if (parsed.detail && typeof parsed.detail === 'object' && typeof parsed.detail.message === 'string' && parsed.detail.message.trim()) {
      return parsed.detail.message;
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
  } catch {
    // fall through
  }
  if (error.message === '[object Object]') return fallback;
  return error.message || fallback;
}

function getPreviewImageUrl(item: GeneratedImage | InspirationImage | null) {
  if (!item) return null;
  return toAbsoluteUrl(item.image_url);
}

function getPreviewImageLabel(item: GeneratedImage | InspirationImage | null) {
  if (!item) return '';
  return 'title' in item ? item.title : item.prompt;
}

function buildTagFacets(items: GeneratedImage[]): AssetTagFacet[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of [...item.auto_tags, ...item.user_tags]) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function ImageStudioClient({
  userId,
  initialProjectId,
  initialPrompt,
  initialImageMode,
  initialSelectedModelKey,
  initialAspectRatio,
  initialResolution,
  initialAutoGenerate = false,
  embedded = false,
}: Props) {
  const cacheKey = `rangmanch:image-studio:v1:${userId}`;
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [cacheWarm, setCacheWarm] = useState(false);
  const [models, setModels] = useState<ImageModel[]>(fallbackModels);
  const [imageTemplates, setImageTemplates] = useState<ImageTemplatePreset[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? '');
  const [projectCreating, setProjectCreating] = useState(false);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<ImageTemplatePreset | null>(null);
  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({});
  const [templatePromptPreview, setTemplatePromptPreview] = useState('');
  const [templatePromptPreviewLoading, setTemplatePromptPreviewLoading] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [inspiration, setInspiration] = useState<InspirationImage[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [studioFeedLoading, setStudioFeedLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [enhancing, setEnhancing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimateErrorShown, setEstimateErrorShown] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generated' | 'inspiration'>('generated');
  const [selectedInspiration, setSelectedInspiration] = useState<InspirationImage | null>(null);
  const [selectedGenerated, setSelectedGenerated] = useState<GeneratedImage | null>(null);
  const [projectAssignmentTarget, setProjectAssignmentTarget] = useState<GeneratedImage | null>(null);
  const [assigningProjectId, setAssigningProjectId] = useState<string | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [selectedModel, setSelectedModel] = useState(initialSelectedModelKey ?? 'budget_image_model');
  const [imageMode, setImageMode] = useState<ImageModeKey>('fast_social');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [lastGenerationPayload, setLastGenerationPayload] = useState<ImageGenerationPayload | null>(null);
  const [referenceUploads, setReferenceUploads] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>('inspiration');
  const [uploadingReference, setUploadingReference] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');
  const [quickStartFeedback, setQuickStartFeedback] = useState<{ title: string; description: string } | null>(null);
  const didApplyInitialConfigRef = useRef(false);
  const didAutoGenerateRef = useRef(false);
  const [wantsVariations, setWantsVariations] = useState(false);
  const [imageCount, setImageCount] = useState(2);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedModelFilters, setSelectedModelFilters] = useState<string[]>([]);
  const [selectedResolutionFilters, setSelectedResolutionFilters] = useState<string[]>([]);
  const [manualTagInput, setManualTagInput] = useState('');
  const [allGeneratedImages, setAllGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generatedFetchLimit, setGeneratedFetchLimit] = useState(IMAGE_STUDIO_INITIAL_GENERATED_LIMIT);
  const [loadingMoreGenerated, setLoadingMoreGenerated] = useState(false);
  const [hasMoreGenerated, setHasMoreGenerated] = useState(false);
  const prefersUnifiedComposer = !embedded && !(initialPrompt ?? '').trim();
  const { wallet, refreshing: creditsRefreshing, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();
  const requestedImageCount = wantsVariations ? imageCount : 1;

  const reportUiError = (title: string, error: unknown, fallback: string) => {
    const message = toErrorMessage(error, fallback);
    setError(message);
    show({ title, message, variant: 'error', durationMs: 5200 });
    return message;
  };

  const applyGeneratedFilters = (
    items: GeneratedImage[],
    nextQuery = searchQuery,
    nextTags = selectedTags,
    nextModels = selectedModelFilters,
    nextResolutions = selectedResolutionFilters,
  ) => {
    const normalizedQuery = nextQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      const searchable = `${item.prompt} ${item.auto_tags.join(' ')} ${item.user_tags.join(' ')}`.toLowerCase();
      const matchesQuery = !normalizedQuery || searchable.includes(normalizedQuery);
      const imageTags = [...item.auto_tags, ...item.user_tags].map((tag) => tag.toLowerCase());
      const matchesTags = nextTags.length === 0 || nextTags.every((tag) => imageTags.includes(tag.toLowerCase()));
      const matchesModel = nextModels.length === 0 || nextModels.includes(item.model_key);
      const matchesResolution = nextResolutions.length === 0 || nextResolutions.includes(item.resolution);
      return matchesQuery && matchesTags && matchesModel && matchesResolution;
    });
    setGeneratedImages(filtered);
  };

  const refreshGeneratedFeed = async (
    limit = generatedFetchLimit,
    nextQuery = searchQuery,
    nextTags = selectedTags,
    nextModels = selectedModelFilters,
    nextResolutions = selectedResolutionFilters,
  ) => {
    const items = await api.listGeneratedImages(userId, limit);
    setAllGeneratedImages(items);
    setHasMoreGenerated(items.length >= limit);
    applyGeneratedFilters(items, nextQuery, nextTags, nextModels, nextResolutions);
    return items;
  };

  const refreshTagFacets = async (itemsOverride?: GeneratedImage[]) => {
    try {
      const facets = await api.listAssetTags(userId, { content_type: 'image' });
      setTagFacets(facets);
    } catch {
      setTagFacets(buildTagFacets(itemsOverride ?? allGeneratedImages));
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        ts: number;
        models: ImageModel[];
        inspiration: InspirationImage[];
        imageData: GeneratedImage[];
        tagData: AssetTagFacet[];
        imageTemplates?: ImageTemplatePreset[];
        projects?: Project[];
      };
      if (!cached.ts || Date.now() - cached.ts > IMAGE_STUDIO_CACHE_TTL_MS) return;
      const nextModels = cached.models?.length ? cached.models : fallbackModels;
      setModels(nextModels);
      setSelectedModel((current) => {
        if (nextModels.some((item) => item.key === current)) return current;
        return resolveImageModeModel(nextModels, 'fast_social') ?? nextModels[0]?.key ?? 'budget_image_model';
      });
      setInspiration(cached.inspiration ?? []);
      setStudioFeedLoading(false);
      setImageTemplates(cached.imageTemplates?.length ? cached.imageTemplates : quickTemplates.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        description: item.prompt,
        prompt: item.prompt,
        aspect_ratio: item.aspect_ratio,
        resolution: item.resolution,
        model_key: item.model_key,
        thumbnail_url: '',
      })));
      setTemplatesLoading(false);
      setProjects(cached.projects ?? []);
      setProjectsLoading(false);
      setAllGeneratedImages(cached.imageData ?? []);
      applyGeneratedFilters(
        cached.imageData ?? [],
        searchQuery,
        selectedTags,
        selectedModelFilters,
        selectedResolutionFilters,
      );
      setTagFacets(cached.tagData ?? []);
      setCacheWarm(true);
      setLoading(false);
    } catch {
      // ignore malformed cache
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    if (!cacheWarm) {
      setLoading(true);
      setProjectsLoading(true);
      setTemplatesLoading(true);
      setStudioFeedLoading(true);
    }

    const corePromise = Promise.allSettled([
      api.listImageModels(userId),
      api.listUnifiedTemplates(userId, { type: 'image', active: true }),
      api.listProjects(userId),
    ]).then(([modelResult, templateResult, projectResult]) => {
      if (cancelled) return;
      const modelData = modelResult.status === 'fulfilled' ? modelResult.value : fallbackModels;
      const templateData = templateResult.status === 'fulfilled' ? templateResult.value : [];
      const projectData = projectResult.status === 'fulfilled' ? projectResult.value : [];
      const nextModels = modelData.length > 0 ? modelData : fallbackModels;
      const nextTemplates = templateData.length > 0 ? templateData.map(mapUnifiedTemplateToImagePreset) : quickTemplates.map((item) => ({
        id: item.id,
        category: item.category,
        title: item.title,
        description: item.prompt,
        prompt: item.prompt,
        aspect_ratio: item.aspect_ratio,
        resolution: item.resolution,
        model_key: item.model_key,
        thumbnail_url: '',
      }));
      setModels(nextModels);
      setImageTemplates(nextTemplates);
      setProjects(projectData);
      setSelectedModel((current) => {
        if (nextModels.some((item) => item.key === current)) return current;
        return resolveImageModeModel(nextModels, 'fast_social') ?? nextModels[0]?.key ?? 'budget_image_model';
      });
      setTemplatesLoading(false);
      setProjectsLoading(false);
    });

    const feedPromise = Promise.allSettled([
      api.listImageInspiration(userId),
      api.listGeneratedImages(userId, IMAGE_STUDIO_INITIAL_GENERATED_LIMIT),
    ]).then(([inspirationResult, imagesResult]) => {
      if (cancelled) return;
      const inspirationData = inspirationResult.status === 'fulfilled' ? inspirationResult.value : [];
      const imageData = imagesResult.status === 'fulfilled' ? imagesResult.value : [];
      setInspiration(inspirationData);
      setAllGeneratedImages(imageData);
      setHasMoreGenerated(imageData.length >= IMAGE_STUDIO_INITIAL_GENERATED_LIMIT);
      applyGeneratedFilters(imageData, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters);
      setStudioFeedLoading(false);
      if (inspirationResult.status === 'rejected' && imagesResult.status === 'rejected') {
        show({
          title: 'Studio feed unavailable',
          message: 'Your images and inspiration took too long to load. Please refresh and check the API connection.',
          variant: 'error',
          durationMs: 5200,
        });
      }
    });

    void api.listAssetTags(userId, { content_type: 'image' })
      .then((tagData) => {
        if (cancelled) return;
        setTagFacets(tagData);
      })
      .catch(() => {
        if (cancelled) return;
        setTagFacets(buildTagFacets(allGeneratedImages));
      });

    void Promise.allSettled([corePromise, feedPromise]).then(() => {
      if (cancelled) return;
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, cacheWarm, show, userId]);

  const createProjectFromCurrentImageDraft = async () => {
    setProjectCreating(true);
    try {
      const project = await api.createProject(
        {
          user_id: userId,
          title: activeTemplate?.title || prompt.trim().slice(0, 72) || 'Image concept',
          script: prompt.trim() || activeTemplate?.description || '',
          language: 'en-IN',
          voice: 'Shubh',
          template: activeTemplate?.id || 'image_studio',
        },
        userId,
      );
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setSelectedProjectId(project.id);
      show(`${project.title} created for this image workflow.`);
      return project.id;
    } catch (error) {
      reportUiError('Project unavailable', error, 'Could not create a project right now.');
      return null;
    } finally {
      setProjectCreating(false);
    }
  };

  const ensureProjectForImageRun = async () => {
    if (selectedProjectId) return selectedProjectId;
    if (activeTemplate) return createProjectFromCurrentImageDraft();
    return null;
  };

  useEffect(() => {
    setTemplateInputs(buildTemplateInputDefaults(activeTemplate));
    setTemplatePromptPreview('');
  }, [activeTemplate]);

  useEffect(() => {
    let cancelled = false;
    if (!templatePickerOpen || !activeTemplate) return;
    setTemplatePromptPreviewLoading(true);
    void api
      .previewTemplate(
        {
          templateId: activeTemplate.id,
          inputs: templateInputs,
          modelKey: activeTemplate.model_key,
          aspectRatio: activeTemplate.aspect_ratio,
          resolution: activeTemplate.resolution,
        },
        userId,
      )
      .then((preview) => {
        if (cancelled) return;
        const assembled = pickTemplatePreviewPrompt(preview);
        setTemplatePromptPreview(assembled || renderTemplatePrompt(activeTemplate, templateInputs));
      })
      .catch(() => {
        if (cancelled) return;
        setTemplatePromptPreview(renderTemplatePrompt(activeTemplate, templateInputs));
      })
      .finally(() => {
        if (cancelled) return;
        setTemplatePromptPreviewLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeTemplate, templateInputs, templatePickerOpen, userId]);

  useEffect(() => {
    applyGeneratedFilters(allGeneratedImages, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters);
  }, [allGeneratedImages, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters]);

  const referenceUrls = useMemo(() => referenceUploads.map((item) => item.url), [referenceUploads]);
  const selectedEstimateModel = useMemo(
    () => resolveEstimateModel(models, selectedModel),
    [models, selectedModel],
  );

  const { estimates, isEstimating, estimateError, isUsingFallback } = useCreditEstimator(
    [
      {
        key: 'imageGenerate',
        action: 'image_generate',
        payload: {
          model_key: selectedEstimateModel.estimateModelKey,
          resolution,
          image_count: requestedImageCount,
          reference_urls: referenceUrls,
          reference_mode: referenceMode,
        },
      },
    ],
    { currentCredits: wallet?.currentCredits ?? 0 },
  );
  const estimate = estimates.imageGenerate ?? null;

  useEffect(() => {
    if (!estimateError) {
      if (estimateErrorShown) setEstimateErrorShown(null);
      return;
    }
    if (estimateErrorShown === estimateError) return;
    setEstimateErrorShown(estimateError);
    show({ title: 'Estimate unavailable', message: estimateError, variant: 'error', durationMs: 4200 });
  }, [estimateError, estimateErrorShown, show]);

  useEffect(() => {
    setManualTagInput(selectedGenerated?.user_tags.join(', ') ?? '');
  }, [selectedGenerated]);

  useEffect(() => {
    if (referenceUploads.length === 0) {
      setReferenceMode('inspiration');
      return;
    }
    if (referenceUploads.length > 1 && referenceMode === 'edit') {
      setReferenceMode('inspiration');
    }
  }, [referenceMode, referenceUploads.length]);

  useEffect(() => {
    const nextMode = getImageModeForModel(models, selectedModel);
    setImageMode((current) => (current === nextMode ? current : nextMode));
  }, [models, selectedModel]);

  useEffect(() => {
    if (referenceMode !== 'edit') return;
    const openaiModelKey = findOpenAIImageModelKey(models);
    if (!openaiModelKey) return;
    if (isOpenAIImageModel(models, selectedModel)) return;
    setSelectedModel(openaiModelKey);
  }, [models, referenceMode, selectedModel]);

  useEffect(() => {
    if (!submitting) {
      setSubmitProgress(0);
      return;
    }
    setSubmitProgress(10);
    const interval = window.setInterval(() => {
      setSubmitProgress((current) => (current >= 92 ? current : current + 6));
    }, 650);
    return () => window.clearInterval(interval);
  }, [submitting]);

  const selectedModelMeta = selectedEstimateModel.displayModel ?? models[0] ?? fallbackModels[0];
  const activeImageMode = IMAGE_WORKFLOW_OPTIONS.find((mode) => mode.key === imageMode) ?? IMAGE_WORKFLOW_OPTIONS[0];
  const activePromptPlaceholder = IMAGE_WORKFLOW_PLACEHOLDERS[activeImageMode.key];
  const activeTemplatePromptPreview = activeTemplate ? renderTemplatePrompt(activeTemplate, templateInputs) : '';
  const primaryActionLoading = submitting;
  const availableImageWorkflows = IMAGE_WORKFLOW_OPTIONS.map((option) => {
    const resolvedModelKey = resolveImageModeModel(models, option.key);
    const resolvedModel = resolvedModelKey ? models.find((item) => item.key === resolvedModelKey) ?? fallbackModels.find((item) => item.key === resolvedModelKey) ?? null : null;
    return {
      ...option,
      resolvedModelKey,
      resolvedModel,
      available: Boolean(resolvedModelKey),
    };
  }).filter((option) => option.available);
  const applyImageQuickStartPreset = (presetKey: ImageQuickStartKey) => {
    const preset = IMAGE_QUICK_START_PRESETS[presetKey];
    const nextModelKey =
      resolveImageModeModel(models, preset.imageMode) ??
      resolveImageModeModel(fallbackModels, preset.imageMode) ??
      selectedModel;
    setImageMode(preset.imageMode);
    setSelectedModel(nextModelKey);
    setAspectRatio(preset.aspectRatio);
    setResolution(preset.resolution);
    setWantsVariations(false);
    setPrompt(preset.prompt);
    setActiveTemplate(null);
    setTemplateInputs({});
    setQuickStartFeedback({
      title: 'Starter settings loaded',
      description: 'We applied a strong default prompt and recommended output settings. You can edit everything below.',
    });
    window.setTimeout(() => {
      promptTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      promptTextareaRef.current?.focus();
    }, 80);
  };
  const activeTemplateEstimateText = activeTemplate
    ? `${resolutionOptions.find((item) => item.value === (activeTemplate.resolution || resolution))?.label ?? activeTemplate.resolution} • ${activeTemplate.category}`
    : null;
  const selectedInspirationModel = selectedInspiration ? models.find((model) => model.key === selectedInspiration.model_key) : null;
  const selectedGeneratedModel = selectedGenerated ? models.find((model) => model.key === selectedGenerated.model_key) : null;
  const tagSuggestions = tagFacets
    .filter((item) => item.tag.includes(searchQuery.trim().toLowerCase()))
    .slice(0, 8);
  const filteredInspiration = inspiration.filter((item) => {
    const tags = item.tags ?? [];
    const matchesQuery =
      !searchQuery.trim() ||
      `${item.title} ${item.prompt} ${tags.join(' ')}`.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesTags = selectedTags.length === 0 || selectedTags.every((tag) => tags.map((value) => value.toLowerCase()).includes(tag.toLowerCase()));
    const matchesModel = selectedModelFilters.length === 0 || selectedModelFilters.includes(item.model_key);
    const matchesResolution = selectedResolutionFilters.length === 0 || selectedResolutionFilters.includes(item.resolution);
    return matchesQuery && matchesTags && matchesModel && matchesResolution;
  });
  const hasFacetFilters = selectedTags.length > 0 || selectedModelFilters.length > 0 || selectedResolutionFilters.length > 0;
  const hasSearchFilter = searchQuery.trim().length > 0;
  const clearStudioFilters = () => {
    setSelectedTags([]);
    setSelectedModelFilters([]);
    setSelectedResolutionFilters([]);
    setSearchQuery('');
  };

  useEffect(() => {
    if (activeTab !== 'inspiration') return;
    if (inspiration.length === 0) return;
    if (filteredInspiration.length > 0) return;
    if (!hasFacetFilters) return;
    setSelectedTags([]);
    setSelectedModelFilters([]);
    setSelectedResolutionFilters([]);
  }, [activeTab, filteredInspiration.length, hasFacetFilters, inspiration.length]);

  const runImageGeneration = async (payload: ImageGenerationPayload, options?: { retry?: boolean }) => {
    const isRetry = Boolean(options?.retry);
    const requestScopedPayload: ImageGenerationPayload = {
      ...payload,
      request_id:
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    };
    setSubmitting(true);
    setRetrying(isRetry);
    setError(null);
    let createdItem: GeneratedImage | null = null;
    try {
      setSubmitProgress(14);
      createdItem = await api.generateImage(
        requestScopedPayload,
        userId,
      );
      setSubmitProgress(100);
    } catch (error) {
      reportUiError('Image generation failed', error, isRetry ? 'Retry failed. Please try again.' : 'Failed to generate image. Please try again.');
    } finally {
      setSubmitting(false);
      setRetrying(false);
    }

    if (!createdItem) return;
    setLastGenerationPayload({
      ...requestScopedPayload,
      request_id: undefined,
    });

    if (typeof createdItem.remaining_credits === 'number') {
      if (wallet) {
        applyWallet({ ...wallet, currentCredits: createdItem.remaining_credits });
      } else {
        void refreshCredits();
      }
    }
    show({
      title: isRetry ? 'Image retry complete' : 'Image created',
      message: `${requestScopedPayload.image_count ?? 1} image${(requestScopedPayload.image_count ?? 1) > 1 ? 's' : ''} ready · Credits Used: ${createdItem.applied_credits} · Remaining Balance: ${
        createdItem.remaining_credits ?? wallet?.currentCredits ?? 0
      }`,
      variant: 'success',
      celebrate: true,
      durationMs: 3600,
    });
    setSelectedGenerated(createdItem);
    setActiveTab('generated');

    try {
      const items = await refreshGeneratedFeed(generatedFetchLimit);
      await refreshTagFacets(items);
    } catch (error) {
      reportUiError('Studio refresh failed', error, 'Image was generated, but refreshing the feed took longer than expected.');
    }
  };

  const submit = async ({ requireConfirm = true }: { requireConfirm?: boolean } = {}) => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Prompt is required.');
      return;
    }
    if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
      setError(`Prompt is too long. Keep it under ${MAX_PROMPT_CHARS} characters.`);
      return;
    }
    if (referenceMode === 'edit') {
      if (referenceUrls.length !== 1) {
        setError('Source image edit mode needs exactly one uploaded reference image.');
        return;
      }
      if (!isOpenAIImageModel(models, selectedModel)) {
        setError('Source image editing currently runs on OpenAI Image. Please use the OpenAI model for this edit.');
        return;
      }
    }
    if (requireConfirm && !window.confirm('Generate this image now? Credits will be charged only if generation succeeds.')) {
      return;
    }
    const projectId = await ensureProjectForImageRun();
    const payload: ImageGenerationPayload = {
      model_key: selectedModel,
      prompt: trimmedPrompt,
      aspect_ratio: aspectRatio,
      resolution,
      image_count: requestedImageCount,
      reference_urls: referenceUrls,
      reference_mode: referenceMode,
      project_id: projectId || undefined,
      mode_id: imageMode,
      template_id: activeTemplate?.id || undefined,
    };
    await runImageGeneration(payload);
  };

  const retryLastGeneration = async (source?: GeneratedImage) => {
    const payload =
      lastGenerationPayload ??
      (source
        ? {
            model_key: source.model_key,
            prompt: source.prompt,
            aspect_ratio: source.aspect_ratio,
            resolution: source.resolution,
            image_count: 1,
            reference_urls: source.reference_urls || [],
            reference_mode: 'inspiration' as ReferenceMode,
            project_id: source.project_id || undefined,
            mode_id: source.mode_id || undefined,
            template_id: source.template_id || undefined,
          }
        : null);
    if (!payload) {
      setError('Generate at least one image first to use retry.');
      return;
    }
    await runImageGeneration(payload, { retry: true });
  };

  const enhancePrompt = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Write a base prompt first.');
      return;
    }
    if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
      setError(`Prompt is too long to enhance. Keep it under ${MAX_PROMPT_CHARS} characters.`);
      return;
    }
    setEnhancing(true);
    setError(null);
    try {
      const response = await api.enhanceImagePrompt({ prompt: trimmedPrompt, model_key: selectedModel }, userId);
      setPrompt(response.prompt);
    } catch (error) {
      reportUiError('Prompt enhancement failed', error, 'Could not enhance the prompt right now.');
    } finally {
      setEnhancing(false);
    }
  };

  const applyPowerWord = (word: string) => {
    const normalized = prompt.trim();
    if (!normalized) {
      setPrompt(word);
      return;
    }
    if (normalized.toLowerCase().includes(word.toLowerCase())) return;
    setPrompt(`${normalized}, ${word}`);
  };

  const applyImageTemplate = async (template: ImageTemplatePreset, values: Record<string, string>) => {
    setQuickStartFeedback(null);
    let nextPrompt = templatePromptPreview.trim();
    if (!nextPrompt) {
      try {
        const preview = await api.previewTemplate(
          {
            templateId: template.id,
            inputs: values,
            modelKey: template.model_key,
            aspectRatio: template.aspect_ratio,
            resolution: template.resolution,
          },
          userId,
        );
        nextPrompt = pickTemplatePreviewPrompt(preview);
      } catch {
        // fallback below
      }
    }
    if (!nextPrompt) {
      nextPrompt = renderTemplatePrompt(template, values) || template.description || template.title;
    }
    setPrompt(nextPrompt);
    setAspectRatio(template.aspect_ratio || '4:5');
    setResolution(template.resolution || '1536');
    setSelectedModel(template.model_key || resolveImageModeModel(models, 'fast_social') || 'budget_image_model');
    setActiveTemplate(template);
    setTemplatePickerOpen(false);
    show(`${template.title} applied to the image studio.`);
  };

  const uploadReferenceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingReference(true);
    setError(null);
    try {
      const nextUploads: Array<{ id: string; url: string; name: string }> = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 4 - referenceUploads.length))) {
        const signed = await api.uploadFileDirect(
          {
            file,
            kind: 'image_reference',
          },
          userId,
        );
        nextUploads.push({
          id: signed.asset_id,
          url: signed.public_url,
          name: file.name,
        });
      }
      setReferenceUploads((current) => {
        const merged = [...current, ...nextUploads].slice(0, 4);
        if (current.length === 0 && merged.length === 1) {
          setReferenceMode('edit');
        }
        return merged;
      });
    } catch (error) {
      reportUiError('Reference upload failed', error, 'Could not upload reference image right now.');
    } finally {
      setUploadingReference(false);
    }
  };

  const removeReferenceUpload = (assetId: string) => {
    setReferenceUploads((current) => current.filter((item) => item.id !== assetId));
  };

  const copyPrompt = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const downloadImage = async (imageUrl: string, fileNameBase: string) => {
    try {
      const safeName = fileNameBase.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'image';
      const response = await fetch(
        `/api/download?url=${encodeURIComponent(toAbsoluteUrl(imageUrl) ?? imageUrl)}&filename=${encodeURIComponent(safeName)}`,
      );
      if (!response.ok) {
        const message = (await response.text()) || 'Download failed';
        throw new Error(message);
      }
      const blob = await response.blob();
      const objectUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename=\"?([^\";]+)\"?/i);
      link.href = objectUrl;
      link.download = filenameMatch?.[1] || safeName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(objectUrl);
    } catch (error) {
      reportUiError('Download failed', error, 'Could not download image right now.');
    }
  };

  const runImageAction = async (imageId: string, action: 'remove_background' | 'upscale' | 'variation') => {
    setActionLoading(`${imageId}:${action}`);
    setError(null);
    try {
      const result = await api.applyImageAction(imageId, action, userId);
      if (result.items.length === 0) {
        throw new Error('No images returned');
      }
      setSelectedGenerated(result.items[0]);
      setActiveTab('generated');
      const items = await refreshGeneratedFeed(generatedFetchLimit);
      await refreshTagFacets(items);
    } catch (error) {
      reportUiError('Image action failed', error, 'Could not complete that action right now.');
    } finally {
      setActionLoading(null);
    }
  };

  const toggleFilter = (value: string, current: string[], setter: (next: string[]) => void) => {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  };

  const saveManualTags = async () => {
    if (!selectedGenerated) return;
    const nextUserTags = manualTagInput
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    try {
      const response = await api.updateAssetTags('image', selectedGenerated.id, nextUserTags, userId);
      setSelectedGenerated((current) =>
        current ? { ...current, auto_tags: response.auto_tags, user_tags: response.user_tags } : current,
      );
      setGeneratedImages((current) =>
        current.map((item) =>
          item.id === selectedGenerated.id ? { ...item, auto_tags: response.auto_tags, user_tags: response.user_tags } : item,
        ),
      );
      setManualTagInput(response.user_tags.join(', '));
      const items = await refreshGeneratedFeed(generatedFetchLimit);
      await refreshTagFacets(items);
    } catch (error) {
      reportUiError('Tag update failed', error, 'Could not update tags right now.');
    }
  };

  const togglePublish = async (image: GeneratedImage) => {
    setPublishingId(image.id);
    try {
      const result = await api.publishInspiration('image', image.id, !image.is_public_inspiration, userId);
      setGeneratedImages((current) =>
        current.map((item) =>
          item.id === image.id
            ? {
                ...item,
                is_public_inspiration: result.is_public_inspiration,
                moderation_status: result.moderation_status,
                inspiration_score: result.inspiration_score,
                like_count: result.like_count,
              }
            : item,
        ),
      );
      setSelectedGenerated((current) =>
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
      if (result.is_public_inspiration && result.moderation_status !== 'approved') {
        show('Submitted for review. Your image will appear in inspiration after quality checks.');
      } else if (result.is_public_inspiration) {
        show('Published. Your image is now live in inspiration.');
      } else {
        show('Unpublished. Your image was removed from inspiration.');
      }
      const refreshedInspiration = await api.listImageInspiration(userId).catch(() => null);
      if (refreshedInspiration) {
        setInspiration(refreshedInspiration);
      }
    } catch (error) {
      reportUiError('Publish update failed', error, 'Could not update publish status.');
    } finally {
      setPublishingId(null);
    }
  };

  const deleteGeneratedImage = async (image: GeneratedImage) => {
    setDeletingImageId(image.id);
    try {
      await api.deleteGeneratedImage(image.id, userId);
      setGeneratedImages((current) => current.filter((item) => item.id !== image.id));
      setSelectedGenerated((current) => (current?.id === image.id ? null : current));
      show('Image deleted from your studio.');
    } catch (error) {
      show(error instanceof Error ? error.message : 'Failed to delete image.');
    } finally {
      setDeletingImageId(null);
    }
  };

  const assignGeneratedImageToProject = async (projectId: string) => {
    if (!projectAssignmentTarget) return;
    setAssigningProjectId(projectAssignmentTarget.id);
    try {
      await api.assignImageToProject(projectAssignmentTarget.id, projectId, userId);
      setGeneratedImages((current) =>
        current.map((item) => (item.id === projectAssignmentTarget.id ? { ...item, project_id: projectId } : item)),
      );
      setSelectedGenerated((current) =>
        current && current.id === projectAssignmentTarget.id ? { ...current, project_id: projectId } : current,
      );
      setProjectAssignmentTarget(null);
      show('Image attached to project.');
    } catch (error) {
      reportUiError('Project assignment failed', error, 'Could not update project assignment right now.');
    } finally {
      setAssigningProjectId(null);
    }
  };

  const toggleLikeInspiration = async (item: InspirationImage) => {
    setLikingId(item.id);
    try {
      const result = await api.likeInspiration('image', item.id, !item.liked_by_user, userId);
      setInspiration((current) =>
        current.map((row) =>
          row.id === item.id
            ? { ...row, liked_by_user: result.liked, like_count: result.like_count }
            : row,
        ),
      );
      setSelectedInspiration((current) =>
        current && current.id === item.id ? { ...current, liked_by_user: result.liked, like_count: result.like_count } : current,
      );
    } catch (error) {
      reportUiError('Like update failed', error, 'Could not update like status.');
    } finally {
      setLikingId(null);
    }
  };

  const loadMoreGenerated = async () => {
    const nextLimit = generatedFetchLimit + IMAGE_STUDIO_LOAD_MORE_STEP;
    setLoadingMoreGenerated(true);
    try {
      await refreshGeneratedFeed(
        nextLimit,
        searchQuery,
        selectedTags,
        selectedModelFilters,
        selectedResolutionFilters,
      );
      setGeneratedFetchLimit(nextLimit);
    } catch (error) {
      reportUiError('Load more failed', error, 'Could not load more images right now.');
    } finally {
      setLoadingMoreGenerated(false);
    }
  };

  const livePreviewImage =
    activeTab === 'generated'
      ? selectedGenerated ?? generatedImages[0] ?? null
      : selectedInspiration ?? filteredInspiration[0] ?? null;

  const handlePrimaryAction = async () => {
    await submit();
  };

  useEffect(() => {
    if (didApplyInitialConfigRef.current) return;
    const hasInitialConfig = Boolean(initialPrompt?.trim() || initialImageMode || initialAspectRatio || initialResolution);
    if (!hasInitialConfig) return;
    if (initialPrompt?.trim()) setPrompt(initialPrompt.trim());
    if (initialImageMode) {
      setImageMode(initialImageMode);
      const resolvedModel =
        resolveImageModeModel(models, initialImageMode) ??
        resolveImageModeModel(fallbackModels, initialImageMode);
      if (resolvedModel) setSelectedModel(resolvedModel);
    }
    if (initialAspectRatio) setAspectRatio(initialAspectRatio);
    if (initialResolution) setResolution(initialResolution);
    didApplyInitialConfigRef.current = true;
  }, [initialAspectRatio, initialImageMode, initialPrompt, initialResolution, models]);

  useEffect(() => {
    if (!initialAutoGenerate || didAutoGenerateRef.current) return;
    if (!didApplyInitialConfigRef.current) return;
    if (loading || submitting) return;
    if (!prompt.trim()) return;
    didAutoGenerateRef.current = true;
    void submit({ requireConfirm: false });
  }, [initialAutoGenerate, loading, prompt, submitting]);

  return (
    <div className="space-y-0">
      <LoadingOverlay
        open={submitting}
        title="Generating your image"
        description=""
        progress={submitProgress}
      />
      <div className="rangmanch-page-stack">
      {loading ? (
        <div className="rangmanch-inline-status inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs text-muted">
          <Spinner />
          <span>Refreshing studio data…</span>
        </div>
      ) : null}
      {activeProject ? (
        <ActiveProjectBar
          project={activeProject}
          description="This image workspace is attached to the active project. New outputs, template-driven runs, and prompt variations will stay grouped there."
        />
      ) : null}
      {!embedded ? (
        <StudioPageHeader
          eyebrow="Image Studio"
          title="Image workspace"
          description={prefersUnifiedComposer ? 'Start the idea in Create, then come here for refinement, references, and output controls.' : 'Refine the image idea, references, and output settings from one cleaner workspace.'}
          actions={
            <>
              <Link href="/create">
                <Button variant="secondary" type="button" className="h-10 gap-2 rounded-[12px] px-4 text-sm">
                  <Sparkles className="h-4 w-4" />
                  Open Create
                </Button>
              </Link>
              <Button variant="secondary" type="button" onClick={() => setTemplatePickerOpen(true)} className="h-10 gap-2 rounded-[12px] px-4 text-sm">
                <GalleryVerticalEnd className="h-4 w-4" />
                Browse templates
              </Button>
              <Badge variant="outline" className="px-3 py-2 text-xs">
                {wallet?.currentCredits ?? 0} credits
              </Badge>
            </>
          }
        />
      ) : null}

      <div className="space-y-8">
        {prefersUnifiedComposer ? (
          <div className="rounded-[20px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.22)] px-4 py-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-text">Start in the unified composer</p>
                <p className="mt-1 text-xs text-muted">Use `/create` to write the prompt. This page is now better suited for refining templates, references, and outputs after the idea is already set.</p>
              </div>
              <Link href="/create">
                <Button type="button" className="w-full sm:w-auto">Go to Create</Button>
              </Link>
            </div>
          </div>
        ) : null}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] xl:items-start">
          <div className="min-w-0 space-y-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Create</p>
              <p className="mt-1 text-xl font-extrabold tracking-tight text-text">Build the visual for your next post or reel</p>
              <p className="mt-1 text-sm text-muted">Start with the type of output you want, then write the prompt and generate.</p>
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div>
                <p className="text-sm font-semibold text-text">Quick start</p>
                <p className="mt-1 text-xs text-muted">Pick a creator-ready starting point and we’ll prefill the prompt and recommended settings. Optimized for social content, and you can refine this later.</p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                {Object.entries(IMAGE_QUICK_START_PRESETS).map(([key, preset]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyImageQuickStartPreset(key as ImageQuickStartKey)}
                    className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.24)] px-3 py-3 text-left transition hover:text-text"
                  >
                    <p className="text-sm font-semibold text-text">{preset.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{preset.description}</p>
                  </button>
                ))}
              </div>
              {quickStartFeedback ? (
                <div className="rounded-[16px] border border-[hsl(var(--color-accent)/0.4)] bg-[hsl(var(--color-accent)/0.08)] px-3 py-2.5">
                  <p className="text-sm font-semibold text-text">{quickStartFeedback.title}</p>
                  <p className="mt-1 text-xs text-muted">{quickStartFeedback.description}</p>
                  <p className="mt-1 text-[11px] text-muted">Recommended settings already applied.</p>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">Template / use case</p>
                  <p className="mt-1 text-xs text-muted">Start from a proven structure instead of a blank canvas. Templates are ready-made formats. Just change the idea.</p>
                </div>
                <Button variant="secondary" type="button" onClick={() => setTemplatePickerOpen(true)} className="h-10 w-full gap-2 rounded-[12px] px-4 text-sm sm:w-auto">
                  <GalleryVerticalEnd className="h-3.5 w-3.5" />
                  Browse templates
                </Button>
              </div>
              <div className="-mx-1 px-1 pb-1">
                {templatesLoading ? (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 sm:overflow-x-auto">
                    {Array.from({ length: 4 }).map((_, idx) => (
                      <div
                        key={`template-skeleton-${idx}`}
                        className="min-w-0 overflow-hidden rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.26)] sm:min-w-[128px]"
                      >
                        <div className="aspect-[4/3] animate-pulse bg-[hsl(var(--color-elevated)/0.62)]" />
                        <div className="space-y-1.5 p-2">
                          <div className="h-2.5 w-20 animate-pulse rounded bg-[hsl(var(--color-elevated)/0.62)]" />
                          <div className="h-2 w-24 animate-pulse rounded bg-[hsl(var(--color-elevated)/0.42)]" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2 sm:overflow-x-auto">
                    {imageTemplates.slice(0, 6).map((template) => {
                      const selected = activeTemplate?.id === template.id;
                      return (
                        <button
                          key={template.id}
                          type="button"
                          onClick={() => {
                            setQuickStartFeedback(null);
                            setActiveTemplate(template);
                            setTemplatePickerOpen(true);
                          }}
                          className={`group min-w-0 overflow-hidden rounded-[16px] text-left transition sm:min-w-[128px] ${
                            selected
                              ? 'bg-[hsl(var(--color-accent)/0.1)]'
                              : 'bg-[hsl(var(--color-surface)/0.34)] hover:bg-[hsl(var(--color-surface)/0.48)]'
                          }`}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-elevated)))]">
                            {template.thumbnail_url ? (
                              <img src={template.thumbnail_url} alt={template.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                            ) : null}
                            <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.94)] via-transparent to-transparent" />
                            <div className="absolute inset-x-2 bottom-2">
                              <p className="line-clamp-1 text-xs font-semibold text-white">{template.title}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {activeTemplate ? (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Badge>{activeTemplate.title}</Badge>
                  {activeTemplateEstimateText ? <Badge>{activeTemplateEstimateText}</Badge> : null}
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTemplate(null);
                      setTemplateInputs({});
                    }}
                    className="rounded-full border border-[hsl(var(--color-border))] px-3 py-1 font-semibold text-muted hover:text-text"
                  >
                    Clear template
                  </button>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">Project</p>
                  <p className="mt-1 text-xs text-muted">Optional. Keep related outputs grouped together.</p>
                </div>
                {projectsLoading ? <Spinner /> : activeTemplate ? <span className="text-xs text-muted">Auto-create ready</span> : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Dropdown value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  <option value="">Auto-create when a guided template is used</option>
                  {projectsLoading && projects.length === 0 ? (
                    <option value="" disabled>Loading projects...</option>
                  ) : null}
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Dropdown>
                <Button variant="secondary" type="button" onClick={() => void createProjectFromCurrentImageDraft()} disabled={projectCreating}>
                  {projectCreating ? 'Creating...' : 'New project'}
                </Button>
              </div>
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Output goal</p>
                  <p className="mt-1 text-xs text-muted">Choose the kind of result you want. The best available engine is selected behind the scenes.</p>
                </div>
                <span className="text-xs text-muted">{activeImageMode.badge}</span>
              </div>
              <div className="-mx-1 px-1 pb-1">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {availableImageWorkflows.map((workflow) => {
                  const active = workflow.key === imageMode;
                  return (
                    <button
                      key={workflow.key}
                      type="button"
                      onClick={() => {
                        if (!workflow.resolvedModelKey) return;
                        setQuickStartFeedback(null);
                        setSelectedModel(workflow.resolvedModelKey);
                        setImageMode(workflow.key);
                      }}
                      className={`min-w-0 rounded-[16px] border px-3 py-2.5 text-left transition ${
                        active
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.1)] text-text'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.26)] text-muted hover:text-text'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex h-7 w-7 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-[10px] font-semibold ${PROVIDER_LOGO_STYLES[workflow.resolvedModel?.provider ?? ''] ?? 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'}`}>
                          {typeof workflow.resolvedModel?.logo_label === 'string' ? workflow.resolvedModel.logo_label : 'AI'}
                        </span>
                      <div>
                        <p className="text-sm font-semibold text-text">{workflow.label}</p>
                        <p className="text-[11px] uppercase tracking-[0.12em] text-muted">{workflow.badge}</p>
                      </div>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-muted">{workflow.helper}</p>
                  </button>
                );
              })}
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div>
                  <p className="text-sm font-semibold text-text">Output settings</p>
                  <p className="mt-1 text-xs text-muted">Choose the format and quality that best fit where you plan to publish.</p>
                </div>
              <div className="grid gap-3 md:grid-cols-[1.15fr_0.85fr]">
                <div className="rounded-[18px] bg-[hsl(var(--color-bg)/0.58)] p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {aspectOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAspectRatio(option.value)}
                        className={`rounded-full px-3 py-2 text-center text-xs font-semibold transition ${
                          aspectRatio === option.value
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'bg-[hsl(var(--color-surface)/0.35)] text-muted hover:text-text'
                        }`}
                        title={`${option.label} · ${option.helper}`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[18px] bg-[hsl(var(--color-bg)/0.58)] p-2">
                  <div className="grid grid-cols-2 gap-2">
                    {resolutionOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setResolution(option.value)}
                        className={`rounded-full px-3 py-2 text-center text-xs font-semibold transition ${
                          resolution === option.value
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'bg-[hsl(var(--color-surface)/0.35)] text-muted hover:text-text'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">{prefersUnifiedComposer && !prompt.trim() ? 'Prompt source' : 'Describe your visual'}</p>
                  <p className="mt-1 text-xs text-muted">
                    {prefersUnifiedComposer && !prompt.trim()
                      ? 'Prompt entry starts in the unified composer. When an idea is sent here, it will appear in this workspace for refinement.'
                      : `${activeImageMode.label} is best when you want ${activeImageMode.description.toLowerCase()}`}
                  </p>
                </div>
                <Button variant="secondary" type="button" onClick={() => void enhancePrompt()} disabled={enhancing || (prefersUnifiedComposer && !prompt.trim())} className="w-full gap-2 px-3 py-1.5 text-xs sm:w-auto">
                  {enhancing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {enhancing ? 'Improving...' : 'Improve prompt'}
                </Button>
              </div>
              {prefersUnifiedComposer && !prompt.trim() ? (
                <div className="rounded-[18px] border border-dashed border-[hsl(var(--color-border)/0.85)] bg-[hsl(var(--color-bg)/0.34)] px-4 py-5 text-sm text-muted">
                  Your image prompt will appear here after you start from the unified composer.
                </div>
              ) : (
                <Textarea
                  ref={promptTextareaRef}
                  rows={6}
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  maxLength={MAX_PROMPT_CHARS}
                  placeholder={activePromptPlaceholder}
                />
              )}
              <div className="flex flex-col gap-2 text-[11px] text-muted sm:flex-row sm:items-center sm:justify-between">
                <span>{prompt.length}/{MAX_PROMPT_CHARS}</span>
                <div className="flex flex-wrap gap-2">
                  {powerWords.slice(0, 4).map((word) => (
                    <button
                      key={word}
                      type="button"
                      onClick={() => applyPowerWord(word)}
                      className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-text"
                    >
                      {word}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">References</p>
                  <p className="mt-1 text-xs text-muted">Optional. Add up to 4 images, or use one source image for an edit.</p>
                </div>
                <label className="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.45)] px-3 py-2 text-xs font-semibold text-text hover:border-[hsl(var(--color-accent))] sm:w-auto">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingReference ? 'Uploading...' : 'Upload'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => void uploadReferenceFiles(event.target.files)}
                    disabled={uploadingReference || referenceUploads.length >= 4}
                  />
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setReferenceMode('edit')}
                  disabled={referenceUploads.length > 1}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    referenceMode === 'edit'
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.14)] text-text'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.24)] text-muted hover:text-text'
                  } ${referenceUploads.length > 1 ? 'cursor-not-allowed opacity-55' : ''}`}
                >
                  Use as source image
                </button>
                <button
                  type="button"
                  onClick={() => setReferenceMode('inspiration')}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                    referenceMode === 'inspiration'
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.14)] text-text'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.24)] text-muted hover:text-text'
                  }`}
                >
                  Use as inspiration
                </button>
              </div>
              <p className="text-xs text-muted">
                {referenceMode === 'edit'
                  ? 'Edit mode keeps the uploaded subject as the source image and uses OpenAI Image for reliable changes.'
                  : 'Inspiration mode uses uploaded references as visual guidance for a fresh generation.'}
              </p>
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.2)] px-3 py-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text">Variations</p>
                    <p className="mt-1 text-xs text-muted">Generate one image or a small set of variations in a single run.</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-xs font-semibold text-text">
                    <input
                      type="checkbox"
                      checked={wantsVariations}
                      onChange={(event) => setWantsVariations(event.target.checked)}
                      className="h-4 w-4 rounded border-[hsl(var(--color-border))]"
                    />
                    Create variations
                  </label>
                </div>
                {wantsVariations ? (
                  <div className="mt-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-xs text-muted">
                      <span>How many images</span>
                      <span className="font-semibold text-text">{imageCount}</span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={4}
                      step={1}
                      value={imageCount}
                      onChange={(event) => setImageCount(Number(event.target.value))}
                      className="w-full accent-[hsl(var(--color-accent))]"
                    />
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>2</span>
                      <span>3</span>
                      <span>4</span>
                    </div>
                  </div>
                ) : null}
              </div>
              {referenceUploads.length === 0 ? (
                <div className="rounded-[18px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.16)] px-4 py-4 text-xs text-muted">
                  Add up to 4 reference images. Use one as a source edit, or use multiple images for inspiration.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {referenceUploads.map((item) => (
                    <div key={item.id} className="group relative overflow-hidden rounded-[16px] bg-[hsl(var(--color-surface)/0.28)]">
                      <img src={toAbsoluteUrl(item.url)} alt={item.name} className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeReferenceUpload(item.id)}
                        className="absolute right-1.5 top-1.5 inline-flex h-6 w-6 items-center justify-center rounded-full bg-[hsl(var(--color-surface)/0.92)] text-text opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <div className="flex flex-col gap-3 rounded-[16px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.28)] p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-text">{activeImageMode.label}</p>
                    <Badge>{wallet?.currentCredits ?? 0} credits left</Badge>
                    {creditsRefreshing ? <span className="text-[11px] text-muted">Refreshing…</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {`${requestedImageCount} image${requestedImageCount > 1 ? 's' : ''} • ${aspectRatio} • ${resolutionOptions.find((item) => item.value === resolution)?.label ?? resolution} • ${estimate ? `estimated ${estimate.estimatedCredits} credits` : isEstimating ? 'Estimating credits...' : 'Credits unavailable'}`}
                  </p>
                  {selectedModelMeta ? <p className="mt-1 text-[11px] text-muted">{selectedModelMeta.label} {selectedModelMeta.provider ? `· ${selectedModelMeta.provider}` : ''}</p> : null}
                  {selectedModelMeta && selectedEstimateModel.estimateModelLabel !== selectedModelMeta.label ? (
                    <p className="mt-1 text-[11px] text-muted">Billed as {selectedEstimateModel.estimateModelLabel} for estimate consistency.</p>
                  ) : null}
                  {estimate?.breakdown?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {estimate.breakdown.map((item) => (
                        <span
                          key={`${item.component}-${item.label ?? 'estimate'}`}
                          className="inline-flex items-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.28)] px-2.5 py-1 text-[10px] font-medium text-muted"
                          title={item.label ?? item.component}
                        >
                          {toFriendlyImageEstimateLabel(item.component, item.label)}: {typeof item.value === 'number' && item.value > 0 ? '+' : ''}{item.value}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button
                    variant="secondary"
                    onClick={() => void retryLastGeneration(selectedGenerated ?? undefined)}
                    disabled={submitting || (!lastGenerationPayload && !selectedGenerated)}
                    className="h-11 w-full gap-2 rounded-[12px] px-4 text-xs sm:w-auto"
                  >
                    {retrying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    {retrying ? 'Retrying...' : 'Retry'}
                  </Button>
                  <Button
                    onClick={() => void handlePrimaryAction()}
                    disabled={submitting || Boolean(estimate && !estimate.sufficient)}
                    className="w-full rounded-[12px] border-0 bg-[linear-gradient(135deg,hsl(var(--color-accent)),rgb(236_72_153))] px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95 sm:min-w-[190px] sm:w-auto"
                  >
                    {primaryActionLoading ? (
                      <>
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        {`Create image · ${estimate ? `${estimate.estimatedCredits} credits` : '...'}`}
                      </>
                    )}
                  </Button>
                </div>
              </div>
              {estimate && !estimate.sufficient ? (
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[hsl(var(--color-danger))]">
                  <button type="button" onClick={() => openLowBalanceModal(estimate.estimatedCredits)}>
                    Insufficient credits
                  </button>
                  <a href="/billing">Top up</a>
                  <a href="/pricing">View plans</a>
                </div>
              ) : null}
              {estimateError ? (
                <p className="text-xs text-amber-600">Could not estimate credits right now. Final validation happens during generation.</p>
              ) : null}
              {!estimateError && isUsingFallback ? (
                <p className="text-xs text-muted">Using estimated credits based on current settings.</p>
              ) : null}
          </div>
          </div>

          <div className="min-w-0 space-y-4 border-t border-[hsl(var(--color-border)/0.55)] pt-4 xl:sticky xl:top-24 xl:self-start xl:border-l xl:border-[hsl(var(--color-border)/0.45)] xl:border-t-0 xl:pl-6 xl:pt-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Generate</p>
              <h2 className="mt-1 text-base font-semibold text-text">Review and download</h2>
            </div>
            <span className="text-xs text-muted">{activeTab === 'generated' ? 'Your image' : 'Inspiration'}</span>
          </div>
          <div className="overflow-hidden rounded-[16px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg))]">
            {livePreviewImage ? (
              <img
                src={getPreviewImageUrl(livePreviewImage) ?? ''}
                alt={getPreviewImageLabel(livePreviewImage)}
                className="max-h-[320px] w-full object-contain bg-[hsl(var(--color-bg))] sm:max-h-[420px]"
              />
            ) : (
              <div className="flex min-h-[220px] items-center justify-center px-4 text-center text-sm text-muted sm:min-h-[240px]">
                Describe your visual or use a template to get started. Your generated image will appear here.
              </div>
            )}
          </div>
          <dl className="grid gap-x-4 gap-y-2 border-y border-[hsl(var(--color-border)/0.45)] py-3 text-sm sm:grid-cols-2">
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted">Model</dt>
              <dd className="font-medium text-text">
                {activeTab === 'generated'
                  ? selectedGeneratedModel?.label ?? activeImageMode.label
                  : selectedInspirationModel?.label ?? activeImageMode.label}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted">Aspect</dt>
              <dd className="font-medium text-text">{aspectRatio}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 sm:block">
              <dt className="text-xs uppercase tracking-[0.14em] text-muted">Resolution</dt>
              <dd className="font-medium text-text">{resolutionOptions.find((item) => item.value === resolution)?.label ?? resolution}</dd>
            </div>
          </dl>
        </div>
      </div>

      <div className="space-y-4 border-t border-[hsl(var(--color-border)/0.55)] pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-extrabold tracking-tight text-text">Your creative feed</h2>
            <p className="mt-1 text-sm text-muted">Browse your latest images or explore inspiration without leaving the studio.</p>
          </div>
          <div className="inline-flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.45)] p-1 backdrop-blur-md">
            <button
              type="button"
              onClick={() => setActiveTab('generated')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'generated' ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]' : 'text-muted'}`}
            >
              Your images
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('inspiration')}
              className={`rounded-full px-4 py-2 text-sm font-semibold ${activeTab === 'inspiration' ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]' : 'text-muted'}`}
            >
              Inspiration
            </button>
          </div>
        </div>

        <Card className="space-y-4 rounded-[16px] border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-elevated)/0.18)] backdrop-blur-md">
          <div className="grid gap-3 xl:grid-cols-[1.15fr_0.85fr]">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Search by prompt or tags
              </label>
              <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.68)] px-3 py-2.5">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search by mood, object, prompt, or style..."
                  className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                />
              </div>
              {searchQuery.trim() ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {tagSuggestions.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => !selectedTags.includes(item.tag) && setSelectedTags((current) => [...current, item.tag])}
                      className="rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-muted hover:border-[hsl(var(--color-accent))]"
                    >
                      {item.tag} · {item.count}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.68)] p-3.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-text">
                <Filter className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Active filters
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedTags.map((tag) => (
                  <button key={`active-tag-${tag}`} type="button" onClick={() => setSelectedTags((current) => current.filter((item) => item !== tag))} className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent)/0.12)] px-3 py-1 text-xs font-semibold text-text">
                    {tag}
                    <X className="h-3 w-3" />
                  </button>
                ))}
                {selectedModelFilters.map((item) => (
                  <button key={`active-model-${item}`} type="button" onClick={() => setSelectedModelFilters((current) => current.filter((value) => value !== item))} className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text">
                    {models.find((model) => model.key === item)?.label ?? item}
                    <X className="h-3 w-3" />
                  </button>
                ))}
                {selectedResolutionFilters.map((item) => (
                  <button key={`active-resolution-${item}`} type="button" onClick={() => setSelectedResolutionFilters((current) => current.filter((value) => value !== item))} className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text">
                    {item}px
                    <X className="h-3 w-3" />
                  </button>
                ))}
                {selectedTags.length === 0 && selectedModelFilters.length === 0 && selectedResolutionFilters.length === 0 ? (
                  <span className="text-xs text-muted">No active filters</span>
                ) : null}
              </div>
            </div>
          </div>

          {studioFeedLoading ? (
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-9">
              {Array.from({ length: 16 }).map((_, idx) => (
                <div
                  key={`feed-skeleton-${idx}`}
                  className="overflow-hidden rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)]"
                >
                  <div className="aspect-[5/4] animate-pulse bg-[hsl(var(--color-elevated)/0.64)]" />
                  <div className="space-y-1.5 p-2">
                    <div className="h-2.5 w-20 animate-pulse rounded bg-[hsl(var(--color-elevated)/0.62)]" />
                    <div className="h-2 w-16 animate-pulse rounded bg-[hsl(var(--color-elevated)/0.42)]" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 2xl:grid-cols-9">
            {(activeTab === 'generated' ? generatedImages : filteredInspiration).map((item) => {
              const imageUrl = getPreviewImageUrl(item);
              const itemModel = models.find((model) => model.key === item.model_key);
              const isGenerated = activeTab === 'generated';
              return (
                <div
                  key={`${activeTab}-${item.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (isGenerated) {
                      setSelectedGenerated(item as GeneratedImage);
                    } else {
                      setSelectedInspiration(item as InspirationImage);
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    if (isGenerated) {
                      setSelectedGenerated(item as GeneratedImage);
                    } else {
                      setSelectedInspiration(item as InspirationImage);
                    }
                  }}
                  className={`overflow-hidden rounded-[14px] border text-left transition hover:-translate-y-0.5 hover:shadow-soft focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-accent)/0.35)] ${
                    ((isGenerated ? selectedGenerated?.id : selectedInspiration?.id) === item.id)
                      ? 'border-[hsl(var(--color-accent))] shadow-soft'
                      : 'border-[hsl(var(--color-border))]'
                  } bg-[hsl(var(--color-bg)/0.72)]`}
                >
                  <div className="overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={getPreviewImageLabel(item)} className="aspect-[5/4] w-full object-cover transition duration-300 hover:scale-[1.02]" />
                    ) : (
                      <div className="flex aspect-[5/4] items-center justify-center text-sm text-muted">No preview</div>
                    )}
                  </div>
                  <div className="space-y-1 p-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-[10px] font-semibold text-text">
                          {'title' in item ? item.title : item.prompt.split(',')[0]}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[8px] leading-3.5 text-muted">{getPreviewImageLabel(item)}</p>
                      </div>
                      <Badge>{itemModel?.label ?? item.model_key}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <Badge>{item.aspect_ratio}</Badge>
                      <Badge>{resolutionOptions.find((option) => option.value === item.resolution)?.label ?? item.resolution}</Badge>
                      {isGenerated ? <Badge>{(item as GeneratedImage).status}</Badge> : null}
                    </div>
                    {isGenerated ? (
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="secondary"
                          type="button"
                          className="gap-1.5 px-2 py-1 text-[10px]"
                          onClick={(event) => {
                            event.stopPropagation();
                            void downloadImage((item as GeneratedImage).image_url, (item as GeneratedImage).prompt);
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                        <div className="flex items-center gap-1.5 text-[10px] text-muted">
                          <Tag className="h-3.5 w-3.5" />
                          {[...(item as GeneratedImage).auto_tags, ...(item as GeneratedImage).user_tags].slice(0, 2).join(', ') || 'No tags'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          )}

          {!studioFeedLoading && (activeTab === 'generated' ? generatedImages : filteredInspiration).length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-5 py-12 text-center">
              <ImageIcon className="mx-auto h-8 w-8 text-[hsl(var(--color-accent))]" />
              <p className="mt-4 text-sm font-semibold text-text">
                {activeTab === 'generated'
                  ? 'No generated images yet'
                  : inspiration.length === 0
                    ? 'No inspiration items available yet'
                    : 'No inspiration items match current filters'}
              </p>
              <p className="mt-2 text-xs text-muted">
                {activeTab === 'generated'
                  ? 'Start with a prompt, template, or reference image and your first result will appear here.'
                  : 'Try a different search or clear active filters to see more inspiration.'}
              </p>
              {activeTab === 'inspiration' && (hasFacetFilters || hasSearchFilter) ? (
                <div className="mt-4">
                  <Button variant="secondary" type="button" onClick={clearStudioFilters}>
                    Clear filters
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
          {activeTab === 'generated' && generatedImages.length > 0 && hasMoreGenerated ? (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                type="button"
                onClick={() => void loadMoreGenerated()}
                disabled={loadingMoreGenerated}
                className="gap-2"
              >
                {loadingMoreGenerated ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null}
                {loadingMoreGenerated ? 'Loading…' : 'Load more'}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
      <Modal open={templatePickerOpen} onClose={() => setTemplatePickerOpen(false)}>
        <div className="space-y-3.5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Quick starts</p>
            <h3 className="mt-1 text-lg font-semibold text-text">Choose a visual starting point</h3>
            <p className="mt-1 text-xs text-muted">Pick a creator-ready starting point, answer a few fields, and apply it into the studio.</p>
          </div>
          <div className="grid gap-3.5 xl:grid-cols-[0.62fr_1.38fr]">
            <div className="space-y-2.5">
              <div className="overflow-hidden rounded-[12px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.3)]">
                {activeTemplate?.thumbnail_url ? (
                  <img src={activeTemplate.thumbnail_url} alt={activeTemplate.title} className="aspect-[16/10] max-h-[160px] w-full object-cover sm:max-h-[190px] xl:max-h-[220px]" />
                ) : (
                  <div className="flex aspect-[16/10] max-h-[160px] items-end bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-elevated)))] p-2.5 sm:max-h-[190px] xl:max-h-[220px]">
                    <div className="space-y-1.5">
                      <Badge>{activeTemplate?.category ?? 'Template'}</Badge>
                      <p className="text-sm font-semibold text-text">{activeTemplate?.title ?? 'Select a template'}</p>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>Image</Badge>
                {activeTemplate ? <Badge>{activeTemplate.category}</Badge> : null}
                {activeTemplate ? <Badge>{resolutionOptions.find((item) => item.value === activeTemplate.resolution)?.label ?? activeTemplate.resolution}</Badge> : null}
              </div>
              <div className="grid max-h-[280px] gap-2 overflow-y-auto pr-1 sm:max-h-[360px]">
                {imageTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    onClick={() => setActiveTemplate(template)}
                    className={`rounded-[11px] border px-2.5 py-2 text-left transition ${
                      activeTemplate?.id === template.id
                        ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.1)] text-text'
                        : 'border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-surface)/0.24)] text-muted hover:text-text'
                    }`}
                  >
                    <p className="text-[11px] font-semibold text-text">{template.title}</p>
                    <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted">{template.description}</p>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.28)] p-3.5 sm:p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Template inputs</p>
                    <p className="mt-1 text-xs text-muted">Answer a few simple fields. We’ll turn them into a stronger starting prompt for you.</p>
                  </div>
                {activeTemplate ? <Badge>{models.find((item) => item.key === activeTemplate.model_key)?.label ?? activeTemplate.model_key}</Badge> : null}
              </div>
              {activeTemplate ? (
                <div className="mt-3.5 space-y-2.5">
                  {(activeTemplate.inputs || []).length > 0 ? (
                    activeTemplate.inputs?.map((field) => {
                      const options = normalizeTemplateOptions(field);
                      const value = templateInputs[field.key] || '';
                      return (
                        <div key={field.key} className="space-y-1.5">
                          <label className="text-sm font-medium text-text">{field.label}</label>
                          {field.type === 'select' ? (
                            <Dropdown value={value} onChange={(event) => setTemplateInputs((current) => ({ ...current, [field.key]: event.target.value }))}>
                              {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </Dropdown>
                          ) : field.type === 'textarea' ? (
                            <Textarea value={value} onChange={(event) => setTemplateInputs((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder || ''} />
                          ) : (
                            <Textarea rows={field.type === 'number' ? 2 : 3} value={value} onChange={(event) => setTemplateInputs((current) => ({ ...current, [field.key]: event.target.value }))} placeholder={field.placeholder || ''} />
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <div className="rounded-[12px] bg-[hsl(var(--color-bg)/0.55)] px-3.5 py-3 text-xs text-muted">
                      This quick start already includes a ready-made prompt. Apply it directly if you want to move fast.
                    </div>
                  )}
                  <div className="rounded-[12px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-bg)/0.48)] p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Will apply</p>
                    <p className="mt-1 text-[11px] text-text">
                      {models.find((item) => item.key === activeTemplate.model_key)?.label ?? activeTemplate.model_key}
                      {' · '}
                      {activeTemplate.aspect_ratio}
                      {' · '}
                      {resolutionOptions.find((item) => item.value === activeTemplate.resolution)?.label ?? activeTemplate.resolution}
                    </p>
                  </div>
                  <div className="rounded-[12px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-bg)/0.48)] p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">Prompt preview</p>
                    <p className="mt-1 whitespace-pre-wrap text-[11px] leading-5 text-text">
                      {templatePromptPreviewLoading
                        ? 'Building your prompt preview...'
                        : (templatePromptPreview || activeTemplatePromptPreview || 'Your prompt preview will appear after the key fields are filled.')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    <Button onClick={() => void applyImageTemplate(activeTemplate, templateInputs)}>
                      Apply template
                    </Button>
                    <Button variant="secondary" onClick={() => setTemplatePickerOpen(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3.5 rounded-[14px] bg-[hsl(var(--color-bg)/0.55)] px-3.5 py-5 text-xs text-muted">
                  Select a template to load its visual direction and recommended starting settings.
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
      {selectedInspiration ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[hsl(var(--color-text)/0.62)] p-3 backdrop-blur-sm sm:p-4" onClick={() => setSelectedInspiration(null)}>
          <div className="mx-auto flex h-full max-w-7xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <div className="grid max-h-[94vh] w-full overflow-hidden rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-hard xl:grid-cols-[minmax(0,1.48fr)_272px]">
              <div className="flex min-h-[320px] items-center justify-center bg-[hsl(var(--color-bg))] p-2 sm:p-3">
                <img src={selectedInspiration.image_url} alt={selectedInspiration.title} className="max-h-[84vh] w-full object-contain" />
              </div>
              <div className="flex max-h-[92vh] flex-col overflow-y-auto p-3.5 sm:p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-extrabold tracking-tight text-text">{selectedInspiration.title}</h3>
                    <p className="mt-1 text-xs text-muted">Created {formatCreatedAt(selectedInspiration.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedInspiration(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4.5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text">Prompt</p>
                    <Button variant="secondary" type="button" onClick={() => void copyPrompt(selectedInspiration.prompt)} className="gap-2 px-3 py-1.5 text-xs">
                      <Copy className="h-3.5 w-3.5" />
                      {copiedPrompt ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                    <p className="text-[12px] leading-5 text-muted">{selectedInspiration.prompt}</p>
                  </div>
                </div>
                <div className="mt-4.5">
                  <p className="mb-3 text-sm font-semibold text-text">Information</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Model</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">{selectedInspirationModel?.label ?? selectedInspiration.model_key}</p>
                    </div>
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">References</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">
                        {selectedInspiration.reference_urls.length > 0 ? `${selectedInspiration.reference_urls.length}` : '-'}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Aspect Ratio</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">{selectedInspiration.aspect_ratio}</p>
                    </div>
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Resolution</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">{resolutionOptions.find((option) => option.value === selectedInspiration.resolution)?.label ?? selectedInspiration.resolution}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4.5">
                  <p className="mb-2 text-sm font-semibold text-text">Auto tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedInspiration.tags.map((tag) => (
                      <Badge key={`insp-tag-${tag}`}>{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="mt-4.5 flex flex-wrap items-center gap-2.5">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void toggleLikeInspiration(selectedInspiration)}
                    className="h-8 gap-2 px-2.5 text-[11px]"
                    disabled={likingId === selectedInspiration.id}
                  >
                    <Heart className={`h-4 w-4 ${selectedInspiration.liked_by_user ? 'fill-current' : ''}`} />
                    {selectedInspiration.like_count}
                  </Button>
                  <a
                    href={toAbsoluteUrl(selectedInspiration.image_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-[14px] border border-[hsl(var(--color-border)/0.7)] px-2.5 py-2 text-[11px] font-semibold text-text"
                  >
                    <ExternalLink className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                    Open full image
                  </a>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent)/0.12)] px-2.5 py-1 text-[11px] font-semibold text-text">
                    <Lightbulb className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                    Inspiration reference
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {selectedGenerated ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[hsl(var(--color-text)/0.62)] p-3 backdrop-blur-sm sm:p-4" onClick={() => setSelectedGenerated(null)}>
          <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4" onClick={(event) => event.stopPropagation()}>
            <div className="grid w-full max-w-7xl overflow-hidden rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-hard xl:max-h-[94vh] xl:grid-cols-[minmax(0,1.48fr)_272px]">
              <div className="flex min-h-[260px] items-center justify-center bg-[hsl(var(--color-bg))] p-2 sm:min-h-[320px] sm:p-3">
                <img src={toAbsoluteUrl(selectedGenerated.image_url)} alt={selectedGenerated.prompt} className="max-h-[50vh] w-full object-contain xl:max-h-[84vh]" />
              </div>
              <div className="flex flex-col overflow-visible p-3.5 sm:p-4 xl:max-h-[92vh] xl:overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-extrabold tracking-tight text-text">{selectedGeneratedModel?.label ?? selectedGenerated.model_key}</h3>
                    <p className="mt-1 text-xs text-muted">Created {formatCreatedAt(selectedGenerated.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedGenerated(null)} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-4.5">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text">Prompt</p>
                    <Button variant="secondary" type="button" onClick={() => void copyPrompt(selectedGenerated.prompt)} className="gap-2 px-3 py-1.5 text-xs">
                      <Copy className="h-3.5 w-3.5" />
                      {copiedPrompt ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                    <p className="text-[12px] leading-5 text-muted">{selectedGenerated.prompt}</p>
                  </div>
                </div>
                <div className="mt-4.5 grid gap-2.5 sm:grid-cols-2">
                  <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                    <p className="mb-2 text-xs font-semibold text-text">Auto tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedGenerated.auto_tags.length > 0 ? selectedGenerated.auto_tags.map((tag) => <Badge key={`auto-${tag}`}>{tag}</Badge>) : <span className="text-xs text-muted">No auto tags yet</span>}
                    </div>
                  </div>
                  <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                    <p className="mb-2 text-xs font-semibold text-text">User tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedGenerated.user_tags.length > 0 ? selectedGenerated.user_tags.map((tag) => <Badge key={`user-${tag}`}>{tag}</Badge>) : <span className="text-xs text-muted">No user tags yet</span>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={manualTagInput}
                        onChange={(event) => setManualTagInput(event.target.value)}
                        placeholder="comma separated tags"
                        className="min-w-0 flex-1 rounded-[14px] border border-[hsl(var(--color-border)/0.7)] bg-transparent px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
                      />
                      <Button variant="secondary" type="button" onClick={() => void saveManualTags()}>
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-4.5">
                  <p className="mb-3 text-sm font-semibold text-text">Magic Tools</p>
                  <div className="grid gap-3">
                    <Button variant="secondary" type="button" onClick={() => void runImageAction(selectedGenerated.id, 'remove_background')} className="justify-start gap-2" disabled={actionLoading === `${selectedGenerated.id}:remove_background`}>
                      <Eraser className="h-4 w-4" />
                      {actionLoading === `${selectedGenerated.id}:remove_background` ? 'Removing background...' : 'Background Remover'}
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => void runImageAction(selectedGenerated.id, 'upscale')} className="justify-start gap-2" disabled={actionLoading === `${selectedGenerated.id}:upscale`}>
                      <Zap className="h-4 w-4" />
                      {actionLoading === `${selectedGenerated.id}:upscale` ? 'Upscaling...' : 'Smart Upscaler'}
                    </Button>
                    <Button variant="secondary" type="button" onClick={() => void retryLastGeneration(selectedGenerated)} className="justify-start gap-2" disabled={submitting}>
                      {retrying ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      {retrying ? 'Retrying...' : 'Retry this generation'}
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted">Need multiple options? Use the Variations control before generating to request 2-4 images and see the credit estimate upfront.</p>
                </div>
                <div className="mt-4.5">
                  <p className="mb-3 text-sm font-semibold text-text">Information</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Model</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">{selectedGeneratedModel?.label ?? selectedGenerated.model_key}</p>
                    </div>
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">References</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">
                        {selectedGenerated.reference_urls.length > 0 ? `${selectedGenerated.reference_urls.length}` : '-'}
                      </p>
                    </div>
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Aspect Ratio</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">{selectedGenerated.aspect_ratio}</p>
                    </div>
                    <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-bg)/0.78)] p-2.5">
                      <p className="text-[10px] uppercase tracking-[0.16em] text-muted">Resolution</p>
                      <p className="mt-1 text-[11px] font-semibold text-text">{resolutionOptions.find((option) => option.value === selectedGenerated.resolution)?.label ?? selectedGenerated.resolution}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-4.5 flex flex-wrap items-center gap-2.5">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void togglePublish(selectedGenerated)}
                    className="h-9 gap-2 px-3 text-xs"
                    disabled={publishingId === selectedGenerated.id}
                  >
                    {publishingId === selectedGenerated.id
                      ? 'Updating...'
                      : selectedGenerated.is_public_inspiration
                        ? 'Unpublish'
                        : 'Publish to inspiration'}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => void downloadImage(selectedGenerated.image_url, selectedGenerated.prompt)} className="h-9 gap-2 px-3 text-xs">
                    <Download className="h-4 w-4" />
                    Download image
                  </Button>
                  {selectedGenerated.project_id ? (
                    <a href={`/projects/${selectedGenerated.project_id}`} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-2 text-xs font-semibold text-text">
                      <GalleryVerticalEnd className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                      Open in project
                    </a>
                  ) : null}
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => setProjectAssignmentTarget(selectedGenerated)}
                    className="gap-2"
                    disabled={assigningProjectId === selectedGenerated.id}
                  >
                    <GalleryVerticalEnd className="h-4 w-4" />
                    {selectedGenerated.project_id ? 'Move to project' : 'Add to project'}
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void deleteGeneratedImage(selectedGenerated)}
                    className="gap-2"
                    disabled={deletingImageId === selectedGenerated.id}
                  >
                    <Trash2 className="h-4 w-4" />
                    {deletingImageId === selectedGenerated.id ? 'Deleting...' : 'Delete image'}
                  </Button>
                  <a href={toAbsoluteUrl(selectedGenerated.image_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text">
                    <ExternalLink className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                    Open full image
                  </a>
                  <Badge>{selectedGenerated.status}</Badge>
                  {selectedGenerated.is_public_inspiration ? <Badge>{selectedGenerated.moderation_status}</Badge> : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      </div>
      </div>

      <ProjectAssignmentDialog
        open={Boolean(projectAssignmentTarget)}
        onClose={() => setProjectAssignmentTarget(null)}
        projects={projects}
        currentProjectId={projectAssignmentTarget?.project_id}
        assetLabel={projectAssignmentTarget?.prompt || 'selected image'}
        onConfirm={assignGeneratedImageToProject}
        submitting={Boolean(projectAssignmentTarget && assigningProjectId === projectAssignmentTarget.id)}
      />

      <Modal open={modelPickerOpen} onClose={() => setModelPickerOpen(false)}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Model selection</p>
            <h3 className="mt-1 text-xl font-semibold text-text">Choose your image workflow</h3>
            <p className="mt-1 text-sm text-muted">Pick the result you want. The underlying model stays secondary.</p>
          </div>
          <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
            {availableImageWorkflows.map((workflow) => {
              const active = workflow.key === imageMode;
              return (
                <button
                  key={workflow.key}
                  type="button"
                  onClick={() => {
                    if (!workflow.resolvedModelKey) return;
                    setSelectedModel(workflow.resolvedModelKey);
                    setImageMode(workflow.key);
                    setModelPickerOpen(false);
                  }}
                  className={`w-full rounded-[18px] border px-4 py-3 text-left transition ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.16),transparent)] shadow-soft'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] hover:bg-[hsl(var(--color-elevated))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-sm font-semibold ${
                        PROVIDER_LOGO_STYLES[workflow.resolvedModel?.provider ?? ''] ?? 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                      }`}
                    >
                      {workflow.resolvedModel?.logo_label ?? <Sparkles className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">{workflow.label}</p>
                        <Badge>{workflow.badge}</Badge>
                        {active ? <Badge>Selected</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">{workflow.description}</p>
                      <p className="mt-2 text-xs text-[hsl(var(--color-accent))]">{workflow.helper}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        {workflow.resolvedModel?.provider ? <span>{workflow.resolvedModel.provider}</span> : null}
                        {workflow.resolvedModel?.label ? <span>{workflow.resolvedModel.label}</span> : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
