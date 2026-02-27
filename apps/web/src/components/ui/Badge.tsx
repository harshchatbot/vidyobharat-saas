import { PropsWithChildren } from 'react';

export function Badge({ children }: PropsWithChildren) {
  return <span className="inline-flex rounded-full bg-elevated px-2 py-1 text-xs font-medium text-muted">{children}</span>;
}
