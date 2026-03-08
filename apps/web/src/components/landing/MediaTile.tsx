import Link from 'next/link';
import type { ReactNode } from 'react';

import { ArrowUpRight } from 'lucide-react';

import { GlassPanel } from '@/components/landing/GlassPanel';
import { LandingVideo } from '@/components/landing/LandingVideo';

type Props = {
  title: string;
  description: string;
  eyebrow?: string;
  href?: string;
  mediaSrc?: string;
  poster?: string;
  imageSrc?: string;
  badge?: string;
  meta?: string;
  icon?: ReactNode;
  className?: string;
};

export function MediaTile({
  title,
  description,
  eyebrow,
  href,
  mediaSrc,
  poster,
  imageSrc,
  badge,
  meta,
  icon,
  className = '',
}: Props) {
  const content = (
    <GlassPanel
      variant="soft"
      className={`rangmanch-media-hover group overflow-hidden p-3 ${className}`.trim()}
    >
      <div className="relative overflow-hidden rounded-[calc(var(--radius-xl)-0.35rem)]">
        {mediaSrc ? (
          <LandingVideo src={mediaSrc} poster={poster} className="h-48 w-full object-cover sm:h-56" />
        ) : imageSrc ? (
          <img src={imageSrc} alt={title} className="h-48 w-full object-cover sm:h-56" />
        ) : (
          <div className="h-48 w-full bg-[linear-gradient(135deg,hsl(var(--color-hero-glow)/0.24),hsl(var(--color-accent)/0.18),transparent)] sm:h-56" />
        )}
        <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.92),transparent_50%)]" />
        {badge ? (
          <span className="absolute left-3 top-3 inline-flex rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.48)] px-2.5 py-1 text-[11px] font-semibold text-text backdrop-blur-md">
            {badge}
          </span>
        ) : null}
      </div>
      <div className="space-y-2 px-1 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            {eyebrow ? <p className="rangmanch-section-eyebrow">{eyebrow}</p> : null}
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-text">{title}</h3>
          </div>
          {icon ? <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.42)] text-text">{icon}</span> : null}
        </div>
        <p className="text-sm leading-6 text-muted">{description}</p>
        {meta ? <p className="text-xs uppercase tracking-[0.16em] text-muted">{meta}</p> : null}
      </div>
    </GlassPanel>
  );

  if (!href) return content;

  return (
    <Link href={href} className="block">
      <div className="relative">
        {content}
        <span className="pointer-events-none absolute right-5 top-5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.5)] text-text opacity-0 transition group-hover:opacity-100">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </div>
    </Link>
  );
}
