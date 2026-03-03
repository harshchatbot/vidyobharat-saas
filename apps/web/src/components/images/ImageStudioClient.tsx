'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
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
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useCredits } from '@/components/credits/CreditContext';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AssetTagFacet, CreditEstimateResponse, GeneratedImage, ImageModel, ImageQuickTemplate, InspirationImage } from '@/types/api';

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
  { value: '1024', label: '1024 px', helper: 'Fast previews' },
  { value: '1536', label: '1536 px', helper: 'Balanced quality' },
  { value: '2048', label: '2048 px', helper: 'High detail' },
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
  const [models, setModels] = useState<ImageModel[]>(fallbackModels);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [inspiration, setInspiration] = useState<InspirationImage[]>([]);
  const [tagFacets, setTagFacets] = useState<AssetTagFacet[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<CreditEstimateResponse | null>(null);
  const [activeTab, setActiveTab] = useState<'generated' | 'inspiration'>('generated');
  const [selectedInspiration, setSelectedInspiration] = useState<InspirationImage | null>(null);
  const [selectedGenerated, setSelectedGenerated] = useState<GeneratedImage | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [selectedModel, setSelectedModel] = useState('nano_banana');
  const [prompt, setPrompt] = useState('');
  const [referenceUploads, setReferenceUploads] = useState<Array<{ id: string; url: string; name: string }>>([]);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');
  const [activeQuickCategory, setActiveQuickCategory] = useState('E-commerce');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedModelFilters, setSelectedModelFilters] = useState<string[]>([]);
  const [selectedResolutionFilters, setSelectedResolutionFilters] = useState<string[]>([]);
  const [manualTagInput, setManualTagInput] = useState('');
  const [allGeneratedImages, setAllGeneratedImages] = useState<GeneratedImage[]>([]);
  const { wallet, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();

  const refreshGeneratedFeed = async (
    nextQuery = searchQuery,
    nextTags = selectedTags,
    nextModels = selectedModelFilters,
    nextResolutions = selectedResolutionFilters,
  ) => {
    const items = await api.listGeneratedImages(userId);
    setAllGeneratedImages(items);
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
    let cancelled = false;
    void Promise.all([
      api.listImageModels(userId).catch(() => fallbackModels),
      api.listImageInspiration(userId).catch(() => []),
      api.listGeneratedImages(userId).catch(() => []),
      api.listAssetTags(userId, { content_type: 'image' }).catch(() => []),
    ]).then(([modelData, inspirationData, imageData, tagData]) => {
      if (cancelled) return;
      const nextModels = modelData.length > 0 ? modelData : fallbackModels;
      setModels(nextModels);
      setSelectedModel((current) => (nextModels.some((item) => item.key === current) ? current : nextModels[0]?.key ?? 'nano_banana'));
      setInspiration(inspirationData);
      setAllGeneratedImages(imageData);
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

  const referenceUrls = useMemo(() => referenceUploads.map((item) => item.url), [referenceUploads]);

  useEffect(() => {
    let cancelled = false;
    void api.estimateCredits(
      'image_generate',
      {
        model_key: selectedModel,
        resolution,
        reference_urls: referenceUrls,
      },
      userId,
    )
      .then((result) => {
        if (!cancelled) setEstimate(result);
      })
      .catch(() => {
        if (!cancelled) setEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, selectedModel, resolution, referenceUrls]);

  useEffect(() => {
    setManualTagInput(selectedGenerated?.user_tags.join(', ') ?? '');
  }, [selectedGenerated]);

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
      if (typeof item.remaining_credits === 'number') {
        if (wallet) {
          applyWallet({ ...wallet, currentCredits: item.remaining_credits });
        } else {
          void refreshCredits();
        }
      }
      show(`Created! Credits Used: ${item.applied_credits} · Remaining Balance: ${item.remaining_credits ?? wallet?.currentCredits ?? 0}`);
      setSelectedGenerated(item);
      setActiveTab('generated');
      const items = await refreshGeneratedFeed();
      await refreshTagFacets(items);
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

  const uploadReferenceFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingReference(true);
    setError(null);
    try {
      const nextUploads: Array<{ id: string; url: string; name: string }> = [];
      for (const file of Array.from(files).slice(0, Math.max(0, 4 - referenceUploads.length))) {
        const signed = await api.signUpload(
          {
            user_id: userId,
            filename: file.name,
            kind: 'image_reference',
          },
          userId,
        );
        const uploadResponse = await fetch(signed.upload_url, {
          method: signed.method || 'PUT',
          headers: {
            ...(signed.headers ?? {}),
            'Content-Type': file.type || 'application/octet-stream',
          },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error('Reference upload failed.');
        }
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
      const items = await refreshGeneratedFeed();
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
      const items = await refreshGeneratedFeed();
      await refreshTagFacets(items);
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

  const livePreviewImage =
    activeTab === 'generated'
      ? selectedGenerated ?? generatedImages[0] ?? null
      : selectedInspiration ?? filteredInspiration[0] ?? null;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[32px] border border-[hsl(var(--color-border))] bg-[radial-gradient(circle_at_top_left,hsl(var(--color-accent)/0.22),transparent_22%),radial-gradient(circle_at_86%_18%,hsl(var(--color-accent)/0.12),transparent_24%),linear-gradient(145deg,hsl(var(--color-surface)),hsl(var(--color-elevated))_44%,hsl(var(--color-bg)))] px-5 py-6 shadow-soft sm:px-7 sm:py-8">
        <div className="pointer-events-none absolute -left-10 top-4 h-44 w-44 rounded-full bg-[hsl(var(--color-accent)/0.14)] blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 right-0 h-40 w-40 rounded-full bg-[hsl(var(--color-accent)/0.1)] blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-1 text-xs font-semibold text-muted backdrop-blur-md">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              AI Image Studio
            </div>
            <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">
              Compose, preview, and ship images from one compact canvas.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
              Keep the prompt, references, and output controls on one side and the live canvas on the other so you can generate without hunting through oversized cards.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {['Prompt refine', 'Reference upload', 'Compact controls', 'Live canvas'].map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.45)] px-3 py-1.5 text-xs font-medium text-text backdrop-blur-md"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:w-[420px]">
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] p-4 backdrop-blur-md">
              <Wand2 className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Prompt Refinement</p>
              <p className="mt-1 text-xs text-muted">Start loose, then polish before generating.</p>
            </div>
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] p-4 backdrop-blur-md">
              <GalleryVerticalEnd className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Live Canvas</p>
              <p className="mt-1 text-xs text-muted">Preview the active image while iterating.</p>
            </div>
            <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] p-4 backdrop-blur-md">
              <Wallet className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Available Credits</p>
              <p className="mt-1 text-xs text-muted">{wallet?.currentCredits ?? 0} credits ready for image runs.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[440px_minmax(0,1fr)] xl:items-start">
        <div className="xl:sticky xl:top-24">
          <div className="space-y-5 rounded-[32px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.4)] p-4 shadow-soft backdrop-blur-md sm:p-5">
            <div className="grid grid-cols-2 gap-2 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-2">
              <button
                type="button"
                className="rounded-[20px] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.24),hsl(var(--color-accent)/0.04))] px-4 py-3 text-sm font-semibold text-text"
              >
                Create Image
              </button>
              <button
                type="button"
                className="rounded-[20px] px-4 py-3 text-sm font-semibold text-muted transition hover:bg-[hsl(var(--color-elevated))] hover:text-text"
              >
                Image Variations
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Model</p>
                  <p className="mt-1 text-xs text-muted">Choose the generation engine without wasting half the screen on cards.</p>
                </div>
                <Badge>{selectedModelMeta?.label}</Badge>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {models.map((model) => {
                  const active = model.key === selectedModel;
                  return (
                    <button
                      key={model.key}
                      type="button"
                      onClick={() => setSelectedModel(model.key)}
                      className={`rounded-[24px] border p-3 text-left transition ${
                        active
                          ? 'border-[hsl(var(--color-accent))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),transparent)] shadow-soft'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] hover:bg-[hsl(var(--color-elevated))]'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] text-[hsl(var(--color-accent))]">
                          <Sparkles className="h-4 w-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-text">{model.label}</p>
                          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted">{model.description}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-2 text-xs text-muted">
                {selectedModelMeta?.frontend_hint}
              </div>
            </div>

            <div className="space-y-4 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-text">Describe your image</p>
                  <p className="mt-1 text-xs text-muted">Use a single focused prompt, then layer references and output choices below.</p>
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
                placeholder="Describe your subject, mood, environment, camera feel, lighting, and visual style. Keep it precise enough for premium output."
              />
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
                  <p className="mt-1 text-xs text-muted">Upload photo references for style, subject, or composition guidance.</p>
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
                  <p className="mt-1 text-xs text-muted">Compact controls for aspect ratio and resolution.</p>
                </div>
                <Badge>{selectedModelMeta?.label}</Badge>
              </div>
              <div className="space-y-3">
                <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
                  <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Aspect ratio</p>
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
                      >
                        {option.value}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
                  <p className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Resolution</p>
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
                  <p className="text-sm font-semibold text-text">{aspectRatio} • {resolutionOptions.find((item) => item.value === resolution)?.label ?? `${resolution}px`}</p>
                  <p className="mt-1 text-xs text-muted">{estimate ? `${estimate.estimatedCredits} credits estimated` : 'Estimating credits...'}</p>
                </div>
                <Button
                  onClick={() => void submit()}
                  disabled={submitting || Boolean(estimate && !estimate.sufficient)}
                  className="min-w-[180px] rounded-[20px] border-0 bg-[linear-gradient(135deg,hsl(var(--color-accent)),rgb(236_72_153))] px-5 py-3 text-sm font-semibold text-white shadow-soft hover:opacity-95"
                >
                  {submitting ? (
                    <>
                      <LoaderCircle className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-4 w-4" />
                      Generate · {estimate ? `${estimate.estimatedCredits} cr` : '...'}
                    </>
                  )}
                </Button>
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
            </div>
          </div>
        </div>

        <div className="min-w-0 space-y-6">
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
                <p className="mt-1 text-sm font-semibold text-text">{aspectRatio} • {resolutionOptions.find((item) => item.value === resolution)?.label ?? `${resolution}px`}</p>
              </div>
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.55)] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Preview</p>
                <p className="mt-1 text-sm font-semibold text-text">{activeTab === 'generated' ? 'Studio output' : 'Creator inspiration'}</p>
              </div>
            </div>
          </Card>

          <div className="space-y-4">
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
              <div className="grid gap-4 xl:grid-cols-[1.4fr_0.6fr]">
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
                          <Badge>{item.resolution}px</Badge>
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
            </Card>
          </div>
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
