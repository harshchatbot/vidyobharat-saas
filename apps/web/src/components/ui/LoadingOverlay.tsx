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
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[hsl(var(--color-bg)/0.76)] px-4 py-6 backdrop-blur-lg sm:px-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_16%,hsl(var(--color-accent)/0.24),transparent_48%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-[linear-gradient(180deg,hsl(var(--color-text)/0.26),transparent)]" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-[linear-gradient(0deg,hsl(var(--color-text)/0.28),transparent)]" />
      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative flex w-full max-w-2xl flex-col items-center justify-center rounded-[34px] border border-[hsl(var(--color-border)/0.58)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.32),hsl(var(--color-elevated)/0.2))] px-5 py-7 text-center shadow-[var(--shadow-cinematic)] sm:px-8 sm:py-9"
      >
        <div className="pointer-events-none absolute inset-0 rounded-[34px] border border-[hsl(var(--color-accent)/0.16)]" />
        <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--color-accent)/0.62),transparent)]" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-56 -translate-y-1/2 rounded-full bg-[hsl(var(--color-accent)/0.12)] blur-3xl rangmanch-stage-glow" />

        <div className="relative flex h-[220px] w-full max-w-xl items-end justify-center overflow-hidden rounded-[26px] border border-[hsl(var(--color-border)/0.58)] bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.32),hsl(var(--color-text)/0.22))]">
          <div className="pointer-events-none absolute left-0 top-0 h-full w-1/2 bg-[linear-gradient(90deg,hsl(var(--color-accent)/0.16),transparent)] rangmanch-curtain-left" />
          <div className="pointer-events-none absolute right-0 top-0 h-full w-1/2 bg-[linear-gradient(270deg,hsl(var(--color-accent)/0.16),transparent)] rangmanch-curtain-right" />
          <div className="pointer-events-none absolute left-1/2 top-0 h-full w-[44%] -translate-x-1/2 bg-[linear-gradient(180deg,hsl(var(--color-accent)/0.34),transparent_65%)] rangmanch-spotlight" />
          <div className="pointer-events-none absolute bottom-3 h-16 w-[72%] rounded-[100%] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.4)] rangmanch-stage-floor" />
          <div className="pointer-events-none absolute bottom-8 left-1/2 h-20 w-6 -translate-x-1/2 rounded-full bg-[hsl(var(--color-accent)/0.5)] rangmanch-performer" />
          <div className="pointer-events-none absolute bottom-20 left-1/2 h-12 w-12 -translate-x-1/2 rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-accent)/0.26)] rangmanch-performer" />
          <div className="pointer-events-none absolute bottom-7 left-[24%] h-10 w-10 rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-accent)/0.16)] rangmanch-tabla-pulse" />
          <div className="pointer-events-none absolute bottom-7 right-[24%] h-10 w-10 rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-accent)/0.16)] rangmanch-tabla-pulse rangmanch-tabla-delay" />
        </div>

        <div className="relative mt-5 w-full max-w-xl space-y-3 sm:mt-6">
          {accentLabel ? (
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[hsl(var(--color-accent))]">
              {accentLabel}
            </p>
          ) : null}
          <div className="space-y-2">
            <h2 className="font-heading text-2xl font-semibold tracking-tight text-text sm:text-[1.9rem]">
              {title}
            </h2>
            {description ? <p className="mx-auto max-w-lg text-xs leading-6 text-muted">{description}</p> : null}
            {stepLabel ? <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{stepLabel}</p> : null}
          </div>

          <div className="mx-auto mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-border)/0.9)]">
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
            <p className="text-[11px] font-medium text-muted">
              {normalizedProgress}% complete
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
