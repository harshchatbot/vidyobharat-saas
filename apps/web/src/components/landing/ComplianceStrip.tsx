'use client';

const badges = ['GDPR', 'SOC 2 TYPE II', 'CCPA', 'AI ACT', 'DPF'];

export function ComplianceStrip() {
  return (
    <section className="py-24">
      <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.65)] px-5 py-7">
        <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3">
          {badges.map((badge) => (
            <span
              key={badge}
              className="rounded-sm border-2 border-[hsl(var(--color-border))] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[hsl(var(--color-muted))] grayscale transition hover:border-[hsl(var(--color-accent))] hover:text-[hsl(var(--color-accent))]"
            >
              {badge}
            </span>
          ))}
        </div>

        <p className="mt-4 text-center text-[10px] font-semibold uppercase tracking-[0.24em] text-[hsl(var(--color-muted))] sm:text-xs">
          CERTIFIED TO MEET GLOBAL SECURITY AND COMPLIANCE STANDARDS
        </p>
      </div>
    </section>
  );
}
