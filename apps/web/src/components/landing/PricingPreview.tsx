'use client';

import Link from 'next/link';

import { motion } from 'framer-motion';

import { GlassPanel } from '@/components/landing/GlassPanel';

const plans = [
  {
    label: 'Free',
    price: '₹0',
    cadence: '/ forever',
    credits: '40 credits / month',
    detail: 'Get 40 free credits every month, no watermark, and try the studio before upgrading.',
  },
  {
    label: 'Starter',
    price: '₹499',
    cadence: '/ pack',
    credits: '200 credits',
    detail: 'Good for first premium workflows and repeat experiments.',
  },
  {
    label: 'Creator',
    price: '₹1,499',
    cadence: '/ pack',
    credits: '650 credits',
    detail: 'Built for serious creators and regular publishing cadence.',
  },
] as const;

export function PricingPreview() {
  return (
    <section className="py-10">
      <GlassPanel variant="strong" className="overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="max-w-2xl">
            <p className="rangmanch-section-eyebrow">Pricing</p>
            <h2 className="mt-1 rangmanch-section-title">Start free, then move into creator-grade plans when you need more output.</h2>
            <p className="mt-3 text-sm leading-6 text-muted sm:text-base">
              Credits stay transparent, premium workflows remain optional, and you can scale from simple tests to repeated production work.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                href="/pricing"
                className="inline-flex rounded-full bg-[hsl(var(--color-text))] px-5 py-3 text-sm font-semibold text-[hsl(var(--color-bg))]"
              >
                View full pricing
              </Link>
              <Link
                href="/signup"
                className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.24)] px-5 py-3 text-sm font-semibold text-text"
              >
                Start free
              </Link>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.label}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-30px' }}
                transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
                className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.22)] px-4 py-4 backdrop-blur-md"
              >
                <p className="text-sm font-semibold text-text">{plan.label}</p>
                <div className="mt-3 flex items-end gap-1">
                  <p className="text-2xl font-extrabold tracking-tight text-text">{plan.price}</p>
                  <p className="pb-0.5 text-xs text-muted">{plan.cadence}</p>
                </div>
                <p className="mt-3 text-sm font-semibold text-text">{plan.credits}</p>
                <p className="mt-2 text-sm leading-6 text-muted">{plan.detail}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </GlassPanel>
    </section>
  );
}
