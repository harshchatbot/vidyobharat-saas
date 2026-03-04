import type { ReactNode } from 'react';

import { PublicPageCta } from '@/components/landing/PublicPageCta';

type PublicPageStat = {
  label: string;
  value: string;
};

type PublicPageTemplateProps = {
  title: string;
  subtitle: string;
  stats: PublicPageStat[];
  children: ReactNode;
  ctaTitle?: string;
  ctaSubtitle?: string;
};

export function PublicPageTemplate({
  title,
  subtitle,
  stats,
  children,
  ctaTitle,
  ctaSubtitle,
}: PublicPageTemplateProps) {
  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">{title}</h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">{subtitle}</p>
        </div>

        <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <article
              key={`${stat.label}-${stat.value}`}
              className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3 shadow-[var(--shadow-soft)]"
            >
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-muted))]">
                {stat.label}
              </p>
              <p className="mt-1 text-lg font-semibold text-[hsl(var(--color-text))]">{stat.value}</p>
            </article>
          ))}
        </section>

        <section className="mt-16">{children}</section>

        <PublicPageCta title={ctaTitle} subtitle={ctaSubtitle} />
      </div>
    </main>
  );
}

