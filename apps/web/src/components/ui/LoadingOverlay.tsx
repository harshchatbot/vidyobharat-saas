export function LoadingOverlay({
  open,
  title,
  description,
  stepLabel,
  accentLabel,
  progress,
}: {
  open: boolean;
  title: string;
  description: string;
  stepLabel?: string;
  accentLabel?: string;
  progress?: number;
}) {
  if (!open) return null;
  const normalizedProgress = typeof progress === 'number'
    ? Math.max(0, Math.min(100, Math.round(progress)))
    : null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[hsl(var(--color-bg)/0.68)] px-4 py-6 backdrop-blur-lg sm:px-6">
      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative flex w-full max-w-xl flex-col items-center justify-center rounded-[32px] border border-[hsl(var(--color-border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.72),hsl(var(--color-elevated)/0.82))] px-6 py-10 text-center shadow-[var(--shadow-soft)] sm:px-8"
      >
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-48 -translate-y-1/2 rounded-full bg-[hsl(var(--color-accent)/0.08)] blur-3xl rangmanch-loader-glow" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--color-accent)/0.55),transparent)]" />

        <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
          <div className="absolute h-full w-full rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.18)]" />
          <div className="absolute h-full w-full rounded-full border-2 border-transparent border-t-[hsl(var(--color-accent))] rangmanch-loader-ring" />
          <div className="absolute h-[72%] w-[72%] rounded-full border border-[hsl(var(--color-accent)/0.18)]" />
          <div className="h-10 w-10 rounded-full bg-[hsl(var(--color-accent)/0.18)] ring-1 ring-[hsl(var(--color-accent)/0.36)]" />
        </div>

        <div className="relative mt-6 w-full max-w-sm space-y-3 sm:mt-7">
          {accentLabel ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-accent))]">
              {accentLabel}
            </p>
          ) : null}
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-[1.95rem]">
              {title}
            </h2>
            {description ? <p className="text-sm leading-6 text-muted">{description}</p> : null}
            {stepLabel ? <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{stepLabel}</p> : null}
          </div>

          <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-border))]">
            {normalizedProgress !== null ? (
              <span
                className="block h-full rounded-full bg-[hsl(var(--color-accent))] transition-all duration-300"
                style={{ width: `${normalizedProgress}%` }}
              />
            ) : (
              <span className="rangmanch-loader-bar block h-full w-2/5 rounded-full bg-[hsl(var(--color-accent))]" />
            )}
          </div>
          {normalizedProgress !== null ? (
            <p className="text-xs font-medium text-muted">
              {normalizedProgress}% complete
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
