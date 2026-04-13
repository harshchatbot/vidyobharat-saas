import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[hsl(var(--color-bg))] px-6 py-12 text-text">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] bg-[hsl(var(--color-surface))] p-8 text-center shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.3)]">
        <p className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted">Not found</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text">This page does not exist</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          The page may have moved, or the link might be outdated. You can head back to the studio and continue from there.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/create"
            className="inline-flex items-center rounded-full bg-[hsl(var(--color-accent))] px-5 py-2.5 text-sm font-medium text-[hsl(var(--color-accent-contrast))] transition hover:opacity-95"
          >
            Go to create
          </Link>
        </div>
      </div>
    </div>
  );
}
