'use client';

import { useEffect, useMemo, useState } from 'react';
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
  Sparkles,
  Stars,
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
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetTagFacet, GeneratedImage, ImageModel, ImageQuickTemplate, InspirationImage, Template, TemplateInputField } from '@/types/api';

type Props = {
  userId: string;
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

const IMAGE_STUDIO_CACHE_TTL_MS = 2 * 60 * 1000;
const IMAGE_STUDIO_INITIAL_GENERATED_LIMIT = 3;
const IMAGE_STUDIO_LOAD_MORE_STEP = 8;

const fallbackModels: ImageModel[] = [
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
  const details: string[] = [prompt];
  if (template.visual_prompt) details.push(`Visual direction: ${template.visual_prompt}.`);
  return details.join(' ').trim();
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
    model_key: defaults.model_key || 'gemini_flash_image',
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

export function ImageStudioClient({ userId }: Props) {
  const cacheKey = `rangmanch:image-studio:v1:${userId}`;
  const [composerMode, setComposerMode] = useState<'create' | 'variation'>('create');
  const [models, setModels] = useState<ImageModel[]>(fallbackModels);
  const [imageTemplates, setImageTemplates] = useState<ImageTemplatePreset[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [activeTemplate, setActiveTemplate] = useState<ImageTemplatePreset | null>(null);
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({});
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [inspiration, setInspiration] = useState<InspirationImage[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitProgress, setSubmitProgress] = useState(0);
  const [enhancing, setEnhancing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimateErrorShown, setEstimateErrorShown] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generated' | 'inspiration'>('generated');
  const [selectedInspiration, setSelectedInspiration] = useState<InspirationImage | null>(null);
  const [selectedGenerated, setSelectedGenerated] = useState<GeneratedImage | null>(null);
  const [publishingId, setPublishingId] = useState<string | null>(null);
  const [deletingImageId, setDeletingImageId] = useState<string | null>(null);
  const [likingId, setLikingId] = useState<string | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [selectedModel, setSelectedModel] = useState('gemini_flash_image');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [referenceUploads, setReferenceUploads] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedModelFilters, setSelectedModelFilters] = useState<string[]>([]);
  const [selectedResolutionFilters, setSelectedResolutionFilters] = useState<string[]>([]);
  const [manualTagInput, setManualTagInput] = useState('');
  const [allGeneratedImages, setAllGeneratedImages] = useState<GeneratedImage[]>([]);
  const [generatedFetchLimit, setGeneratedFetchLimit] = useState(IMAGE_STUDIO_INITIAL_GENERATED_LIMIT);
  const [loadingMoreGenerated, setLoadingMoreGenerated] = useState(false);
  const [hasMoreGenerated, setHasMoreGenerated] = useState(false);
  const { wallet, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();

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
      };
      if (!cached.ts || Date.now() - cached.ts > IMAGE_STUDIO_CACHE_TTL_MS) return;
      const nextModels = cached.models?.length ? cached.models : fallbackModels;
      setModels(nextModels);
      setSelectedModel((current) => (nextModels.some((item) => item.key === current) ? current : nextModels[0]?.key ?? 'gemini_flash_image'));
      setInspiration(cached.inspiration ?? []);
      setAllGeneratedImages(cached.imageData ?? []);
      applyGeneratedFilters(
        cached.imageData ?? [],
        searchQuery,
        selectedTags,
        selectedModelFilters,
        selectedResolutionFilters,
      );
      setTagFacets(cached.tagData ?? []);
      setLoading(false);
    } catch {
      // ignore malformed cache
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.listImageModels(userId).catch(() => fallbackModels),
      api.listUnifiedTemplates(userId, { type: 'image', active: true }).catch(() => []),
      api.listImageInspiration(userId).catch(() => []),
      api.listGeneratedImages(userId, IMAGE_STUDIO_INITIAL_GENERATED_LIMIT).catch(() => []),
      api.listAssetTags(userId, { content_type: 'image' }).catch(() => []),
    ]).then(([modelData, templateData, inspirationData, imageData, tagData]) => {
      if (cancelled) return;
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
      setSelectedModel((current) => (nextModels.some((item) => item.key === current) ? current : nextModels[0]?.key ?? 'gemini_flash_image'));
      setInspiration(inspirationData);
      setAllGeneratedImages(imageData);
      setHasMoreGenerated(imageData.length >= IMAGE_STUDIO_INITIAL_GENERATED_LIMIT);
      applyGeneratedFilters(imageData, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters);
      setTagFacets(tagData);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              ts: Date.now(),
              models: nextModels,
              inspiration: inspirationData,
              imageData,
              tagData,
            }),
          );
        } catch {
          // ignore cache write issues
        }
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, userId]);

  useEffect(() => {
    setTemplateInputs(buildTemplateInputDefaults(activeTemplate));
  }, [activeTemplate]);

  useEffect(() => {
    applyGeneratedFilters(allGeneratedImages, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters);
  }, [allGeneratedImages, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters]);

  const referenceUrls = useMemo(() => referenceUploads.map((item) => item.url), [referenceUploads]);

  const { estimates, isEstimating, estimateError, isUsingFallback } = useCreditEstimator(
    [
      {
        key: 'imageGenerate',
        action: 'image_generate',
        payload: {
          model_key: selectedModel,
          resolution,
          reference_urls: referenceUrls,
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
    show('Could not estimate credits right now.');
  }, [estimateError, estimateErrorShown, show]);

  useEffect(() => {
    setManualTagInput(selectedGenerated?.user_tags.join(', ') ?? '');
  }, [selectedGenerated]);

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

  const selectedModelMeta = models.find((item) => item.key === selectedModel) ?? models[0];
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

  const submit = async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError('Prompt is required.');
      return;
    }
    if (trimmedPrompt.length > MAX_PROMPT_CHARS) {
      setError(`Prompt is too long. Keep it under ${MAX_PROMPT_CHARS} characters.`);
      return;
    }
    if (!window.confirm('Generate this image now? Credits will be charged only if generation succeeds.')) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setSubmitProgress(14);
      const item = await api.generateImage(
        {
          model_key: selectedModel,
          prompt: trimmedPrompt,
          aspect_ratio: aspectRatio,
          resolution,
          reference_urls: referenceUrls,
        },
        userId,
      );
      if (typeof item.remaining_credits === 'number') {
        if (wallet) {
          applyWallet({ ...wallet, currentCredits: item.remaining_credits });
        } else {
          void refreshCredits();
        }
      }
      setSubmitProgress(100);
      show(`Created! Credits Used: ${item.applied_credits} · Remaining Balance: ${item.remaining_credits ?? wallet?.currentCredits ?? 0}`);
      setSelectedGenerated(item);
      setActiveTab('generated');
      const items = await refreshGeneratedFeed(generatedFetchLimit);
      await refreshTagFacets(items);
    } catch (error) {
      setError(toErrorMessage(error, 'Failed to generate image. Please try again.'));
    } finally {
      setSubmitting(false);
    }
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
      setError(toErrorMessage(error, 'Could not enhance the prompt right now.'));
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

  const applyImageTemplate = (template: ImageTemplatePreset, values: Record<string, string>) => {
    const nextPrompt = renderTemplatePrompt(template, values);
    setPrompt(nextPrompt);
    setAspectRatio(template.aspect_ratio || '4:5');
    setResolution(template.resolution || '1536');
    setSelectedModel(template.model_key || 'gemini_flash_image');
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
      setReferenceUploads((current) => [...current, ...nextUploads].slice(0, 4));
    } catch (error) {
      setError(toErrorMessage(error, 'Could not upload reference image right now.'));
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
      const link = document.createElement('a');
      link.href = `/api/download?url=${encodeURIComponent(toAbsoluteUrl(imageUrl) ?? imageUrl)}&filename=${encodeURIComponent(safeName)}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      setError(toErrorMessage(error, 'Could not download image right now.'));
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
      setError(toErrorMessage(error, 'Could not complete that action right now.'));
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
      setError(toErrorMessage(error, 'Could not update tags right now.'));
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
      setError(toErrorMessage(error, 'Could not update publish status.'));
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
      setError(toErrorMessage(error, 'Could not update like status.'));
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
      setError(toErrorMessage(error, 'Could not load more images right now.'));
    } finally {
      setLoadingMoreGenerated(false);
    }
  };

  if (loading) {
    return (
      <Card className="flex items-center gap-3">
        <Spinner />
        <p className="text-sm text-muted">Loading image studio...</p>
      </Card>
    );
  }

  const livePreviewImage =
    activeTab === 'generated'
      ? selectedGenerated ?? generatedImages[0] ?? null
      : selectedInspiration ?? filteredInspiration[0] ?? null;
  const variationSource = selectedGenerated ?? allGeneratedImages[0] ?? generatedImages[0] ?? null;
  const variationActionKey = variationSource ? `${variationSource.id}:variation` : null;

  const handlePrimaryAction = async () => {
    if (composerMode === 'variation') {
      if (!variationSource) {
        const message = 'Generate at least one image first, then use Image Variations.';
        setError(message);
        show(message);
        return;
      }
      await runImageAction(variationSource.id, 'variation');
      return;
    }
    await submit();
  };

  return (
    <>
    <LoadingOverlay
      open={submitting}
      title="Generating your image"
      description=""
      progress={submitProgress}
    />
    <div className="space-y-6 sm:space-y-7">
 {/*     <section className="relative overflow-hidden rounded-[32px] border border-[hsl(var(--color-border))] bg-[radial-gradient(circle_at_top_left,hsl(var(--color-accent)/0.16),transparent_24%),linear-gradient(145deg,hsl(var(--color-surface)),hsl(var(--color-elevated))_44%,hsl(var(--color-bg)))] px-5 py-5 shadow-soft sm:px-6">
        <div className="pointer-events-none absolute -left-8 top-4 h-32 w-32 rounded-full bg-[hsl(var(--color-accent)/0.12)] blur-3xl" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              Create Image
            </div>
            <h1 className="mt-2.5 font-heading text-[1.9rem] font-extrabold tracking-tight text-text sm:text-[2.25rem]">
              Prompt, reference, and generate in one compact studio.
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted">
              Keep the composer tight, tune the output quickly, and review recent generations below the canvas.
            </p>
          </div>
          <div className="inline-flex items-center gap-3 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3 backdrop-blur-md">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
              <Wallet className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Credits</p>
              <p className="text-sm font-semibold text-text">{wallet?.currentCredits ?? 0} available</p>
            </div>
          </div>
        </div>
      </section>
      */}

      <div className="grid gap-6 xl:grid-cols-[420px_minmax(0,1fr)] xl:items-start">
        <div className="xl:sticky xl:top-24">
          <div className="space-y-5 rounded-[32px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] p-4 shadow-soft backdrop-blur-md sm:p-5">
            <div className="grid grid-cols-2 gap-2 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-2">
              <button
                type="button"
                onClick={() => setComposerMode('create')}
                className={`rounded-[20px] px-4 py-3 text-sm font-semibold transition ${
                  composerMode === 'create'
                    ? 'bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.24),hsl(var(--color-accent)/0.04))] text-text'
                    : 'text-muted hover:bg-[hsl(var(--color-elevated))] hover:text-text'
                }`}
              >
                Create Image
              </button>
              <button
                type="button"
                onClick={() => setComposerMode('variation')}
                className={`rounded-[20px] px-4 py-3 text-sm font-semibold transition ${
                  composerMode === 'variation'
                    ? 'bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.24),hsl(var(--color-accent)/0.04))] text-text'
                    : 'text-muted hover:bg-[hsl(var(--color-elevated))] hover:text-text'
                }`}
              >
                Image Variations
              </button>
            </div>

            {composerMode === 'variation' ? (
              <div className="space-y-3 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Variation source</p>
                    <p className="mt-1 text-xs text-muted">
                      Variations use your selected image or the latest generated image as the source.
                    </p>
                  </div>
                  {variationSource ? <Badge>Ready</Badge> : <Badge>Needs source</Badge>}
                </div>
                {variationSource ? (
                  <div className="flex items-center gap-3 rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-3">
                    <img
                      src={toAbsoluteUrl(variationSource.image_url)}
                      alt={variationSource.prompt}
                      className="h-20 w-20 shrink-0 rounded-[18px] object-cover"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-semibold text-text">{variationSource.prompt}</p>
                      <p className="mt-1 text-xs text-muted">
                        {models.find((item) => item.key === variationSource.model_key)?.label ?? variationSource.model_key}
                        {' · '}
                        {variationSource.aspect_ratio}
                        {' · '}
                        {resolutionOptions.find((item) => item.value === variationSource.resolution)?.label ?? variationSource.resolution}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-[20px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.22)] px-4 py-5 text-sm text-muted">
                    Generate an image first, or select one from your studio feed to create variations from it.
                  </div>
                )}
              </div>
            ) : null}

            <div className="space-y-3 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Quick Starts</p>
                  <p className="mt-1 text-xs text-muted">Start from a guided visual workflow, then refine the prompt manually if needed.</p>
                </div>
                <Button variant="secondary" type="button" onClick={() => setTemplatePickerOpen(true)} className="gap-2 px-3 py-2 text-xs">
                  <GalleryVerticalEnd className="h-3.5 w-3.5" />
                  Browse quick starts
                </Button>
              </div>
              <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
                {imageTemplates.slice(0, 6).map((template) => {
                  const selected = activeTemplate?.id === template.id;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => {
                        setActiveTemplate(template);
                        setTemplatePickerOpen(true);
                      }}
                      className={`group min-w-[220px] overflow-hidden rounded-[22px] border text-left transition ${
                        selected
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)]'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.36)] hover:border-[hsl(var(--color-accent)/0.35)]'
                      }`}
                    >
                      <div className="relative aspect-[4/3] overflow-hidden bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-elevated)))]">
                        {template.thumbnail_url ? (
                          <img src={template.thumbnail_url} alt={template.title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
                        ) : (
                          <div className="flex h-full items-end p-4">
                            <span className="inline-flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-text">
                              {template.category}
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.94)] via-transparent to-transparent" />
                        <div className="absolute inset-x-3 bottom-3">
                          <p className="line-clamp-1 text-sm font-semibold text-white">{template.title}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-white/72">{template.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
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

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Model</p>
                  <p className="mt-1 text-xs text-muted">Select one engine, then keep moving. Change only when you need a different look.</p>
                </div>
                {selectedModelMeta?.badge ? <Badge>{selectedModelMeta.badge}</Badge> : null}
              </div>
              <button
                type="button"
                onClick={() => setModelPickerOpen(true)}
                className="w-full rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4 text-left transition hover:bg-[hsl(var(--color-elevated))]"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-sm font-semibold ${
                      PROVIDER_LOGO_STYLES[selectedModelMeta?.provider ?? ''] ?? 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                    }`}
                  >
                    {selectedModelMeta?.logo_label ?? <Sparkles className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-base font-semibold text-text">{selectedModelMeta?.label}</p>
                      {selectedModelMeta?.provider ? <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{selectedModelMeta.provider}</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {selectedModelMeta?.frontend_hint ?? selectedModelMeta?.description}
                    </p>
                    {selectedModelMeta?.alias_hint ? <p className="mt-2 text-[11px] text-muted">{selectedModelMeta.alias_hint}</p> : null}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" />
                </div>
              </button>
            </div>

              <div className="space-y-4 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">
                    {composerMode === 'variation' ? 'Variation prompt guidance' : 'Describe your image'}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {composerMode === 'variation'
                      ? 'Prompt edits here are optional. Variations are driven primarily by the selected source image.'
                      : 'Start with one strong visual idea. References and output settings will refine it.'}
                  </p>
                </div>
                <Button variant="secondary" type="button" onClick={() => void enhancePrompt()} disabled={enhancing} className="gap-2 px-3 py-1.5 text-xs">
                  {enhancing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {enhancing ? 'Enhancing...' : 'Enhance'}
                </Button>
              </div>
              <Textarea
                rows={7}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                maxLength={MAX_PROMPT_CHARS}
                placeholder="Describe the subject, mood, environment, camera feel, lighting, and final style you want."
              />
              <p className="text-right text-[11px] text-muted">{prompt.length}/{MAX_PROMPT_CHARS}</p>
              <div className="flex flex-wrap gap-2">
                {powerWords.map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => applyPowerWord(word)}
                    className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.4)] px-3 py-1.5 text-xs font-semibold text-muted hover:border-[hsl(var(--color-accent))] hover:text-text"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Visual references</p>
                  <p className="mt-1 text-xs text-muted">Upload reference photos for composition, styling, or subject consistency.</p>
                </div>
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] px-3 py-2 text-xs font-semibold text-text hover:border-[hsl(var(--color-accent))]">
                  <Upload className="h-3.5 w-3.5" />
                  {uploadingReference ? 'Uploading...' : 'Upload photo'}
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
              {referenceUploads.length === 0 ? (
                <div className="flex min-h-24 items-center justify-center rounded-[24px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.2)] text-center text-xs text-muted">
                  Add up to 4 JPG, PNG, or WEBP references.
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {referenceUploads.map((item) => (
                    <div key={item.id} className="group relative overflow-hidden rounded-[24px] border border-[hsl(var(--color-border))]">
                      <img src={toAbsoluteUrl(item.url)} alt={item.name} className="aspect-square w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeReferenceUpload(item.id)}
                        className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--color-surface)/0.92)] text-text opacity-0 transition group-hover:opacity-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Card className="space-y-4 rounded-[24px] border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4 backdrop-blur-md">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Output</p>
                  <p className="mt-1 text-xs text-muted">Keep framing and fidelity compact so the prompt stays primary.</p>
                </div>
                <Badge>
                  {aspectRatio} • {resolutionOptions.find((item) => item.value === resolution)?.label ?? resolution}
                </Badge>
              </div>
              <div className="space-y-3">
                <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
                  <div className="flex flex-wrap gap-2">
                    {aspectOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setAspectRatio(option.value)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          aspectRatio === option.value
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                        }`}
                        title={`${option.label} · ${option.helper}`}
                      >
                        {option.value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
                  <div className="flex flex-wrap gap-2">
                    {resolutionOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setResolution(option.value)}
                        className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                          resolution === option.value
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            <div className="space-y-3">
              {error ? <p className="text-sm text-danger">{error}</p> : null}
              <div className="flex items-center justify-between gap-3 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-text">{selectedModelMeta?.label}</p>
                  <p className="mt-1 text-xs text-muted">
                    {composerMode === 'variation'
                      ? variationSource
                        ? 'Creates 4 new variations from the selected source image.'
                        : 'Select or generate a source image to enable variations.'
                      : `${aspectRatio} • ${resolutionOptions.find((item) => item.value === resolution)?.label ?? resolution} • ${estimate ? `${estimate.estimatedCredits} credits estimated` : isEstimating ? 'Estimating credits...' : 'Credits unavailable'}`}
                  </p>
                </div>
                <Button
                  onClick={() => void handlePrimaryAction()}
                  disabled={
                    submitting ||
                    actionLoading === variationActionKey ||
                    (composerMode === 'variation'
                      ? !variationSource
                      : Boolean(estimate && !estimate.sufficient))
                  }
                  className="min-w-[190px] rounded-[20px] border-0 bg-[linear-gradient(135deg,hsl(var(--color-accent)),rgb(236_72_153))] px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95"
                >
                  {submitting || actionLoading === variationActionKey ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      {composerMode === 'variation' ? 'Creating variations...' : 'Generating...'}
                    </>
                  ) : (
                    <>
                      {composerMode === 'variation' ? <Stars className="h-4 w-4" /> : <Wand2 className="h-4 w-4" />}
                      {composerMode === 'variation'
                        ? 'Create 4 variations'
                        : `Generate · ${estimate ? `${estimate.estimatedCredits} cr` : '...'}`}
                    </>
                  )}
                </Button>
              </div>
              {composerMode === 'create' && estimate && !estimate.sufficient ? (
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-[hsl(var(--color-danger))]">
                  <button type="button" onClick={() => openLowBalanceModal(estimate.estimatedCredits)}>
                    Insufficient credits
                  </button>
                  <a href="/billing">Top up</a>
                  <a href="/pricing">View plans</a>
                </div>
              ) : null}
              {composerMode === 'create' && estimateError ? (
                <p className="text-xs text-amber-600">Could not estimate credits right now. Final validation happens during generation.</p>
              ) : null}
              {composerMode === 'create' && !estimateError && isUsingFallback ? (
                <p className="text-xs text-muted">Using estimated credits based on current settings.</p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="min-w-0">
          <Card className="space-y-4 rounded-[32px] border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] p-4 shadow-soft backdrop-blur-md sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Live Canvas</p>
                <h2 className="mt-2 text-lg font-semibold text-text">Current Image Output</h2>
              </div>
              <Badge>{activeTab === 'generated' ? 'Your image' : 'Inspiration'}</Badge>
            </div>
            <div className="overflow-hidden rounded-[32px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]">
              {livePreviewImage ? (
                <img
                  src={getPreviewImageUrl(livePreviewImage) ?? ''}
                  alt={getPreviewImageLabel(livePreviewImage)}
                  className="aspect-[4/5] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">
                  Generate an image to start building your live canvas.
                </div>
              )}
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Model</p>
                <p className="mt-1 text-sm font-semibold text-text">
                  {activeTab === 'generated'
                    ? selectedGeneratedModel?.label ?? selectedModelMeta?.label ?? 'Model selected'
                    : selectedInspirationModel?.label ?? selectedModelMeta?.label ?? 'Model selected'}
                </p>
              </div>
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Output</p>
                  <p className="mt-1 text-sm font-semibold text-text">{aspectRatio} • {resolutionOptions.find((item) => item.value === resolution)?.label ?? resolution}</p>
              </div>
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Preview</p>
                <p className="mt-1 text-sm font-semibold text-text">{activeTab === 'generated' ? 'Studio output' : 'Creator inspiration'}</p>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Studio Feed</h2>
            <p className="mt-1 text-sm text-muted">Browse your latest outputs or switch into curated inspiration without leaving the canvas.</p>
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

        <Card className="space-y-4 rounded-[24px] border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] backdrop-blur-md">
          <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
            <div>
              <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Search by prompt or tags
              </label>
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-3">
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
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
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

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(activeTab === 'generated' ? generatedImages : filteredInspiration).map((item) => {
              const imageUrl = getPreviewImageUrl(item);
              const itemModel = models.find((model) => model.key === item.model_key);
              const isGenerated = activeTab === 'generated';
              return (
                <button
                  key={`${activeTab}-${item.id}`}
                  type="button"
                  onClick={() => {
                    if (isGenerated) {
                      setSelectedGenerated(item as GeneratedImage);
                    } else {
                      setSelectedInspiration(item as InspirationImage);
                    }
                  }}
                  className={`overflow-hidden rounded-[24px] border text-left transition hover:-translate-y-0.5 hover:shadow-soft ${
                    ((isGenerated ? selectedGenerated?.id : selectedInspiration?.id) === item.id)
                      ? 'border-[hsl(var(--color-accent))] shadow-soft'
                      : 'border-[hsl(var(--color-border))]'
                  } bg-[hsl(var(--color-bg)/0.72)]`}
                >
                  <div className="overflow-hidden">
                    {imageUrl ? (
                      <img src={imageUrl} alt={getPreviewImageLabel(item)} className="aspect-[4/5] w-full object-cover transition duration-300 hover:scale-[1.02]" />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">No preview</div>
                    )}
                  </div>
                  <div className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="line-clamp-1 text-sm font-semibold text-text">
                          {'title' in item ? item.title : item.prompt.split(',')[0]}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{getPreviewImageLabel(item)}</p>
                      </div>
                      <Badge>{itemModel?.label ?? item.model_key}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{item.aspect_ratio}</Badge>
                      <Badge>{resolutionOptions.find((option) => option.value === item.resolution)?.label ?? item.resolution}</Badge>
                      {isGenerated ? <Badge>{(item as GeneratedImage).status}</Badge> : null}
                    </div>
                    {isGenerated ? (
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="secondary"
                          type="button"
                          className="gap-2 px-3 py-2 text-xs"
                          onClick={(event) => {
                            event.stopPropagation();
                            void downloadImage((item as GeneratedImage).image_url, (item as GeneratedImage).prompt);
                          }}
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                        <div className="flex items-center gap-2 text-xs text-muted">
                          <Tag className="h-3.5 w-3.5" />
                          {[...(item as GeneratedImage).auto_tags, ...(item as GeneratedImage).user_tags].slice(0, 2).join(', ') || 'No tags'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {(activeTab === 'generated' ? generatedImages : filteredInspiration).length === 0 ? (
            <div className="rounded-[24px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-5 py-12 text-center">
              <ImageIcon className="mx-auto h-8 w-8 text-[hsl(var(--color-accent))]" />
              <p className="mt-4 text-sm font-semibold text-text">
                {activeTab === 'generated' ? 'No generated images yet' : 'No inspiration items match these filters'}
              </p>
              <p className="mt-2 text-xs text-muted">
                {activeTab === 'generated'
                  ? 'Generate your first image and it will appear here instantly.'
                  : 'Try a different tag, model, or prompt search term.'}
              </p>
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
        <div className="grid gap-6 xl:grid-cols-[1.02fr_0.98fr]">
          <div className="space-y-4">
            <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.48)]">
              {activeTemplate?.thumbnail_url ? (
                <img src={activeTemplate.thumbnail_url} alt={activeTemplate.title} className="aspect-[4/5] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/5] items-end bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-elevated)))] p-5">
                  <div className="space-y-2">
                    <Badge>{activeTemplate?.category ?? 'Template'}</Badge>
                    <p className="text-2xl font-bold text-text">{activeTemplate?.title ?? 'Select a template'}</p>
                  </div>
                </div>
              )}
            </div>
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.44)] p-4">
              <div className="flex flex-wrap gap-2">
                <Badge>Image</Badge>
                {activeTemplate ? <Badge>{activeTemplate.category}</Badge> : null}
                {activeTemplate ? <Badge>{resolutionOptions.find((item) => item.value === activeTemplate.resolution)?.label ?? activeTemplate.resolution}</Badge> : null}
              </div>
              <h3 className="mt-3 text-2xl font-bold text-text">{activeTemplate?.title ?? 'Choose a template'}</h3>
              <p className="mt-2 text-sm text-muted">{activeTemplate?.description ?? 'Select a template to prefill your image prompt, model, and output settings.'}</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {imageTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => setActiveTemplate(template)}
                  className={`overflow-hidden rounded-[22px] border text-left transition ${
                    activeTemplate?.id === template.id
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)]'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.38)] hover:border-[hsl(var(--color-accent)/0.35)]'
                  }`}
                >
                  <div className="p-4">
                    <p className="text-sm font-semibold text-text">{template.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted">{template.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Template inputs</p>
                  <p className="mt-1 text-sm text-muted">Fill the fields, then apply the template into the image studio.</p>
                </div>
                {activeTemplate ? <Badge>{models.find((item) => item.key === activeTemplate.model_key)?.label ?? activeTemplate.model_key}</Badge> : null}
              </div>
              {activeTemplate ? (
                <div className="mt-4 space-y-3">
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
                    <div className="rounded-[20px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-4 py-5 text-sm text-muted">
                      This template uses a ready-made prompt. Apply it directly into the composer.
                    </div>
                  )}
                  <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">Will apply</p>
                    <p className="mt-2 text-sm text-text">
                      {models.find((item) => item.key === activeTemplate.model_key)?.label ?? activeTemplate.model_key}
                      {' · '}
                      {activeTemplate.aspect_ratio}
                      {' · '}
                      {resolutionOptions.find((item) => item.value === activeTemplate.resolution)?.label ?? activeTemplate.resolution}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <Button onClick={() => applyImageTemplate(activeTemplate, templateInputs)}>
                      Apply template
                    </Button>
                    <Button variant="secondary" onClick={() => setTemplatePickerOpen(false)}>
                      Close
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[20px] border border-dashed border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-4 py-6 text-sm text-muted">
                  Select an image template to load its visual direction and generation defaults.
                </div>
              )}
            </div>
          </div>
        </div>
      </Modal>
      {selectedInspiration ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[hsl(var(--color-text)/0.62)] p-3 backdrop-blur-sm sm:p-4" onClick={() => setSelectedInspiration(null)}>
          <div className="mx-auto flex h-full max-w-6xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <div className="grid max-h-[92vh] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-hard lg:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-[280px] bg-[hsl(var(--color-bg))]">
                <img src={selectedInspiration.image_url} alt={selectedInspiration.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex max-h-[92vh] flex-col overflow-y-auto p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-2xl font-extrabold tracking-tight text-text">{selectedInspiration.title}</h3>
                    <p className="mt-2 text-sm text-muted">Created {formatCreatedAt(selectedInspiration.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedInspiration(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text">Prompt</p>
                    <Button variant="secondary" type="button" onClick={() => void copyPrompt(selectedInspiration.prompt)} className="gap-2 px-3 py-1.5 text-xs">
                      <Copy className="h-3.5 w-3.5" />
                      {copiedPrompt ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                    <p className="text-sm leading-7 text-muted">{selectedInspiration.prompt}</p>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="mb-3 text-sm font-semibold text-text">Information</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Model</p>
                      <p className="mt-2 text-sm font-semibold text-text">{selectedInspirationModel?.label ?? selectedInspiration.model_key}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">References</p>
                      <p className="mt-2 text-sm font-semibold text-text">
                        {selectedInspiration.reference_urls.length > 0 ? `${selectedInspiration.reference_urls.length}` : '-'}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Aspect Ratio</p>
                      <p className="mt-2 text-sm font-semibold text-text">{selectedInspiration.aspect_ratio}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Resolution</p>
                      <p className="mt-2 text-sm font-semibold text-text">{resolutionOptions.find((option) => option.value === selectedInspiration.resolution)?.label ?? selectedInspiration.resolution}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="mb-2 text-sm font-semibold text-text">Auto tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedInspiration.tags.map((tag) => (
                      <Badge key={`insp-tag-${tag}`}>{tag}</Badge>
                    ))}
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void toggleLikeInspiration(selectedInspiration)}
                    className="gap-2"
                    disabled={likingId === selectedInspiration.id}
                  >
                    <Heart className={`h-4 w-4 ${selectedInspiration.liked_by_user ? 'fill-current' : ''}`} />
                    {selectedInspiration.like_count}
                  </Button>
                  <a
                    href={toAbsoluteUrl(selectedInspiration.image_url)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text"
                  >
                    <ExternalLink className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                    Open full image
                  </a>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent)/0.12)] px-3 py-1 text-xs font-semibold text-text">
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
        <div className="fixed inset-0 z-50 bg-[hsl(var(--color-text)/0.62)] p-4 backdrop-blur-sm" onClick={() => setSelectedGenerated(null)}>
          <div className="mx-auto flex h-full max-w-6xl items-center justify-center" onClick={(event) => event.stopPropagation()}>
            <div className="grid max-h-[92vh] w-full overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-hard lg:grid-cols-[1.1fr_0.9fr]">
              <div className="min-h-[280px] bg-[hsl(var(--color-bg))]">
                <img src={toAbsoluteUrl(selectedGenerated.image_url)} alt={selectedGenerated.prompt} className="h-full w-full object-cover" />
              </div>
              <div className="flex max-h-[92vh] flex-col overflow-y-auto p-5 sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-2xl font-extrabold tracking-tight text-text">{selectedGeneratedModel?.label ?? selectedGenerated.model_key}</h3>
                    <p className="mt-2 text-sm text-muted">Created {formatCreatedAt(selectedGenerated.created_at)}</p>
                  </div>
                  <button type="button" onClick={() => setSelectedGenerated(null)} className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-text">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text">Prompt</p>
                    <Button variant="secondary" type="button" onClick={() => void copyPrompt(selectedGenerated.prompt)} className="gap-2 px-3 py-1.5 text-xs">
                      <Copy className="h-3.5 w-3.5" />
                      {copiedPrompt ? 'Copied' : 'Copy'}
                    </Button>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                    <p className="text-sm leading-7 text-muted">{selectedGenerated.prompt}</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                    <p className="mb-2 text-sm font-semibold text-text">Auto tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedGenerated.auto_tags.length > 0 ? selectedGenerated.auto_tags.map((tag) => <Badge key={`auto-${tag}`}>{tag}</Badge>) : <span className="text-xs text-muted">No auto tags yet</span>}
                    </div>
                  </div>
                  <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                    <p className="mb-2 text-sm font-semibold text-text">User tags</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedGenerated.user_tags.length > 0 ? selectedGenerated.user_tags.map((tag) => <Badge key={`user-${tag}`}>{tag}</Badge>) : <span className="text-xs text-muted">No user tags yet</span>}
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={manualTagInput}
                        onChange={(event) => setManualTagInput(event.target.value)}
                        placeholder="comma separated tags"
                        className="min-w-0 flex-1 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-transparent px-3 py-2 text-sm text-text outline-none placeholder:text-muted"
                      />
                      <Button variant="secondary" type="button" onClick={() => void saveManualTags()}>
                        Save
                      </Button>
                    </div>
                  </div>
                </div>
                <div className="mt-6">
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
                    <Button variant="secondary" type="button" onClick={() => void runImageAction(selectedGenerated.id, 'variation')} className="justify-start gap-2" disabled={actionLoading === `${selectedGenerated.id}:variation`}>
                      <Stars className="h-4 w-4" />
                      {actionLoading === `${selectedGenerated.id}:variation` ? 'Creating variation...' : 'Give me 4 more like this'}
                    </Button>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="mb-3 text-sm font-semibold text-text">Information</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Model</p>
                      <p className="mt-2 text-sm font-semibold text-text">{selectedGeneratedModel?.label ?? selectedGenerated.model_key}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">References</p>
                      <p className="mt-2 text-sm font-semibold text-text">
                        {selectedGenerated.reference_urls.length > 0 ? `${selectedGenerated.reference_urls.length}` : '-'}
                      </p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Aspect Ratio</p>
                      <p className="mt-2 text-sm font-semibold text-text">{selectedGenerated.aspect_ratio}</p>
                    </div>
                    <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-muted">Resolution</p>
                      <p className="mt-2 text-sm font-semibold text-text">{resolutionOptions.find((option) => option.value === selectedGenerated.resolution)?.label ?? selectedGenerated.resolution}</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => void togglePublish(selectedGenerated)}
                    className="gap-2"
                    disabled={publishingId === selectedGenerated.id}
                  >
                    {publishingId === selectedGenerated.id
                      ? 'Updating...'
                      : selectedGenerated.is_public_inspiration
                        ? 'Unpublish'
                        : 'Publish to inspiration'}
                  </Button>
                  <Button variant="secondary" type="button" onClick={() => void downloadImage(selectedGenerated.image_url, selectedGenerated.prompt)} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download image
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

      <Modal open={modelPickerOpen} onClose={() => setModelPickerOpen(false)}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Model selection</p>
            <h3 className="mt-1 text-xl font-semibold text-text">Choose your image model</h3>
            <p className="mt-1 text-sm text-muted">Pick the output engine, then get back to the prompt quickly.</p>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {models.map((model) => {
              const active = model.key === selectedModel;
              return (
                <button
                  key={model.key}
                  type="button"
                  onClick={() => {
                    setSelectedModel(model.key);
                    setModelPickerOpen(false);
                  }}
                  className={`w-full rounded-[20px] border px-4 py-3 text-left transition ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.16),transparent)] shadow-soft'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] hover:bg-[hsl(var(--color-elevated))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-sm font-semibold ${
                        PROVIDER_LOGO_STYLES[model.provider ?? ''] ?? 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                      }`}
                    >
                      {model.logo_label ?? <Sparkles className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text">{model.label}</p>
                        {model.badge ? <Badge>{model.badge}</Badge> : null}
                        {active ? <Badge>Selected</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-muted">{model.description}</p>
                      {model.frontend_hint ? <p className="mt-2 text-xs text-[hsl(var(--color-accent))]">{model.frontend_hint}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        {model.provider ? <span>{model.provider}</span> : null}
                        {model.alias_hint ? <span>{model.alias_hint}</span> : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </>
  );
}
