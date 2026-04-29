import Link from 'next/link';

export default function ComponentPreviewsPage() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <div className="space-y-3">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-accent">Component previews</p>
        <h1 className="font-heading text-4xl font-extrabold tracking-tight text-text">UI preview routes</h1>
        <p className="max-w-2xl text-sm leading-7 text-muted">
          Safe, public preview pages for newly integrated UI components. These do not affect the main product flows.
        </p>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link
          href="/component-previews/sign-in"
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-soft transition hover:-translate-y-0.5"
        >
          <div className="text-lg font-semibold text-text">Sign-in preview</div>
          <div className="mt-2 text-sm text-muted">Preview the integrated sign-in shell component.</div>
        </Link>
        <Link
          href="/component-previews/hero-3"
          className="rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-soft transition hover:-translate-y-0.5"
        >
          <div className="text-lg font-semibold text-text">Hero marquee preview</div>
          <div className="mt-2 text-sm text-muted">Preview the animated hero component with unique marquee images.</div>
        </Link>
      </div>
    </main>
  );
}
