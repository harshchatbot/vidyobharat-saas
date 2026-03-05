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
      <Card className="overflow-hidden border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))] p-0 shadow-soft">
        <summary className="relative flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-[18px] marker:content-none sm:px-5 sm:py-5">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--color-accent)/0.55),transparent)]" />
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-accent)/0.22)] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.18),hsl(var(--color-accent)/0.08))] text-[hsl(var(--color-accent))] shadow-[0_12px_32px_hsl(var(--color-accent)/0.08)]">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="font-heading text-[1.03rem] font-extrabold tracking-tight text-text sm:text-[1.12rem]">{title}</h2>
              <p className="mt-1.5 text-xs leading-5 text-muted sm:text-sm">{description}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {action}
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-[hsl(var(--color-bg)/0.8)] text-text transition group-open:rotate-180">
              <ChevronDown className="h-4 w-4" />
            </span>
          </div>
        </summary>
        <div className="border-t border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.7),hsl(var(--color-bg)/0.35))] px-4 py-[18px] sm:px-5 sm:py-5">{children}</div>
      </Card>
    </details>
  );
}
