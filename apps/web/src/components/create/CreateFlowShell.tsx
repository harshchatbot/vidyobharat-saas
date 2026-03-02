'use client';

import Link from 'next/link';

import { createFlowSteps } from '@/components/create/types';
import { Card } from '@/components/ui/Card';

type Props = {
  step: 1 | 2 | 3 | 4 | 5;
  title: string;
  subtitle: string;
  children: React.ReactNode;
};

export function CreateFlowShell({ step, title, subtitle, children }: Props) {
  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Video Builder</p>
        <p className="mt-1 text-sm font-semibold text-text">Step {step} of 5</p>
        <div className="mt-4 grid gap-2">
          {createFlowSteps.map((item, index) => {
            const active = index + 1 === step;
            return (
              <Link
                key={item.key}
                href={item.href}
                className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm transition ${
                  active
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.14)] text-text'
                    : 'border-border bg-bg text-muted hover:text-text'
                }`}
              >
                {index + 1}. {item.label}
              </Link>
            );
          })}
        </div>
      </Card>

      <Card>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text">{title}</h1>
        <p className="mt-1 text-sm text-muted">{subtitle}</p>
        <div className="mt-6">{children}</div>
      </Card>
    </div>
  );
}
