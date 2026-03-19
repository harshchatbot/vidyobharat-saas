'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Clapperboard, Eye, Filter, ImageIcon, Sparkles, Wand2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { useCredits } from '@/components/credits/CreditContext';
import { useCreditEstimator } from '@/components/credits/useCreditEstimator';
import { ActiveProjectBar } from '@/components/projects/ActiveProjectBar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { Project, Template, TemplateGenerateResponse, TemplateInputField, TemplatePreviewResponse } from '@/types/api';
import { TemplatePoster } from './TemplatePoster';

const GROUP_LABELS: Record<string, string> = {
  explainers: 'Explainers',
  ads_promos: 'Ads & Promos',
  social_viral: 'Social Viral',
  carousels_posts: 'Carousels & Posts',
  covers_thumbnails: 'Covers & Thumbnails',
  quick_starts: 'Quick Starts',
};

function normalizeOptions(field: TemplateInputField): Array<{ label: string; value: string }> {
  return (field.options || []).map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : { label: option.label || option.value, value: option.value },
  );
}

function buildInitialInputs(template: Template | null): Record<string, string> {
  if (!template?.inputs?.length) return {};
  return Object.fromEntries(
    template.inputs.map((field) => [field.key, field.placeholder || normalizeOptions(field)[0]?.value || '']),
  );
}

