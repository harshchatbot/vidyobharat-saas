'use client';

import { useEffect, useMemo, useState } from 'react';
import {
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
  LoaderCircle,
  Search,
  Sparkles,
  Stars,
  Tag,
  Wand2,
  X,
  Zap,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetSearchItem, AssetTagFacet, GeneratedImage, ImageModel, ImageQuickTemplate, InspirationImage } from '@/types/api';

type Props = {
  userId: string;
};

const fallbackModels: ImageModel[] = [
  {
    key: 'nano_banana',
    label: 'Nano Banana',
    description: 'Best for crisp social visuals and fast drafts.',
    frontend_hint: 'Use this for punchy reel covers and campaign concepts.',
  },
  {
    key: 'openai_image',
    label: 'OpenAI Images',
    description: 'Best for reliable prompt-following and practical testing with a verified OpenAI image key.',
    frontend_hint: 'Use this when you want the most dependable live image generation path right now.',
  },
  {
    key: 'seedream',
    label: 'Seedream',
    description: 'Best for premium editorial imagery and elegant lighting.',
    frontend_hint: 'Use this for polished brand shots and premium moodboards.',
  },
  {
    key: 'flux_spark',
    label: 'Flux Spark',
    description: 'Best for realistic product scenes and commercial-style outputs.',
    frontend_hint: 'Use this for product storytelling and ad-ready frames.',
  },
  {
    key: 'recraft_studio',
    label: 'Recraft Studio',
    description: 'Best for stylized illustrations and graphic-first compositions.',
    frontend_hint: 'Use this for creator-brand graphics and design-led visuals.',
  },
];

const aspectOptions = [
  { value: '9:16', label: 'Reels / Shorts', helper: 'Vertical social' },
  { value: '4:5', label: 'Instagram Feed', helper: 'Portrait post' },
  { value: '1:1', label: 'Square', helper: 'Grid-friendly' },
  { value: '16:9', label: 'YouTube', helper: 'Landscape' },
];

const resolutionOptions = [
  { value: '1024', label: '1024px', helper: 'Fast previews' },
  { value: '1536', label: '1536px', helper: 'Balanced quality' },
  { value: '2048', label: '2048px', helper: 'High detail' },
];

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
    model_key: 'flux_spark',
  },
  {
    id: 'fashion-studio',
    category: 'E-commerce',
    title: 'Model wearing clothes in a studio',
    prompt: 'Fashion campaign portrait of a model wearing street-luxury apparel in a premium studio, editorial lighting, clean backdrop, detailed fabric texture.',
    aspect_ratio: '4:5',
    resolution: '2048',
    model_key: 'seedream',
  },
  {
    id: 'thumbnail-bg',
    category: 'YouTube / Social Media',
    title: 'Dramatic thumbnail background',
    prompt: 'High-energy YouTube thumbnail background with dramatic lighting, strong depth, bold contrast, clear subject area, and visual impact.',
    aspect_ratio: '16:9',
    resolution: '1536',
    model_key: 'nano_banana',
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
    model_key: 'seedream',
  },
];

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

function toGeneratedFromAsset(item: AssetSearchItem): GeneratedImage {
  return {
    id: item.id,
    parent_image_id: null,
    model_key: item.model_key,
    prompt: item.prompt,
    aspect_ratio: item.aspect_ratio,
    resolution: item.resolution,
    reference_urls: item.reference_urls,
    image_url: item.asset_url ?? item.thumbnail_url ?? '',
    thumbnail_url: item.thumbnail_url ?? item.asset_url ?? '',
    action_type: null,
    status: item.status,
    auto_tags: item.auto_tags,
    user_tags: item.user_tags,
    created_at: item.created_at,
  };
}

function toErrorMessage(error: unknown, fallback: string) {
  if (!(error instanceof Error) || !error.message) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(error.message) as { detail?: string };
    if (parsed.detail) return parsed.detail;
  } catch {
    return error.message;
  }
  return error.message;
}

