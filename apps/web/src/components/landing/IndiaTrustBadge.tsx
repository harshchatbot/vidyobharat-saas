import { ShieldCheck } from 'lucide-react';

export function IndiaTrustBadge() {
  return (
    <div className="mx-auto w-fit rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 shadow-soft">
      <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--color-text))]">
        <ShieldCheck className="h-4 w-4 text-[hsl(var(--color-accent))]" />
        Built for Bharat · Made in India
      </span>
    </div>
  );
}
