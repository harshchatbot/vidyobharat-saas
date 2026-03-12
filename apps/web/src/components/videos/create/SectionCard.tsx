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
      <Card className="overflow-hidden border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.34)] p-0 shadow-soft backdrop-blur-md">
        <summary className="relative flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3.5 marker:content-none sm:px-4.5 sm:py-3.5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--color-accent)/0.55),transparent)]" />
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-accent)/0.18)] bg-[hsl(var(--color-accent)/0.1)] text-[hsl(var(--color-accent))]">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-[0.98rem] font-extrabold tracking-tight text-text sm:text-[1.02rem]">{title}</h2>
              <p className="mt-1 text-xs leading-5 text-muted">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {action}
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-[hsl(var(--color-bg)/0.7)] text-text transition group-open:rotate-180">
              <ChevronDown className="h-4 w-4" />
            </span>
          </div>
        </summary>
        <div className="border-t border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.34)] px-4 py-4 sm:px-4.5 sm:py-4">{children}</div>
      </Card>
    </details>
  );
}