function defaultEstimatePayload(template: Template | null, inputs: Record<string, string>, modelOverride: string) {
  if (!template) return null;
  const defaults = template.generation_defaults || {};
  if (template.type === 'image') {
    return {
      action: 'image_generate',
      payload: {
        model_key: modelOverride || defaults.model_key || template.recommended_model?.internal_model_key || 'gemini_flash_image',
        resolution: defaults.resolution || '1536',
      },
    };
  }
  return {
    action: 'video_create',
    payload: {
      model: modelOverride || defaults.model_key || template.recommended_model?.internal_model_key || 'veo3',
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

function resolveTemplateGroup(template: Template): string {
  if (template.is_quick_start) return 'quick_starts';
  if (template.category === 'explainers' || template.category === 'education') return 'explainers';
  if (template.category === 'ads_promos' || template.category === 'advertising') return 'ads_promos';
  if (template.category === 'social_viral') return 'social_viral';
  if (template.category === 'carousels_posts') return 'carousels_posts';
  if (template.category === 'covers_thumbnails') return 'covers_thumbnails';
  return template.type === 'video' ? 'explainers' : 'quick_starts';
}

function groupTemplates(templates: Template[]) {
  return templates.reduce<Record<string, Template[]>>((acc, template) => {
    const group = resolveTemplateGroup(template);
    acc[group] = acc[group] || [];
    acc[group].push(template);
    return acc;
  }, {});
}

export function TemplatesBrowserClient({ userId, initialProjectId }: { userId: string; initialProjectId?: string }) {
  const router = useRouter();
  const { show } = useToast();
  const { wallet, refresh: refreshCredits } = useCredits();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'image'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? '');
  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );
  const [templateInputs, setTemplateInputs] = useState<Record<string, string>>({});
  const [promptOverride, setPromptOverride] = useState('');
  const [modelOverride, setModelOverride] = useState('');
  const [preview, setPreview] = useState<TemplatePreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
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
    let cancelled = false;
    api.listProjects(userId).then((items) => {
      if (!cancelled) setProjects(items);
    }).catch(() => {
      if (!cancelled) setProjects([]);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    setTemplateInputs(buildInitialInputs(selectedTemplate));
    setPromptOverride('');
    setModelOverride(selectedTemplate?.generation_defaults?.model_key || selectedTemplate?.recommended_model?.internal_model_key || '');
    setSelectedProjectId(initialProjectId ?? '');
    setGeneratedResult(null);
    setPreview(null);
  }, [selectedTemplate, initialProjectId]);

  useEffect(() => {
    if (!selectedTemplate) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPreviewLoading(true);
      api.previewTemplate(
        {
          templateId: selectedTemplate.id,
          inputs: templateInputs,
          promptOverride: promptOverride || undefined,
          modelKey: modelOverride || undefined,
        },
        userId,
      ).then((result) => {
        if (!cancelled) setPreview(result);
      }).catch((err) => {
        if (!cancelled) {
          setPreview(null);
          show(err instanceof Error ? err.message : 'Failed to preview template.');
        }
      }).finally(() => {
        if (!cancelled) setPreviewLoading(false);
      });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedTemplate, templateInputs, promptOverride, modelOverride, userId, show]);

  const visibleTemplates = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return templates.filter((template) => {
      if (typeFilter !== 'all' && template.type !== typeFilter) return false;
      if (!keyword) return true;
      const haystack = `${template.name} ${template.description || ''} ${template.short_description || ''} ${template.category}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [templates, search, typeFilter]);

  const groupedTemplates = useMemo(() => groupTemplates(visibleTemplates), [visibleTemplates]);
  const trendingTemplates = useMemo(() => visibleTemplates.filter((item) => item.trending), [visibleTemplates]);
  const activeEstimate = defaultEstimatePayload(selectedTemplate, templateInputs, modelOverride);
  const { estimates } = useCreditEstimator(
    activeEstimate ? [{ key: 'template', action: activeEstimate.action, payload: activeEstimate.payload }] : [],
    { currentCredits: wallet?.currentCredits ?? 0 },
  );
  const templateEstimate = estimates.template;

  async function handleGenerate() {
    if (!selectedTemplate) return;
    setGenerating(true);
    try {
      const result = await api.generateFromTemplate(
        {
          templateId: selectedTemplate.id,
          inputs: templateInputs,
          modelKey: modelOverride || undefined,
          projectId: selectedProjectId || undefined,
          autoCreateProject: !selectedProjectId && !selectedTemplate.is_quick_start,
          modeId: preview?.recommendedModelMode || selectedTemplate.default_model_mode || undefined,
          promptOverride: promptOverride || undefined,
        },
        userId,
      );
      setGeneratedResult(result);
      await refreshCredits();
      show(result.contentType === 'image' ? 'Template image generated successfully.' : 'Template video queued successfully.');
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
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 2xl:grid-cols-7">
          {items.map((template) => <TemplatePoster key={template.id} template={template} onClick={() => setSelectedTemplate(template)} />)}
        </div>
      </section>
    );
  }

  return (
    <div className="rangmanch-page-stack">
      {activeProject ? (
        <ActiveProjectBar
          project={activeProject}
          description="This template flow is attached to the active project. Generated prompts, scripts, and outputs from this guided workflow will stay grouped there."
        />
      ) : null}
      <section className="rangmanch-floating-hero relative overflow-hidden rounded-[32px] p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="rangmanch-section-eyebrow">Template Studio</p>
            <h1 className="mt-3 font-heading text-4xl font-extrabold tracking-tight text-text sm:text-5xl">Answer a few questions. We&apos;ll build the prompt for you.</h1>
            <p className="mt-3 max-w-2xl text-base text-muted">Hero templates are guided creation workflows. Pick an outcome, fill a few structured inputs, review the assembled prompt or script, and generate with the recommended model already chosen for you.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.44)] px-4 py-3 text-sm text-muted">No complex prompt writing needed.</div>
            <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.44)] px-4 py-3 text-sm text-muted">Recommended model included. You can still override it.</div>
          </div>
        </div>
      </section>

      <section className="rangmanch-filter-bar flex flex-col gap-3 rounded-[24px] p-4 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex items-center gap-2 text-sm text-muted"><Filter className="h-4 w-4" />Filter templates</div>
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by outcome or niche" className="sm:max-w-xs" />
        <div className="flex flex-wrap gap-3">
          <Button variant={typeFilter === 'all' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('all')}>All</Button>
          <Button variant={typeFilter === 'video' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('video')}><Clapperboard className="mr-2 h-4 w-4" />Video</Button>
          <Button variant={typeFilter === 'image' ? 'primary' : 'secondary'} onClick={() => setTypeFilter('image')}><ImageIcon className="mr-2 h-4 w-4" />Image</Button>
        </div>
      </section>

      {loading ? (
        <div className="rangmanch-inline-status inline-flex items-center gap-3 rounded-full px-3 py-1.5 text-sm text-muted">
          <Spinner />
          Loading templates...
        </div>
      ) : null}
      {error ? <div className="rounded-[24px] border border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">{error}</div> : null}
      {!loading && !error ? (
        <div className="space-y-10">
          {renderSection('Trending Templates', trendingTemplates)}
          {Object.entries(groupedTemplates).map(([group, items]) => renderSection(GROUP_LABELS[group] || group, items))}
        </div>
      ) : null}

      <Modal open={Boolean(selectedTemplate)} onClose={() => setSelectedTemplate(null)}>
        {selectedTemplate ? (
          <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.48)] sm:rounded-[28px]">
                <img src={selectedTemplate.preview_image_url || selectedTemplate.thumbnail_url} alt={selectedTemplate.name} className="aspect-[4/5] w-full object-cover" />
              </div>
              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.44)] p-3.5 sm:rounded-[24px] sm:p-4">
                <div className="flex flex-wrap gap-2">
                  <Badge>{selectedTemplate.type === 'video' ? 'Video' : 'Image'}</Badge>
                  {selectedTemplate.badge ? <Badge>{selectedTemplate.badge}</Badge> : null}
                  {selectedTemplate.trending ? <Badge>Trending</Badge> : null}
                  {selectedTemplate.featured || selectedTemplate.is_featured ? <Badge>Featured</Badge> : null}
                </div>
                <h3 className="mt-3 text-2xl font-bold text-text">{selectedTemplate.title || selectedTemplate.name}</h3>
                <p className="mt-2 text-sm text-muted">{selectedTemplate.description}</p>
                <div className="mt-4 flex items-start gap-3 rounded-[16px] border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.5)] px-3 py-2.5 text-sm text-muted sm:rounded-[20px] sm:px-4 sm:py-3">
                  <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--color-accent))]" />
                  <div>
                    <p className="font-medium text-text">Guided workflow</p>
                    <p className="mt-1">We assemble the master prompt, scene structure, and model recommendation from your inputs. You can still edit everything before generating.</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1.5">
                  <label className="text-sm font-medium text-text">Project</label>
                  <Dropdown value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                    <option value="">Auto-create project for this guided workflow</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </Dropdown>
                  <p className="text-xs text-muted">
                    Hero templates can quietly create a project so prompts, scripts, and final outputs stay organized together.
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] p-4 sm:rounded-[24px] sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Template inputs</p>
                    <p className="mt-1 text-sm text-muted">Answer a few questions. We&apos;ll build the prompt for you.</p>
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
              </div>

              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] p-4 sm:rounded-[24px] sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Recommended model</p>
                    <p className="mt-1 text-sm text-muted">We pick the default model based on the outcome. Override only if you know why.</p>
                  </div>
                  {preview?.recommendedModel?.group ? <Badge>{preview.recommendedModel.group}</Badge> : null}
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="rounded-[20px] border border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-surface)/0.52)] px-4 py-3">
                    <p className="text-sm font-semibold text-text">{preview?.recommendedModel?.label || selectedTemplate.recommended_model?.label || 'Recommended model'}</p>
                    <p className="mt-1 text-sm text-muted">{preview?.recommendedModel?.description || selectedTemplate.recommended_model?.description || 'Model guidance is unavailable for this template.'}</p>
                  </div>
                  <Input value={modelOverride} onChange={(e) => setModelOverride(e.target.value)} placeholder="Optional model override" className="sm:w-56" />
                </div>
              </div>

              <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-text"><Eye className="h-4 w-4" />Generated prompt preview</div>
                <p className="mt-1 text-sm text-muted">Advanced users can edit the assembled prompt or script before generating.</p>
                {previewLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-muted"><Spinner /> Building preview...</div> : null}
                <div className="mt-4 space-y-3">
                  {selectedTemplate.type === 'video' ? (
                    <Textarea value={promptOverride || preview?.videoPrompt || preview?.scriptPreview || preview?.prompt || ''} onChange={(e) => setPromptOverride(e.target.value)} placeholder="Generated script / prompt preview" className="min-h-[180px]" />
                  ) : (
                    <Textarea value={promptOverride || preview?.imagePrompt || preview?.prompt || ''} onChange={(e) => setPromptOverride(e.target.value)} placeholder="Generated image prompt preview" className="min-h-[180px]" />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={() => void handleGenerate()} disabled={generating || previewLoading}>
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

              {generatedResult ? (
                <div className="rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.46)] p-4">
                  <p className="text-sm font-semibold text-text">Latest result</p>
                  <p className="mt-1 text-sm text-muted">Status: {generatedResult.status} · Credits used: {generatedResult.appliedCredits}</p>
                  {generatedResult.imageUrl ? <img src={generatedResult.imageUrl} alt="Generated template result" className="mt-3 aspect-[4/5] w-full rounded-[20px] object-cover" /> : null}
                  {generatedResult.videoUrl ? <div className="mt-3 rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] p-4 text-sm text-muted">Video queued. Open the video studio or your library to monitor progress.</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
