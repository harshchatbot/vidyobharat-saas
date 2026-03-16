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
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[hsl(var(--color-bg)/0.7)] px-4 py-6 backdrop-blur-md sm:px-6">
      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative w-full max-w-lg rounded-[22px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-elevated)/0.86)] p-5 shadow-[var(--shadow-hard)] sm:p-6"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-accent)/0.14)]">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-[hsl(var(--color-accent)/0.28)] border-t-[hsl(var(--color-accent))]" />
          </span>
          <div className="min-w-0">
            {accentLabel ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--color-accent))]">{accentLabel}</p>
            ) : null}
            <h2 className="text-base font-semibold text-text sm:text-lg">{title}</h2>
          </div>
        </div>

        {description ? <p className="mt-3 text-xs leading-5 text-muted">{description}</p> : null}
        {stepLabel ? <p className="mt-2 text-[11px] font-medium text-muted">{stepLabel}</p> : null}

        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-border)/0.8)]">
          {normalizedProgress !== null ? (
            <span
              className="block h-full rounded-full bg-[hsl(var(--color-accent))] transition-all duration-300"
              style={{ width: `${normalizedProgress}%` }}
            />
          ) : (
            <span className="block h-full w-2/5 rounded-full bg-[hsl(var(--color-accent))] animate-pulse" />
          )}
        </div>
        {normalizedProgress !== null ? <p className="mt-2 text-[11px] text-muted">{normalizedProgress}% complete</p> : null}
      </div>
    </div>
  );
}
