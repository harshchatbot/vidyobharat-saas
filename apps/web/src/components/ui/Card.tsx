import { PropsWithChildren } from 'react';

export function Card({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`rounded-lg border border-border bg-surface p-5 shadow-soft ${className}`}>{children}</div>;
}
