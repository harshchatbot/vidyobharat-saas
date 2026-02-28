'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Clapperboard,
  Copy,
  ExternalLink,
  GalleryVerticalEnd,
  ImageIcon,
  Images,
  Info,
  Lightbulb,
  LoaderCircle,
  X,
  Sparkles,
  Wand2,
} from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { GeneratedImage, ImageModel, InspirationImage } from '@/types/api';

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

function toAbsoluteUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

export function ImageStudioClient({ userId }: Props) {
  const [models, setModels] = useState<ImageModel[]>(fallbackModels);
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [inspiration, setInspiration] = useState<InspirationImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'generated' | 'inspiration'>('generated');
  const [selectedInspiration, setSelectedInspiration] = useState<InspirationImage | null>(null);
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  const [selectedModel, setSelectedModel] = useState('nano_banana');
  const [prompt, setPrompt] = useState('');
  const [referenceInput, setReferenceInput] = useState('');
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      api.listImageModels(userId).catch(() => fallbackModels),
      api.listGeneratedImages(userId).catch(() => []),
      api.listImageInspiration(userId).catch(() => []),
    ]).then(([modelData, generatedData, inspirationData]) => {
      if (cancelled) return;
      setModels(modelData.length > 0 ? modelData : fallbackModels);
      setSelectedModel((current) => (modelData.some((item) => item.key === current) ? current : (modelData[0]?.key ?? 'nano_banana')));
      setGeneratedImages(generatedData);
      setInspiration(inspirationData);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const referenceUrls = useMemo(
    () =>
      referenceInput
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
    [referenceInput],
  );

  const selectedModelMeta = models.find((item) => item.key === selectedModel) ?? models[0];

  const selectedInspirationModel = selectedInspiration
    ? models.find((model) => model.key === selectedInspiration.model_key)
    : null;

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
      setGeneratedImages((prev) => [item, ...prev]);
      setActiveTab('generated');
    } catch {
      setError('Failed to generate image. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const copyPrompt = async () => {
    if (!selectedInspiration) return;
    await navigator.clipboard.writeText(selectedInspiration.prompt);
    setCopiedPrompt(true);
    window.setTimeout(() => setCopiedPrompt(false), 1800);
  };

  const formatCreatedAt = (value: string) =>
    new Date(value).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

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
              Generate campaign-ready visuals with subtle, guided controls.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-muted sm:text-base">
              Pick a model by output style, add references if needed, choose the right canvas for Instagram, Reels, or YouTube, and build a clean image library as you go.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[360px]">
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4">
              <Wand2 className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Model-led selection</p>
              <p className="mt-1 text-xs text-muted">Choose by output style, not platform jargon.</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4">
              <Clapperboard className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Format presets</p>
              <p className="mt-1 text-xs text-muted">Vertical, square, portrait, and wide in one flow.</p>
            </div>
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4">
              <GalleryVerticalEnd className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold text-text">Built-in gallery</p>
              <p className="mt-1 text-xs text-muted">Your generated assets and community inspiration side by side.</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="space-y-5">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-[hsl(var(--color-accent))]" />
            <div>
              <p className="text-sm font-semibold text-text">Create Image</p>
              <p className="text-xs text-muted">Simple controls, clean output, no clutter.</p>
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
            <p className="mb-1 text-sm font-semibold text-text">Prompt</p>
            <Textarea
              rows={6}
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the image you want to create. Include style, setting, lighting, mood, camera perspective, and any important objects or people."
            />
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
                    <img src={toAbsoluteUrl(item.image_url)} alt={item.prompt} className="h-64 w-full object-cover" />
                    <div className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text">{models.find((model) => model.key === item.model_key)?.label ?? item.model_key}</p>
                          <p className="mt-1 text-xs text-muted">{item.aspect_ratio} • {item.resolution}px</p>
                        </div>
                        <Badge>{item.status}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-muted">{item.prompt}</p>
                      <a
                        href={toAbsoluteUrl(item.image_url)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-semibold text-text"
                      >
                        <ImageIcon className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                        Open full image
                      </a>
                    </div>
                  </Card>
                ))}
              </div>
            )
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {inspiration.map((item) => (
                <Card key={item.id} className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => setSelectedInspiration(item)}
                    className="block w-full text-left"
                  >
                    <img src={item.image_url} alt={item.title} className="h-64 w-full object-cover transition duration-300 hover:scale-[1.02]" />
                  </button>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-text">{item.title}</p>
                      <Badge>{models.find((model) => model.key === item.model_key)?.label ?? item.model_key}</Badge>
                    </div>
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">By {item.creator_name}</p>
                    <p className="text-sm leading-6 text-muted">{item.prompt}</p>
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
          <div
            className="mx-auto flex h-full max-w-6xl items-center justify-center"
            onClick={(event) => event.stopPropagation()}
          >
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
                  <button
                    type="button"
                    onClick={() => setSelectedInspiration(null)}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-text"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-text">Prompt</p>
                    <Button variant="secondary" type="button" onClick={() => void copyPrompt()} className="gap-2 px-3 py-1.5 text-xs">
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

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <a
                    href={selectedInspiration.image_url}
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
    </div>
  );
}
