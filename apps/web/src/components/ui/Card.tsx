import { HTMLAttributes, PropsWithChildren } from 'react';

export function Card({
  children,
  className = '',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div
      className={`relative overflow-hidden rounded-[var(--radius-xl)] bg-surface p-5 shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.3)] after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:shadow-[inset_0_1px_1px_hsl(var(--color-surface-glass)/0.5)] sm:p-6 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
