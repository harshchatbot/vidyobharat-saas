import type { PropsWithChildren, ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

import { Card } from '@/components/ui/Card';

export function SectionCard({
  title,
  description,
  icon,
  children,
  defaultOpen = true,
  action,
}: PropsWithChildren<{
  title: string;
  description: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
}>) {
  return (
    <details open={defaultOpen} className="group">
      <Card className="overflow-hidden p-0">
        <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-5 py-4 marker:content-none sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-lg font-extrabold tracking-tight text-text">{title}</h2>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {action}
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg text-text transition group-open:rotate-180">
              <ChevronDown className="h-4 w-4" />
            </span>
          </div>
        </summary>
        <div className="border-t border-border px-5 py-5 sm:px-6">{children}</div>
      </Card>
    </details>
  );
}
