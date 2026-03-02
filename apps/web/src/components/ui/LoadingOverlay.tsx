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
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[hsl(var(--color-bg)/0.74)] px-4 py-6 backdrop-blur-xl sm:px-6">
      <svg className="absolute h-0 w-0" aria-hidden="true" focusable="false">
        <defs>
          <filter id="rangmanch-loader-goo">
            <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"
              result="goo"
            />
          </filter>
        </defs>
      </svg>

      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative flex w-full max-w-xl flex-col items-center justify-center text-center"
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-56 -translate-y-1/2 rounded-full bg-[hsl(var(--color-accent)/0.14)] blur-3xl rangmanch-loader-glow" />

        <div className="relative flex h-36 w-36 items-center justify-center sm:h-44 sm:w-44" style={{ filter: 'url(#rangmanch-loader-goo)' }}>
          <div className="rangmanch-loader-pulse absolute h-20 w-20 rounded-full bg-[hsl(var(--color-accent))] opacity-90 shadow-hard sm:h-24 sm:w-24" />
          <div className="rangmanch-loader-orbit-a absolute h-16 w-16 rounded-full bg-[hsl(var(--color-accent)/0.88)] sm:h-20 sm:w-20" />
          <div className="rangmanch-loader-orbit-b absolute h-14 w-14 rounded-full bg-[hsl(var(--color-text)/0.18)] sm:h-16 sm:w-16" />
          <div className="rangmanch-loader-orbit-c absolute h-12 w-12 rounded-full bg-[hsl(var(--color-surface))] sm:h-14 sm:w-14" />
        </div>

        <div className="relative mt-6 space-y-3 sm:mt-8">
          {accentLabel ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.78)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted shadow-soft">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              {accentLabel}
            </div>
          ) : null}

          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text sm:text-[2rem]">
              {title}
            </h2>
            <p className="mx-auto max-w-md text-sm leading-6 text-muted sm:text-[15px]">{description}</p>
          </div>

          <div className="space-y-1.5">
            <p className="rangmanch-loader-letters text-[11px] font-semibold uppercase text-muted">
              Loading
            </p>
            <p className="text-sm font-semibold text-text">{stepLabel ?? 'Working on your request'}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
