import { LoaderCircle, Sparkles } from 'lucide-react';

import { Spinner } from '@/components/ui/Spinner';

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
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[hsl(var(--color-bg)/0.76)] px-4 py-6 backdrop-blur-md sm:px-6">
      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative w-full max-w-md overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(160deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))] p-6 shadow-hard sm:p-7"
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-24 rounded-full bg-[hsl(var(--color-accent)/0.16)] blur-3xl" />

        <div className="relative space-y-5">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.92)] text-[hsl(var(--color-accent))] shadow-soft">
              <LoaderCircle className="h-5 w-5 animate-spin" />
            </span>
            {accentLabel ? (
              <span className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">
                <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                {accentLabel}
              </span>
            ) : null}
          </div>

          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text sm:text-[1.75rem]">
              {title}
            </h2>
            <p className="text-sm leading-6 text-muted sm:text-[15px]">{description}</p>
          </div>

          <div className="overflow-hidden rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.82)] p-1">
            <div className="h-2.5 w-full rounded-full bg-[linear-gradient(90deg,hsl(var(--color-accent)/0.3),hsl(var(--color-accent)),hsl(var(--color-accent)/0.3))] bg-[length:200%_100%] animate-pulse" />
          </div>

          <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.78)] p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Current Step</p>
              <p className="mt-1 text-sm font-semibold text-text">{stepLabel ?? 'Working on your request'}</p>
            </div>
            <div className="inline-flex items-center gap-3 self-start rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 sm:self-auto">
              <Spinner className="h-5 w-5 border-[3px]" />
              <span className="text-sm font-semibold text-text">Please wait</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
