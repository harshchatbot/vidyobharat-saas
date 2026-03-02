import Link from 'next/link';

import { Card } from '@/components/ui/Card';

type InfoPageProps = {
  title: string;
  subtitle: string;
  bullets: string[];
};

export function InfoPage({ title, subtitle, bullets }: InfoPageProps) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 py-4 sm:py-8">
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-[hsl(var(--color-text))] sm:text-5xl">{title}</h1>
        <p className="max-w-3xl text-base leading-relaxed text-[hsl(var(--color-muted))] sm:text-lg">{subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {bullets.map((item) => (
          <Card key={item} className="rounded-[var(--radius-lg)] border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
            <p className="text-sm text-[hsl(var(--color-text))]">{item}</p>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 pt-2">
        <Link href="/signup" className="rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]">
          Get Started
        </Link>
        <Link href="/projects" className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]">
          Open Studio
        </Link>
      </div>
    </div>
  );
}
