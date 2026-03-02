import Link from 'next/link';

export function FinalCta() {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-soft sm:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">
            Ready to create your first video?
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
            Start free, choose your template, and publish within minutes.
          </p>
        </div>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-5 py-3 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]"
        >
          Start Creating for Free
        </Link>
      </div>
    </section>
  );
}
