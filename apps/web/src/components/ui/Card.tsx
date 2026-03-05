import { HTMLAttributes, PropsWithChildren } from 'react';

export function Card({
  children,
  className = '',
  ...props
}: PropsWithChildren<HTMLAttributes<HTMLDivElement>>) {
  return (
    <div className={`rounded-[var(--radius-lg)] border border-border bg-surface p-5 shadow-soft ${className}`} {...props}>
      {children}
    </div>
  );
}
