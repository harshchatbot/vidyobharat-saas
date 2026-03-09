'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clapperboard, Filter, ImageIcon, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useCredits } from '@/components/credits/CreditContext';
import { useCreditEstimator } from '@/components/credits/useCreditEstimator';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { Template, TemplateGenerateResponse, TemplateInputField } from '@/types/api';
import { TemplatePoster } from './TemplatePoster';

function normalizeOptions(field: TemplateInputField): Array<{ label: string; value: string }> {
  return (field.options || []).map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : { label: option.label || option.value, value: option.value },
  );
}

function buildInitialInputs(template: Template | null): Record<string, string> {
  if (!template?.inputs) return {};
  return Object.fromEntries(
    template.inputs.map((field) => [field.key, field.placeholder || (normalizeOptions(field)[0]?.value ?? '')]),
  );
}

function defaultEstimatePayload(template: Template | null, inputs: Record<string, string>) {
  if (!template) return null;
  const defaults = template.generation_defaults || {};
  if (template.type === 'image') {
    return {
      action: 'image_generate',
      payload: {
        model_key: defaults.model_key || 'gemini_flash_image',
        resolution: defaults.resolution || '1536',
      },
    };
  }
  return {
    action: 'video_create',
    payload: {
      model: defaults.model_key || 'sora2',
      resolution: defaults.resolution || '720p',
      durationSeconds: defaults.duration_seconds || 8,
      quality: defaults.quality || 'standard',
      captionsEnabled: true,
      voice: defaults.voice || 'Shubh',
      imageUrls: [],
      audioSettings: { sampleRateHz: 22050 },
      language: inputs.language || defaults.language || 'English',
    },
  };
}