export function ImageStudioClient({ userId }: Props) {
  const [models, setModels] = useState<ImageModel[]>(fallbackModels);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [inspiration, setInspiration] = useState<InspirationImage[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generated' | 'inspiration'>('generated');
  const [selectedInspiration, setSelectedInspiration] = useState<InspirationImage | null>(null);
  const [selectedGenerated, setSelectedGenerated] = useState<GeneratedImage | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [selectedModel, setSelectedModel] = useState('nano_banana');
  const [prompt, setPrompt] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');
  const [activeQuickCategory, setActiveQuickCategory] = useState('E-commerce');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedModelFilters, setSelectedModelFilters] = useState<string[]>([]);
  const [selectedResolutionFilters, setSelectedResolutionFilters] = useState<string[]>([]);
  const [manualTagInput, setManualTagInput] = useState('');

  const refreshGeneratedFeed = async (
    nextQuery = searchQuery,
    nextTags = selectedTags,
    nextModels = selectedModelFilters,
    nextResolutions = selectedResolutionFilters,
  ) => {
    const response = await api.searchAssets(userId, {
      content_type: 'image',
      query: nextQuery || undefined,
      tags: nextTags,
      models: nextModels,
      resolutions: nextResolutions,
      sort: 'newest',
      page: 1,
      page_size: 48,
    });
    setGeneratedImages(response.items.map(toGeneratedFromAsset));
  };

  const refreshTagFacets = async () => {
    const facets = await api.listAssetTags(userId, { content_type: 'image' });
    setTagFacets(facets);
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.listImageModels(userId).catch(() => fallbackModels),
      api.listImageInspiration(userId).catch(() => []),
      api.listAssetTags(userId, { content_type: 'image' }).catch(() => []),
    ]).then(([modelData, inspirationData, tagData]) => {
      if (cancelled) return;
      const nextModels = modelData.length > 0 ? modelData : fallbackModels;
      setModels(nextModels);
      setSelectedModel((current) => (nextModels.some((item) => item.key === current) ? current : nextModels[0]?.key ?? 'nano_banana'));
      setInspiration(inspirationData);
      setTagFacets(tagData);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;
    void refreshGeneratedFeed(searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters)
      .catch((error) => {
        if (cancelled) return;
        setError(toErrorMessage(error, 'Failed to load filtered images.'));
      });
    return () => {
      cancelled = true;
    };
  }, [userId, searchQuery, selectedTags, selectedModelFilters, selectedResolutionFilters]);

  useEffect(() => {
    setManualTagInput(selectedGenerated?.user_tags.join(', ') ?? '');
  }, [selectedGenerated]);

  const referenceUrls = useMemo(
    () =>
      referenceInput
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
    [referenceInput],
  );
  const selectedModelMeta = models.find((item) => item.key === selectedModel) ?? models[0];
  const selectedInspirationModel = selectedInspiration ? models.find((model) => model.key === selectedInspiration.model_key) : null;
  const selectedGeneratedModel = selectedGenerated ? models.find((model) => model.key === selectedGenerated.model_key) : null;
  const quickCategories = Array.from(new Set(quickTemplates.map((item) => item.category)));
  const visibleQuickTemplates = quickTemplates.filter((item) => item.category === activeQuickCategory);
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
    if (!prompt.trim()) {
      setError('Prompt is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const item = await api.generateImage(
        {
          model_key: selectedModel,
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          resolution,
          reference_urls: referenceUrls,
        },
        userId,
      );
      setSelectedGenerated(item);
      setActiveTab('generated');
      await Promise.all([refreshGeneratedFeed(), refreshTagFacets()]);
    } catch (error) {
      setError(toErrorMessage(error, 'Failed to generate image. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const enhancePrompt = async () => {
    if (!prompt.trim()) {
      setError('Write a base prompt first.');
      return;
    }
    setEnhancing(true);
    setError(null);
    try {
      const response = await api.enhanceImagePrompt({ prompt, model_key: selectedModel }, userId);
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

  const applyQuickTemplate = (template: ImageQuickTemplate) => {
    setPrompt(template.prompt);
    setAspectRatio(template.aspect_ratio);
    setResolution(template.resolution);
    setSelectedModel(template.model_key);
  };

  const copyPrompt = async (value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const downloadImage = async (imageUrl: string, fileNameBase: string) => {
    try {
      const response = await fetch(toAbsoluteUrl(imageUrl));
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const extension = blob.type.includes('png') ? 'png' : blob.type.includes('svg') ? 'svg' : 'jpg';
      const safeName = fileNameBase.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'image';
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${safeName}.${extension}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
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
      await Promise.all([refreshGeneratedFeed(), refreshTagFacets()]);
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
      await Promise.all([refreshGeneratedFeed(), refreshTagFacets()]);
    } catch (error) {
      setError(toErrorMessage(error, 'Could not update tags right now.'));
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

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))] p-6 shadow-soft sm:p-8">
        <div className="pointer-events-none absolute right-0 top-0 h-44 w-44 rounded-full bg-[hsl(var(--color-accent)/0.18)] blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.85)] px-3 py-1 text-xs font-semibold text-muted">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              RangManch AI Image Studio
            </div>
            <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
              Move from a blank prompt box to a real creator studio.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
              Use quick starts, refine prompts with AI, and keep creating after generation with one-click actions like variations, upscale, and background cleanup.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4">
              <Wand2 className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Smart Prompt</p>
              <p className="mt-1 text-xs text-muted">Refine weak prompts into premium visual direction.</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4">
              <Clapperboard className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Quick Starts</p>
              <p className="mt-1 text-xs text-muted">Use creator templates for e-commerce, YouTube, and fantasy art.</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4">
              <Stars className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Magic Actions</p>
              <p className="mt-1 text-xs text-muted">Remove background, upscale, or generate variations after the first output.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <div>
                <p className="text-sm font-semibold text-text">Quick Starts</p>
                <p className="text-xs text-muted">Jump into creator-friendly presets instead of starting from blank.</p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {quickCategories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveQuickCategory(category)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                    activeQuickCategory === category
                      ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                      : 'border border-[hsl(var(--color-border))] text-muted'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {visibleQuickTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => applyQuickTemplate(template)}
                  className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4 text-left hover:bg-[hsl(var(--color-elevated))]"
                >
                  <p className="text-sm font-semibold text-text">{template.title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{template.prompt}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge>{template.aspect_ratio}</Badge>
                    <Badge>{template.resolution}px</Badge>
                    <Badge>{models.find((item) => item.key === template.model_key)?.label ?? template.model_key}</Badge>
                  </div>
                </button>
              ))}
            </div>
          </Card>

        <Card className="space-y-5">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <div>
                <p className="text-sm font-semibold text-text">Create Image</p>
                <p className="text-xs text-muted">Simple controls, but with real guidance.</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Choose model</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {models.map((model) => {
                  const active = model.key === selectedModel;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      onClick={() => setSelectedModel(model.key)}
                      className={`rounded-[var(--radius-md)] border p-4 text-left transition ${
                        active
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                          : 'border-border bg-bg hover:bg-elevated'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.16)] text-[hsl(var(--color-accent))]">
                          <Sparkles className="h-5 w-5" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text">{model.label}</p>
                          <p className="mt-1 text-xs leading-5 text-muted">{model.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-muted">
                {selectedModelMeta?.frontend_hint}
              </div>
              <div className="mt-3">
                <Dropdown value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
                  {models.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.label}
                    </option>
                  ))}
                </Dropdown>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-text">Prompt</p>
                <Button variant="secondary" type="button" onClick={() => void enhancePrompt()} disabled={enhancing} className="gap-2 px-3 py-1.5 text-xs">
                  {enhancing ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Wand2 className="h-3.5 w-3.5" />}
                  {enhancing ? 'Enhancing...' : 'Enhance'}
                </Button>
              </div>
              <Textarea
                rows={6}
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder="Describe the image you want to create. Include style, setting, lighting, mood, camera perspective, and any important objects or people."
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {powerWords.map((word) => (
                  <button
                    key={word}
                    type="button"
                    onClick={() => applyPowerWord(word)}
                    className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1.5 text-xs font-semibold text-muted hover:border-[hsl(var(--color-accent))]"
                  >
                    {word}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-1 text-sm font-semibold text-text">Photos or references (optional)</p>
              <Textarea
                rows={3}
                value={referenceInput}
                onChange={(event) => setReferenceInput(event.target.value)}
                placeholder={'Paste one URL per line\nhttps://example.com/reference-1.jpg\nhttps://example.com/reference-2.jpg'}
              />
              <p className="mt-2 text-xs text-muted">Add links to mood references, product shots, or visual direction boards.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold text-text">Aspect ratio</p>
                <div className="grid gap-2">
                  {aspectOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setAspectRatio(option.value)}
                      className={`flex items-center justify-between rounded-[var(--radius-md)] border px-3 py-3 text-left ${
                        aspectRatio === option.value
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                          : 'border-border bg-bg hover:bg-elevated'
                      }`}
                    >
                      <span>
                        <span className="block text-sm font-semibold text-text">{option.label}</span>
                        <span className="block text-xs text-muted">{option.helper}</span>
                      </span>
                      <Badge>{option.value}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-text">Resolution</p>
                <div className="grid gap-2">
                  {resolutionOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setResolution(option.value)}
                      className={`rounded-[var(--radius-md)] border px-3 py-3 text-left ${
                        resolution === option.value
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                          : 'border-border bg-bg hover:bg-elevated'
                      }`}
                    >
                      <span className="block text-sm font-semibold text-text">{option.label}</span>
                      <span className="block text-xs text-muted">{option.helper}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {error ? <p className="text-sm text-danger">{error}</p> : null}

            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted">
                <span className="font-semibold text-text">{selectedModelMeta?.label}</span> • {aspectRatio} • {resolution}px
              </div>
              <Button onClick={() => void submit()} disabled={submitting} className="gap-2">
                {submitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                {submitting ? 'Generating...' : 'Generate Image'}
              </Button>
            </div>
        </Card>

        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Studio Feed</h2>
              <p className="mt-1 text-sm text-muted">Switch between your latest outputs and creator inspiration.</p>
            </div>
            <div className="inline-flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-1">
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

          <Card className="space-y-4">
            <div className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
              <div>
                <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                  <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                  Search by prompt or tags
                </label>
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2">
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search for styles, objects, moods, scenes..."
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
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
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
                    <span className="text-xs text-muted">Newest assets are shown by default.</span>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4 lg:col-span-2">
                <div>
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-text">
                    <Tag className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                    Filter by tags
                  </p>
                  <div className="flex max-h-48 flex-wrap gap-2 overflow-auto">
                    {tagFacets.map((item) => (
                      <button
                        key={item.tag}
                        type="button"
                        onClick={() => toggleFilter(item.tag, selectedTags, setSelectedTags)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedTags.includes(item.tag)
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border border-[hsl(var(--color-border))] text-muted'
                        }`}
                      >
                        {item.tag} · {item.count}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="space-y-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                <div>
                  <p className="mb-2 text-sm font-semibold text-text">Filter by model</p>
                  <div className="flex flex-wrap gap-2">
                    {models.map((model) => (
                      <button
                        key={`filter-model-${model.key}`}
                        type="button"
                        onClick={() => toggleFilter(model.key, selectedModelFilters, setSelectedModelFilters)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedModelFilters.includes(model.key)
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border border-[hsl(var(--color-border))] text-muted'
                        }`}
                      >
                        {model.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-sm font-semibold text-text">Filter by resolution</p>
                  <div className="flex flex-wrap gap-2">
                    {resolutionOptions.map((option) => (
                      <button
                        key={`filter-resolution-${option.value}`}
                        type="button"
                        onClick={() => toggleFilter(option.value, selectedResolutionFilters, setSelectedResolutionFilters)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold ${
                          selectedResolutionFilters.includes(option.value)
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border border-[hsl(var(--color-border))] text-muted'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {activeTab === 'generated' ? (
            generatedImages.length === 0 ? (
              <Card className="text-center">
                <Images className="mx-auto h-10 w-10 text-[hsl(var(--color-accent))]" />
                <p className="mt-4 font-semibold text-text">No images generated yet</p>
                <p className="mt-1 text-sm text-muted">Your new creations will appear here immediately after generation.</p>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {generatedImages.map((item) => (
                  <Card key={item.id} className="overflow-hidden p-0">
                    <button type="button" onClick={() => setSelectedGenerated(item)} className="block w-full text-left">
                      <img src={toAbsoluteUrl(item.image_url)} alt={item.prompt} className="h-64 w-full object-cover transition duration-300 hover:scale-[1.02]" />
                    </button>
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{models.find((model) => model.key === item.model_key)?.label ?? item.model_key}</p>
                          <p className="mt-1 text-xs text-muted">{item.aspect_ratio} • {item.resolution}px</p>
                        </div>
                        <Badge>{item.status}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-muted">{item.prompt}</p>
                      <div className="flex flex-wrap gap-2">
                        {[...item.auto_tags.slice(0, 4), ...item.user_tags.slice(0, 2)].map((tag) => (
                          <Badge key={`${item.id}-${tag}`}>{tag}</Badge>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" type="button" onClick={() => void downloadImage(item.image_url, item.prompt)} className="gap-2 px-3 py-1.5 text-xs">
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => void runImageAction(item.id, 'remove_background')} className="gap-2 px-3 py-1.5 text-xs" disabled={actionLoading === `${item.id}:remove_background`}>
                          <Eraser className="h-3.5 w-3.5" />
                          {actionLoading === `${item.id}:remove_background` ? 'Working...' : 'Remove BG'}
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => void runImageAction(item.id, 'upscale')} className="gap-2 px-3 py-1.5 text-xs" disabled={actionLoading === `${item.id}:upscale`}>
                          <Zap className="h-3.5 w-3.5" />
                          {actionLoading === `${item.id}:upscale` ? 'Working...' : 'Upscale'}
                        </Button>
                        <Button variant="secondary" type="button" onClick={() => void runImageAction(item.id, 'variation')} className="gap-2 px-3 py-1.5 text-xs" disabled={actionLoading === `${item.id}:variation`}>
                          <Stars className="h-3.5 w-3.5" />
                          {actionLoading === `${item.id}:variation` ? 'Working...' : 'Variation'}
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {filteredInspiration.map((item) => (
                <Card key={item.id} className="overflow-hidden p-0">
                  <button type="button" onClick={() => setSelectedInspiration(item)} className="block w-full text-left">
                    <img src={item.image_url} alt={item.title} className="h-64 w-full object-cover transition duration-300 hover:scale-[1.02]" />
                  </button>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-text">{item.title}</p>
                      <Badge>{models.find((model) => model.key === item.model_key)?.label ?? item.model_key}</Badge>
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">By {item.creator_name}</p>
                    <p className="text-sm leading-6 text-muted">{item.prompt}</p>
                    <div className="flex flex-wrap gap-2">
                      {item.tags.slice(0, 5).map((tag) => (
                        <Badge key={`${item.id}-${tag}`}>{tag}</Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent)/0.12)] px-3 py-1 text-xs font-semibold text-text">
                        <Lightbulb className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                        Inspiration only
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedInspiration(item)}
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text"
                      >
                        <Info className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                        View details
                      </button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedInspiration ? (
        <div className="fixed inset-0 z-50 bg-[hsl(var(--color-text)/0.62)] p-4 backdrop-blur-sm" onClick={() => setSelectedInspiration(null)}>
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
                      <p className="mt-2 text-sm font-semibold text-text">{selectedInspiration.resolution}px</p>
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
                  <a href={selectedInspiration.image_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text">
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
                      <p className="mt-2 text-sm font-semibold text-text">{selectedGenerated.resolution}px</p>
                    </div>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <Button variant="secondary" type="button" onClick={() => void downloadImage(selectedGenerated.image_url, selectedGenerated.prompt)} className="gap-2">
                    <Download className="h-4 w-4" />
                    Download image
                  </Button>
                  <a href={toAbsoluteUrl(selectedGenerated.image_url)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-semibold text-text">
                    <ExternalLink className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                    Open full image
                  </a>
                  <Badge>{selectedGenerated.status}</Badge>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
