import { Check, Film, Sparkles } from 'lucide-react';

import type { TemplateOption } from './constants';

const TEMPLATE_VISUALS: Record<
  string,
  {
    image?: string;
    eyebrow: string;
    helper: string;
    gradient: string;
  }
> = {
  custom: {
    eyebrow: 'Start from scratch',
    helper: 'Build your own flow',
    gradient: 'linear-gradient(135deg, hsl(var(--color-accent)/0.18), hsl(var(--color-elevated)))',
  },
  'music-video': {
    image: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Performance',
    helper: 'Beat-led cuts',
    gradient: 'linear-gradient(160deg, rgba(22,29,57,0.25), rgba(6,8,15,0.9))',
  },
  'explainer-video': {
    image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Explainer',
    helper: 'Clear narrative',
    gradient: 'linear-gradient(160deg, rgba(14,47,61,0.28), rgba(6,8,15,0.9))',
  },
  'character-vlog': {
    image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Persona',
    helper: 'Creator voice',
    gradient: 'linear-gradient(160deg, rgba(42,18,54,0.28), rgba(6,8,15,0.9))',
  },
  'asmr-video': {
    image: 'https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Ambient',
    helper: 'Slow pacing',
    gradient: 'linear-gradient(160deg, rgba(34,47,28,0.2), rgba(6,8,15,0.9))',
  },
  storyboard: {
    image: 'https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Planning',
    helper: 'Scene map',
    gradient: 'linear-gradient(160deg, rgba(53,35,18,0.2), rgba(6,8,15,0.92))',
  },
  history: {
    image: 'https://images.unsplash.com/photo-1461360370896-922624d12aa1?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'History',
    helper: 'Epic retelling',
    gradient: 'linear-gradient(160deg, rgba(66,40,18,0.22), rgba(6,8,15,0.92))',
  },
  mythology: {
    image: 'https://images.unsplash.com/photo-1518562180175-34a163b1a9a6?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Mythic',
    helper: 'Emotional lore',
    gradient: 'linear-gradient(160deg, rgba(65,23,71,0.24), rgba(6,8,15,0.92))',
  },
  tech: {
    image: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Tech',
    helper: 'Sharp product story',
    gradient: 'linear-gradient(160deg, rgba(18,47,71,0.25), rgba(6,8,15,0.92))',
  },
  startup: {
    image: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Startup',
    helper: 'Pitch angle',
    gradient: 'linear-gradient(160deg, rgba(25,63,43,0.25), rgba(6,8,15,0.92))',
  },
  product: {
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Product',
    helper: 'Commercial polish',
    gradient: 'linear-gradient(160deg, rgba(52,35,61,0.22), rgba(6,8,15,0.92))',
  },
  'real-estate': {
    image: 'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
    eyebrow: 'Property',
    helper: 'Listing reel',
    gradient: 'linear-gradient(160deg, rgba(42,42,22,0.22), rgba(6,8,15,0.92))',
  },
};

