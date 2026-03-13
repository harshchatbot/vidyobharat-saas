import { Search } from 'lucide-react';

import { Input } from '@/components/ui/Input';

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
    eyebrow: 'Blank canvas',
    helper: 'Manual start',
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
  search,
  onSearchChange,
  templates,
  selectedTemplate,
  onSelect,
}: {
  search: string;
  onSearchChange: (value: string) => void;
  templates: TemplateOption[];
  selectedTemplate: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="space-y-3.5">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
        <div>
          <p className="text-sm font-semibold text-text">Content direction</p>
          <p className="mt-1 text-sm text-muted">Pick a guided workflow or stay on a blank canvas.</p>
        </div>
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
            <Search className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Search templates
          </span>
          <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search by category or use case" />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {templates.map((template) => {
          const Icon = template.icon;
          const active = selectedTemplate === template.key;
          const visual = TEMPLATE_VISUALS[template.key] ?? TEMPLATE_VISUALS.custom;
          const image = template.image ?? visual.image;
          const eyebrow = template.eyebrow ?? visual.eyebrow;
          const helper = template.helper ?? visual.helper;
          return (
            <button
              key={template.key}
              type="button"
              onClick={() => onSelect(template.key)}
              className={`group overflow-hidden rounded-[24px] border text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)] shadow-soft'
                  : 'border-border bg-bg hover:border-[hsl(var(--color-accent)/0.35)] hover:shadow-soft'
              }`}
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
                <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.5)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
                  {template.badge || 'Hint'}
                </div>
                <p className="line-clamp-2 text-xs text-muted">{template.topicHint}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
