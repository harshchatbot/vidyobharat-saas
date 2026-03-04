import Link from 'next/link';

type PublicPageCtaProps = {
  title?: string;
  subtitle?: string;
};

export function PublicPageCta({
  title = 'Start creating with RangManch AI',
  subtitle = 'Generate image and video outputs with one clean creator workflow.',
}: PublicPageCtaProps) {
  return (
    <section className="mt-14 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))] p-6 shadow-[var(--shadow-soft)] sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-[hsl(var(--color-text))] sm:text-3xl">{title}</h2>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))] sm:text-base">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/signup"
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]"
          >
            Start Free
          </Link>
          <Link
            href="/pricing"
            className="inline-flex min-h-11 items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-text))]"
          >
            View Pricing
          </Link>
        </div>
      </div>
    </section>
  );
}

