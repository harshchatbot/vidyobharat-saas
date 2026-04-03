import { PacmanLoader } from '@/components/ui/PacmanLoader';

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
    <div className="fixed inset-0 z-[90] flex items-center justify-center overflow-hidden bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.84),hsl(var(--color-bg)/0.72))] px-4 py-6 backdrop-blur-xl sm:px-6">
      <div
        aria-busy="true"
        aria-live="polite"
        role="status"
        className="relative w-full max-w-md rounded-[28px] border border-[hsl(var(--color-border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--color-elevated)/0.96),hsl(var(--color-surface)/0.94))] p-6 shadow-[var(--shadow-hard)] sm:p-7"
      >
        <div className="flex flex-col items-center text-center">
          <PacmanLoader size="lg" label="" />
          <div className="mt-5 min-w-0">
            {accentLabel ? (
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">{accentLabel}</p>
            ) : null}
            <h2 className="text-base font-semibold text-text sm:text-lg">{title}</h2>
          </div>
        </div>

        {description ? <p className="mt-3 text-center text-sm leading-6 text-muted">{description}</p> : null}
        {stepLabel ? <p className="mt-2 text-center text-[11px] font-medium uppercase tracking-[0.12em] text-muted">{stepLabel}</p> : null}

        <div className="mt-5 h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--color-border)/0.85)]">
          {normalizedProgress !== null ? (
            <span
              className="block h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--color-accent)/0.78),hsl(var(--color-accent)))] transition-all duration-300"
              style={{ width: `${normalizedProgress}%` }}
            />
          ) : (
            <span className="rangmanch-loader-bar block h-full w-2/5 rounded-full bg-[linear-gradient(90deg,hsl(var(--color-accent)/0.25),hsl(var(--color-accent)),hsl(var(--color-accent)/0.25))]" />
          )}
        </div>
        {normalizedProgress !== null ? <p className="mt-2 text-center text-[11px] text-muted">{normalizedProgress}% complete</p> : null}
      </div>
    </div>
  );
}