export function TemplatesBrowserClient({ userId }: { userId: string }) {
  const router = useRouter();
  const { show } = useToast();
  const { wallet, refresh: refreshCredits } = useCredits();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image'>('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedResult, setGeneratedResult] = useState<TemplateGenerateResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.listUnifiedTemplates(userId).then((data) => {
      if (cancelled) return;
      setTemplates(data.filter((item) => item.active !== false));
      setError(null);
    }).catch((err) => {
      if (cancelled) return;
      setError(err instanceof Error ? err.message : 'Failed to load templates.');
      setTemplates([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    setTemplateInputs(buildInitialInputs(selectedTemplate));
    setGeneratedResult(null);
  }, [selectedTemplate]);

  const categories = useMemo(
    () => Array.from(new Set(templates.map((item) => item.category))).sort(),
    [templates],
  );

  const visibleTemplates = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (typeFilter !== 'all' && template.type !== typeFilter) return false;
      if (categoryFilter !== 'all' && template.category !== categoryFilter) return false;
      if (!keyword) return true;
      const haystack = `${template.name} ${template.description} ${template.short_description} ${template.category}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [templates, search, typeFilter, categoryFilter]);

  const trendingTemplates = visibleTemplates.filter((item) => item.trending);
  const videoTemplates = visibleTemplates.filter((item) => item.type === 'video');
  const imageTemplates = visibleTemplates.filter((item) => item.type === 'image');
  const activeEstimate = defaultEstimatePayload(selectedTemplate, templateInputs);
  const { estimates } = useCreditEstimator(
    activeEstimate
      ? [{ key: 'template', action: activeEstimate.action, payload: activeEstimate.payload }]
      : [],
    { currentCredits: wallet?.currentCredits ?? 0 },
  );
  const templateEstimate = estimates.template;

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const result = await api.generateFromTemplate({ templateId: selectedTemplate.id, inputs: templateInputs }, userId);
      setGeneratedResult(result);
      await refreshCredits();
      if (result.contentType === 'image') {
        show('Template image generated successfully.');
      } else {
        show('Template video queued successfully.');
      }
    } catch (err) {
      show(err instanceof Error ? err.message : 'Failed to generate from template.');
    } finally {
      setGenerating(false);
    }
  }

  function renderSection(title: string, items: Template[]) {
    if (items.length === 0) return null;
    return (
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="rangmanch-section-eyebrow">Templates</p>
            <h2 className="rangmanch-section-title">{title}</h2>
          </div>
          <span className="text-sm text-muted">{items.length} templates</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((template) => <TemplatePoster key={template.id} template={template} onClick={() => setSelectedTemplate(template)} />)}
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-8">
      <section className="rangmanch-floating-hero relative overflow-hidden rounded-[32px] p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="rangmanch-section-eyebrow">Template Studio</p>
            <h1 className="mt-3 font-heading text-4xl font-extrabold tracking-tight text-text sm:text-5xl">Visual templates for image and video creation</h1>
            <p className="mt-3 max-w-2xl text-base text-muted">Browse trending creative workflows, fill dynamic inputs, and generate directly through the existing RangManch pipelines.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant={typeFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('all')}>All</Button>
            <Button variant={typeFilter === 'video' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('video')}><Clapperboard className="mr-2 h-4 w-4" />Video</Button>
            <Button variant={typeFilter === 'image' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('image')}><ImageIcon className="mr-2 h-4 w-4" />Image</Button>
          </div>
        </div>
      </section>

      <section className="rangmanch-filter-bar flex flex-col gap-3 rounded-[24px] p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 text-sm text-muted"><Filter className="h-4 w-4" />Filter templates</div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates" className="sm:max-w-xs" />
        <Dropdown value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className="sm:max-w-[220px]">
          <option value="all">All categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </Dropdown>
      </section>

      {loading ? <div className="flex items-center gap-3 text-muted"><Spinner /> Loading templates...</div> : null}
      {error ? <div className="rounded-[24px] border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">{error}</div> : null}
      {!loading && !error ? (
        <div className="space-y-10">
          {renderSection('Trending Templates', trendingTemplates)}
          {renderSection('Video Templates', videoTemplates)}
          {renderSection('Image Templates', imageTemplates)}
        </div>
      ) : null}

      <Modal open={Boolean(selectedTemplate)} onClose={() => setSelectedTemplate(null)}>
        {selectedTemplate ? (
          <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[28px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.48)]">
                <img src={selectedTemplate.preview_image_url || selectedTemplate.thumbnail_url} alt={selectedTemplate.name} className="aspect-[4/5] w-full object-cover" />
              </div>
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.44)] p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{selectedTemplate.type === 'video' ? 'Video' : 'Image'}</Badge>
                  {selectedTemplate.trending ? <Badge>Trending</Badge> : null}
                  {selectedTemplate.featured ? <Badge>Featured</Badge> : null}
                  <Badge>{selectedTemplate.category}</Badge>
                </div>
                <h3 className="mt-3 text-2xl font-bold text-text">{selectedTemplate.name}</h3>
                <p className="mt-2 text-sm text-muted">{selectedTemplate.description}</p>
                {selectedTemplate.script_hint ? <p className="mt-4 text-sm text-text">Hint: {selectedTemplate.script_hint}</p> : null}
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Template inputs</p>
                    <p className="mt-1 text-sm text-muted">Fill the fields and generate directly through the existing pipeline.</p>
                  </div>
                  {templateEstimate ? <Badge>{templateEstimate.estimatedCredits} credits</Badge> : null}
                </div>
                <div className="mt-4 space-y-3">
                  {(selectedTemplate.inputs || []).map((field) => {
                    const options = normalizeOptions(field);
                    const value = templateInputs[field.key] || '';
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <label className="text-sm font-medium text-text">{field.label}</label>
                        {field.type === 'select' ? (
                          <Dropdown value={value} onChange={(e) => setTemplateInputs((current) => ({ ...current, [field.key]: e.target.value }))}>
                            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </Dropdown>
                        ) : field.type === 'textarea' ? (
                          <Textarea value={value} onChange={(e) => setTemplateInputs((current) => ({ ...current, [field.key]: e.target.value }))} placeholder={field.placeholder || ''} />
                        ) : (
                          <Input value={value} onChange={(e) => setTemplateInputs((current) => ({ ...current, [field.key]: e.target.value }))} placeholder={field.placeholder || ''} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button onClick={() => void handleGenerate()} disabled={generating}>
                    {generating ? 'Generating...' : 'Generate from template'}
                  </Button>
                  {generatedResult ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        if (generatedResult.contentType === 'image') {
                          router.push('/images');
                          return;
                        }
                        router.push('/create');
                      }}
                    >
                      Open result
                      <ArrowUpRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : null}
                </div>
              </div>
              {generatedResult ? (
                <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.46)] p-4">
                  <p className="text-sm font-semibold text-text">Latest result</p>
                  <p className="mt-1 text-sm text-muted">Status: {generatedResult.status} · Credits used: {generatedResult.appliedCredits}</p>
                  {generatedResult.imageUrl ? (
                    <img src={generatedResult.imageUrl} alt="Generated template result" className="mt-3 aspect-[4/5] w-full rounded-[20px] object-cover" />
                  ) : null}
                  {generatedResult.videoUrl ? (
                    <div className="mt-3 rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] p-4 text-sm text-muted">Video queued. Open the video studio or your library to monitor progress.</div>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
