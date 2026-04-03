type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  centered?: boolean;
};

const sizeClasses = {
  sm: {
    shell: 'h-10 w-10',
    ring: 'h-10 w-10 border-[2px]',
    core: 'h-4 w-4',
    label: 'text-xs',
  },
  md: {
    shell: 'h-14 w-14',
    ring: 'h-14 w-14 border-[2.5px]',
    core: 'h-5 w-5',
    label: 'text-sm',
  },
  lg: {
    shell: 'h-16 w-16',
    ring: 'h-16 w-16 border-[3px]',
    core: 'h-6 w-6',
    label: 'text-sm',
  },
} as const;

export function PacmanLoader({
  label = 'Loading',
  size = 'md',
  className = '',
  centered = false,
}: Props) {
  const config = sizeClasses[size];

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={`${centered ? 'flex min-h-[140px] w-full items-center justify-center' : ''} ${className}`.trim()}
    >
      <div className="flex flex-col items-center justify-center gap-3">
        <div className={`relative flex items-center justify-center ${config.shell}`} aria-hidden="true">
          <span className={`absolute rounded-full border-[hsl(var(--color-accent)/0.22)] ${config.ring}`} />
          <span className={`absolute rounded-full border-t-[hsl(var(--color-accent))] border-r-[hsl(var(--color-accent)/0.55)] border-b-transparent border-l-transparent rangmanch-loader-ring ${config.ring}`} />
          <span className={`absolute rounded-full bg-[radial-gradient(circle,hsl(var(--color-accent)/0.28),transparent_70%)] rangmanch-loader-glow ${config.shell}`} />
          <span className={`relative rounded-full bg-[hsl(var(--color-surface))] shadow-[0_10px_30px_hsl(var(--color-accent)/0.14)] ${config.core}`} />
        </div>
        {label ? (
          <>
            <span className="sr-only">{label}</span>
            <p className={`${config.label} font-medium tracking-[0.08em] text-[hsl(var(--color-muted))]`}>{label}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
