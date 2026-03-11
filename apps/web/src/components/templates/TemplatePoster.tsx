import { Badge } from '@/components/ui/Badge';
import type { Template } from '@/types/api';

export function TemplatePoster({ template, onClick }: { template: Template; onClick: () => void }) {
  const preview = template.preview_image_url || template.thumbnail_url;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.65)] bg-[hsl(var(--color-surface)/0.45)] text-left shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--color-accent)/0.35)] hover:shadow-[var(--shadow-hard)]"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[hsl(var(--color-elevated))]">
        <img src={preview} alt={template.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--color-bg)/0.92)] via-[hsl(var(--color-bg)/0.08)] to-transparent" />
        <div className="absolute left-4 top-4 flex flex-wrap gap-2">
          <Badge>{template.type === 'video' ? 'Video' : 'Image'}</Badge>
          {template.badge ? <Badge>{template.badge}</Badge> : null}
          {template.trending ? <Badge>Trending</Badge> : null}
          {template.featured || template.is_featured ? <Badge>Featured</Badge> : null}
          {template.is_quick_start ? <Badge>Quick Start</Badge> : null}
        </div>
        <div className="absolute inset-x-4 bottom-4">
          <p className="text-lg font-semibold text-white drop-shadow-sm">{template.name}</p>
          <p className="mt-1 line-clamp-2 text-sm text-white/76">{template.short_description || template.description}</p>
        </div>
      </div>
    </button>
  );
}
