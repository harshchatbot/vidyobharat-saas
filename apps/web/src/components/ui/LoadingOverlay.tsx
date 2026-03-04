import { Sparkles } from 'lucide-react';

export function LoadingOverlay({
  open,
  title,
  description,
  stepLabel,
  accentLabel,
}: {
  open: boolean;
  title: string;
  description: string;
  stepLabel?: string;
  accentLabel?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[hsl(var(--color-bg)/0.68)] px-4 py-6 backdrop-blur-lg sm:px-6">
      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative flex w-full max-w-xl flex-col items-center justify-center rounded-[28px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.66)] px-6 py-10 text-center shadow-[var(--shadow-soft)] sm:px-8"
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-48 -translate-y-1/2 rounded-full bg-[hsl(var(--color-accent)/0.08)] blur-3xl rangmanch-loader-glow" />

        <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
          <div className="absolute h-full w-full rounded-full border border-[hsl(var(--color-border))]" />
          <div className="absolute h-full w-full rounded-full border-2 border-transparent border-t-[hsl(var(--color-accent))] rangmanch-loader-ring" />
          <div className="h-10 w-10 rounded-full bg-[hsl(var(--color-accent)/0.18)] ring-1 ring-[hsl(var(--color-accent)/0.36)]" />
        </div>

        <div className="relative mt-6 w-full max-w-sm space-y-3 sm:mt-7">
          {accentLabel ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.72)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              {accentLabel}
            </div>
          ) : null}

          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-[1.95rem]">
              {title}
            </h2>
            {description ? (
              <p className="mx-auto max-w-md text-sm leading-6 text-muted sm:text-[15px]">{description}</p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <p className="rangmanch-loader-letters text-[11px] font-semibold uppercase text-muted">
              Loading
            </p>
            <p className="text-sm font-semibold text-text">{stepLabel ?? 'Working on your request'}</p>
          </div>

          <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-border))]">
            <span className="rangmanch-loader-bar block h-full w-2/5 rounded-full bg-[hsl(var(--color-accent))]" />
          </div>
        </div>
      </div>
    </div>
  );
}