export function TemplateSelector({
  loading = false,
  templates,
  selectedTemplate,
  activeTemplateState,
  onSelect,
  onCustomize,
  applyingTemplateKey,
}: {
  loading?: boolean;
  templates: TemplateOption[];
  selectedTemplate: string;
  activeTemplateState?: 'ready' | 'customized' | null;
  onSelect: (value: string) => void;
  onCustomize: (value: string) => void;
  applyingTemplateKey?: string | null;
}) {
  const topTemplates = templates.slice(0, 6);
  const selectedInTop = topTemplates.some((template) => template.key === selectedTemplate);
  const selectedTemplateOption = templates.find((template) => template.key === selectedTemplate);
  const visibleTemplates = !selectedInTop && selectedTemplateOption
    ? [...topTemplates.slice(0, 5), selectedTemplateOption]
    : topTemplates;

  return (
    <div className="min-w-0">
      <div className="w-full overflow-x-auto overscroll-x-contain pb-2 [scrollbar-width:thin] touch-pan-x">
        <div className="inline-flex min-w-max gap-3 snap-x snap-mandatory pr-1">
        {loading
          ? Array.from({ length: 6 }).map((_, index) => (
              <div
                key={`template-skeleton-${index}`}
                className="w-[188px] shrink-0 snap-start overflow-hidden rounded-[22px] border border-border bg-[hsl(var(--color-surface)/0.42)] sm:w-[236px] lg:w-[244px] xl:w-[252px]"
              >
                <div className="aspect-[5/3] animate-pulse bg-[hsl(var(--color-elevated))]" />
                <div className="space-y-2 px-3.5 py-3">
                  <div className="h-3 w-24 animate-pulse rounded bg-[hsl(var(--color-elevated))]" />
                  <div className="h-3 w-36 animate-pulse rounded bg-[hsl(var(--color-elevated))]" />
                </div>
              </div>
            ))
          : null}
        {!loading && visibleTemplates.length === 0 ? (
          <div className="w-[260px] shrink-0 rounded-[22px] border border-border bg-[hsl(var(--color-surface)/0.36)] px-4 py-5 text-sm text-muted">
            Workflows are loading. Please wait a moment.
          </div>
        ) : null}
        {!loading ? visibleTemplates.map((template) => {
          const Icon = typeof template.icon === 'function' || (typeof template.icon === 'object' && template.icon !== null && '$$typeof' in template.icon)
            ? template.icon
            : Film;
          const active = selectedTemplate === template.key;
          const activeStateLabel =
            active && activeTemplateState === 'customized'
              ? 'Customized'
              : active && activeTemplateState === 'ready'
                ? 'Ready to generate'
                : null;
          const ActiveStateIcon = active && activeTemplateState === 'customized'
            ? Sparkles
            : active && activeTemplateState === 'ready'
              ? Check
              : null;
          const activeStateBadgeClass =
            active && activeTemplateState === 'customized'
              ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]'
              : active && activeTemplateState === 'ready'
                ? 'border-[hsl(var(--color-success)/0.3)] bg-[hsl(var(--color-success)/0.12)] text-[hsl(var(--color-success))]'
                : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] text-muted';
          const activeCardClass =
            active && activeTemplateState === 'customized'
              ? 'border-[hsl(var(--color-accent)/0.65)] bg-[hsl(var(--color-accent)/0.1)] shadow-soft'
              : active && activeTemplateState === 'ready'
                ? 'border-[hsl(var(--color-success)/0.58)] bg-[hsl(var(--color-success)/0.08)] shadow-soft'
                : active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)] shadow-soft'
                  : 'border-border bg-bg hover:border-[hsl(var(--color-accent)/0.35)] hover:shadow-soft';
          const visual = TEMPLATE_VISUALS[template.key] ?? TEMPLATE_VISUALS.custom;
          const image = template.image ?? visual.image;
          const eyebrow = template.eyebrow ?? visual.eyebrow;
          const helper = template.helper ?? visual.helper;
          return (
            <div
              key={template.key}
              role="button"
              tabIndex={0}
              aria-disabled={applyingTemplateKey === template.key}
              onClick={() => {
                if (applyingTemplateKey === template.key) return;
                onSelect(template.key);
              }}
              onKeyDown={(event) => {
                if (applyingTemplateKey === template.key) return;
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onSelect(template.key);
                }
              }}
              className={`group w-[188px] shrink-0 snap-start overflow-hidden rounded-[22px] border text-left transition sm:w-[236px] lg:w-[244px] xl:w-[252px] ${activeCardClass} ${applyingTemplateKey === template.key ? 'cursor-progress opacity-90' : 'cursor-pointer'}`}
            >
              <div className="relative aspect-[5/3] overflow-hidden bg-[hsl(var(--color-elevated))]">
                {image ? (
                  <img
                    src={image}
                    alt={template.label}
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                  />
                ) : null}
                <div
                  className="absolute inset-0"
                  style={{ background: visual.gradient }}
                />
                <div className="absolute left-3 top-3 flex items-center gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-bg)/0.74)] text-[hsl(var(--color-accent))] backdrop-blur-md">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/72">{eyebrow}</p>
                    <p className="text-xs font-semibold text-white">{helper}</p>
                  </div>
                </div>
                <div className="absolute inset-x-3 bottom-3">
                  <p className="font-heading text-lg font-extrabold tracking-tight text-white drop-shadow-sm">{template.label}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-white/76">{template.description}</p>
                </div>
              </div>
              <div className="space-y-1.5 px-3.5 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${activeStateBadgeClass}`}>
                    {ActiveStateIcon ? <ActiveStateIcon className="h-3 w-3" /> : null}
                    {activeStateLabel || template.badge || 'Best for'}
                  </div>
                  <div className="text-[11px] font-semibold text-[hsl(var(--color-accent))]">
                    {applyingTemplateKey === template.key ? 'Applying…' : 'Quick apply'}
                  </div>
                </div>
                <p className="line-clamp-2 text-xs text-muted">{template.topicHint}</p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-muted">
                    {activeStateLabel ? `${activeStateLabel} in studio` : 'Recommended settings already applied'}
                  </span>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onCustomize(template.key);
                    }}
                    className="rounded-full border border-[hsl(var(--color-border))] px-2.5 py-1 text-[11px] font-semibold text-text transition hover:border-[hsl(var(--color-accent))] hover:text-[hsl(var(--color-accent))]"
                  >
                    Customize
                  </button>
                </div>
              </div>
            </div>
          );
        }) : null}
        </div>
      </div>
    </div>
  );
}
