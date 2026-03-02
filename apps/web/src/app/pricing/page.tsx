'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Coins, LoaderCircle } from 'lucide-react';

import { api } from '@/lib/api';
import type { PricingResponse } from '@/types/api';

function formatMoney(currency: string, amount: number) {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

const featureCopy: Record<string, string[]> = {
  starter: [
    'Good for first premium generations',
    'For solo creators testing the studio',
    'Balanced top-up pack',
  ],
  creator: [
    'Best value for active creators',
    'Frequent video and voice usage',
    'Strong monthly working budget',
  ],
  growth: [
    'Built for growing teams',
    'Higher generation throughput',
    'Good for agency-style operations',
  ],
  pro: [
    'Best for production workloads',
    'Maximum credit headroom',
    'For studios and heavy campaign output',
  ],
};

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .getPricing()
      .then(setPricing)
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Failed to load pricing.')
      );
  }, []);

  const orderedPlans = useMemo(() => {
    if (!pricing) return [];
    return ['starter', 'creator', 'growth', 'pro']
      .filter((plan) => plan in pricing.plans)
      .map((plan) => ({
        key: plan,
        price: pricing.plans[plan],
        credits: pricing.creditAllocation[plan],
      }));
  }, [pricing]);

  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-7xl px-4">

        {/* HERO */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--color-accent))]">
            Pricing
          </p>

          <h1 className="mt-3 text-4xl font-semibold text-[hsl(var(--color-text))]">
            Simple, region-aware pricing
          </h1>

          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            Pricing automatically adjusts based on your region.
            Credits power generation — money purchases credit packs.
          </p>

          {pricing && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-5 py-2 text-sm text-[hsl(var(--color-muted))] shadow-[var(--shadow-soft)]">
              <span>
                Region: <strong className="text-[hsl(var(--color-text))]">{pricing.region}</strong>
              </span>
              <span>•</span>
              <span>
                Currency: <strong className="text-[hsl(var(--color-text))]">{pricing.currency}</strong>
              </span>
            </div>
          )}

          {error && (
            <p className="mt-4 text-sm text-[hsl(var(--color-danger))]">
              {error}
            </p>
          )}
        </div>

        {!pricing ? (
          <div className="mt-12 flex items-center justify-center gap-3 rounded-2xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-[var(--shadow-soft)]">
            <LoaderCircle className="h-5 w-5 animate-spin text-[hsl(var(--color-accent))]" />
            <span className="text-[hsl(var(--color-muted))]">
              Loading region-aware pricing...
            </span>
          </div>
        ) : (
          <>
            {/* PLANS */}
            <div className="mt-16 grid gap-8 lg:grid-cols-4">
              {orderedPlans.map((plan) => {
                const isPopular = plan.key === 'creator';

                return (
                  <div
                    key={plan.key}
                    className={`relative rounded-[var(--radius-lg)] border p-8 transition ${
                      isPopular
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-elevated))] shadow-[var(--shadow-hard)]'
                        : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-[var(--shadow-soft)]'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[hsl(var(--color-accent))] px-4 py-1 text-xs font-semibold text-[hsl(var(--color-accent-contrast))] shadow">
                        Most Popular
                      </div>
                    )}

                    <h3 className="text-xl font-semibold capitalize text-[hsl(var(--color-text))]">
                      {plan.key}
                    </h3>

                    <div className="mt-6">
                      <span className="text-4xl font-bold text-[hsl(var(--color-text))]">
                        {formatMoney(pricing.currency, plan.price)}
                      </span>
                      <span className="ml-2 text-[hsl(var(--color-muted))]">
                        /pack
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
                      {plan.credits} credits included
                    </p>

                    <ul className="mt-6 space-y-3 text-sm text-[hsl(var(--color-muted))]">
                      {(featureCopy[plan.key] ?? []).map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Link href="/billing" className="mt-8 block">
                      <button
                        className={`w-full rounded-[var(--radius-md)] px-6 py-3 text-sm font-semibold transition ${
                          isPopular
                            ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-text))]'
                        }`}
                      >
                        {isPopular ? 'Choose Creator' : 'Select Plan'}
                      </button>
                    </Link>
                  </div>
                );
              })}
            </div>

            {/* CREDIT BREAKDOWN */}
            <div className="mt-20 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-8 shadow-[var(--shadow-soft)]">
              <div className="mb-6 flex items-center gap-3">
                <Coins className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                <div>
                  <p className="font-semibold text-[hsl(var(--color-text))]">
                    Credit cost breakdown
                  </p>
                  <p className="text-sm text-[hsl(var(--color-muted))]">
                    Usage costs are measured in credits.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[hsl(var(--color-border))]">
                <table className="min-w-full text-sm">
                  <thead className="bg-[hsl(var(--color-elevated))]">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--color-text))]">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left font-semibold text-[hsl(var(--color-text))]">
                        Cost
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.actionCosts.map((item) => (
                      <tr
                        key={item.feature}
                        className="border-t border-[hsl(var(--color-border))]"
                      >
                        <td className="px-4 py-3 text-[hsl(var(--color-text))]">
                          {item.feature}
                        </td>
                        <td className="px-4 py-3 text-[hsl(var(--color-muted))]">
                          {item.cost} credits
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* CTA */}
            <div className="mt-20 text-center">
              <Link href="/billing">
                <button className="rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-8 py-3 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]">
                  Upgrade or Top-Up
                </button>
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}