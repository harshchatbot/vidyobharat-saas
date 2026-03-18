type Props = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  centered?: boolean;
};

const sizeClasses = {
  sm: {
    wrap: 'gap-2',
    pacman: 'h-5 w-5',
    dot: 'h-2 w-2',
    label: 'text-xs',
  },
  md: {
    wrap: 'gap-3',
    pacman: 'h-8 w-8',
    dot: 'h-2.5 w-2.5',
    label: 'text-sm',
  },
  lg: {
    wrap: 'gap-4',
    pacman: 'h-10 w-10',
    dot: 'h-3 w-3',
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
        <div className={`flex items-center ${config.wrap}`}>
          <div className={`rangmanch-pacman ${config.pacman}`} aria-hidden="true" />
          <div className="relative flex items-center gap-2" aria-hidden="true">
            <span className={`rangmanch-pacman-dot ${config.dot}`} style={{ animationDelay: '0s' }} />
            <span className={`rangmanch-pacman-dot ${config.dot}`} style={{ animationDelay: '0.18s' }} />
            <span className={`rangmanch-pacman-dot ${config.dot}`} style={{ animationDelay: '0.36s' }} />
          </div>
        </div>
        {label ? (
          <>
            <span className="sr-only">{label}</span>
            <p className={`${config.label} font-medium text-[hsl(var(--color-muted))]`}>{label}</p>
          </>
        ) : null}
      </div>
    </div>
  );
}
