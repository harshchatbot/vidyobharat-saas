import { PropsWithChildren } from 'react';

export function Grid({ children, className = '' }: PropsWithChildren<{ className?: string }>) {
  return <div className={`grid gap-4 ${className}`}>{children}</div>;
}
