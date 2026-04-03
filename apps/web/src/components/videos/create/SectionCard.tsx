import type { PropsWithChildren, ReactNode } from 'react';

import { ChevronDown } from 'lucide-react';

export function SectionCard({
  title,
  description,
  icon,
  children,
  defaultOpen = true,
  action,
  compact = false,
}: PropsWithChildren<{
  title: string;
  description?: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
  compact?: boolean;
}>) {
  if (compact) {
    return (
      <details open={defaultOpen} className="group border-b border-[hsl(var(--color-border)/0.5)] py-1 last:border-b-0">
        <summary className="relative flex cursor-pointer list-none items-start justify-between gap-3 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center text-[hsl(var(--color-accent))]">
              {icon}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-text">{title}</h2>
              {description ? <p className="mt-0.5 text-[11px] text-muted">{description}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {action}
            <span className="inline-flex h-5 w-5 items-center justify-center text-muted transition group-open:rotate-180">
              <ChevronDown className="h-3.5 w-3.5" />
            </span>
          </div>
        </summary>
        <div className="pb-4 pl-7">{children}</div>
      </details>
    );
  }

  return (
    <details open={defaultOpen} className="group overflow-hidden rounded-[20px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-elevated)/0.22)] shadow-soft backdrop-blur-md">
      <summary className="relative flex cursor-pointer list-none items-start justify-between gap-3 px-4 py-3 marker:content-none sm:px-4.5 sm:py-3 [&::-webkit-details-marker]:hidden">
        <div className="flex min-w-0 items-start gap-3">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-accent)/0.12)] bg-[hsl(var(--color-accent)/0.08)] text-[hsl(var(--color-accent))]">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="font-heading text-[0.96rem] font-extrabold tracking-tight text-text sm:text-[1rem]">{title}</h2>
            {description ? <p className="mt-0.5 text-[11px] leading-5 text-muted">{description}</p> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {action}
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-[hsl(var(--color-bg)/0.7)] text-text transition group-open:rotate-180">
            <ChevronDown className="h-4 w-4" />
          </span>
        </div>
      </summary>
      <div className="border-t border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.2)] px-4 py-3.5 sm:px-4.5 sm:py-3.5">{children}</div>
    </details>
  );
}
