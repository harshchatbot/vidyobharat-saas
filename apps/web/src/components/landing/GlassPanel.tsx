import type { HTMLAttributes, PropsWithChildren } from 'react';

type Props = PropsWithChildren<
  HTMLAttributes<HTMLDivElement> & {
    variant?: 'soft' | 'strong' | 'matte';
  }
>;

export function GlassPanel({ children, className = '', variant = 'soft', ...props }: Props) {
  const surfaceClass =
    variant === 'strong'
      ? 'rangmanch-glass-strong'
      : variant === 'matte'
        ? 'rangmanch-matte-surface'
        : 'rangmanch-glass';

  return (
    <div className={`${surfaceClass} rounded-[var(--radius-xl)] ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}
