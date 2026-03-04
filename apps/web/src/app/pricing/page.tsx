'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Coins, LoaderCircle } from 'lucide-react';

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
  const router = useRouter();
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<string>('creator');

  useEffect(() => {
    let cancelled = false;
    void api
      .getPricing()
      .then((result) => {
        if (cancelled) return;
        setPricing(result);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load pricing.');
      });
    return () => {
      cancelled = true;
    };
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

  const handleSelectPlan = (planKey: string) => {
    setSelectedPlan(planKey);
    router.push(`/billing?plan=${encodeURIComponent(planKey)}`);
  };

  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-[hsl(var(--color-accent))]">
            Pricing
          </p>

          <h1 className="mt-3 text-4xl font-semibold text-[hsl(var(--color-text))]">
            Flexible plans for creators and teams
          </h1>

          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            Choose a plan that fits your content volume, then scale with credits as you grow.
          </p>

          {pricing && (
            <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-5 py-2 text-sm text-[hsl(var(--color-muted))] shadow-[var(--shadow-soft)]">
              <span>
                Billing region: <strong className="text-[hsl(var(--color-text))]">{pricing.region}</strong>
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
            <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-4 lg:gap-8">
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="relative flex h-full flex-col rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 text-left shadow-[var(--shadow-soft)] transition duration-200 hover:-translate-y-1 hover:border-[hsl(var(--color-accent)/0.55)] hover:shadow-[var(--shadow-hard)] sm:p-6 lg:p-8"
              >
                <h3 className="text-xl font-semibold text-[hsl(var(--color-text))]">
                  Free
                </h3>

                <div className="mt-5">
                  <span className="text-3xl font-bold text-[hsl(var(--color-text))] sm:text-4xl">
                    {formatMoney(pricing.currency, 0)}
                  </span>
                  <span className="ml-2 text-[hsl(var(--color-muted))]">
                    /forever
                  </span>
                </div>

                <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
                  40 credits included
                </p>

                <ul className="mt-5 space-y-3 text-sm text-[hsl(var(--color-muted))]">
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>Try the studio before upgrading</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>Good for first images, voice tests, and lightweight runs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>Upgrade later without changing your workflow</span>
                  </li>
                </ul>

                <span className="mt-8 inline-flex w-full items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-6 py-3 text-sm font-semibold text-[hsl(var(--color-text))] transition">
                  Start Free
                </span>
              </button>

              {orderedPlans.map((plan) => {
                const isPopular = plan.key === 'creator';
                const isSelected = selectedPlan === plan.key;
                const hdVideos = Math.floor(plan.credits / 18);
                const videos720p = Math.floor(plan.credits / 12);
                const images = Math.floor(plan.credits / 3);

                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => handleSelectPlan(plan.key)}
                    className={`relative flex h-full flex-col rounded-[var(--radius-lg)] border p-5 text-left transition duration-200 sm:p-6 lg:p-8 ${
                      isSelected || isPopular
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-elevated))] shadow-[var(--shadow-hard)]'
                        : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-[var(--shadow-soft)] hover:-translate-y-1 hover:border-[hsl(var(--color-accent)/0.55)] hover:shadow-[var(--shadow-hard)]'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[hsl(var(--color-accent))] px-4 py-1 text-xs font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]">
                        Most Popular
                      </div>
                    )}

                    <h3 className="text-xl font-semibold capitalize text-[hsl(var(--color-text))]">
                      {plan.key}
                    </h3>

                    <div className="mt-5">
                      <span className="text-3xl font-bold text-[hsl(var(--color-text))] sm:text-4xl">
                        {formatMoney(pricing.currency, plan.price)}
                      </span>
                      <span className="ml-2 text-[hsl(var(--color-muted))]">
                        /pack
                      </span>
                    </div>

                    <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
                      {plan.credits} credits included
                    </p>

                    <div className="mt-3 space-y-1 text-sm text-[hsl(var(--color-muted))]">
                      <p>~{hdVideos} HD videos</p>
                      <p>~{images} images</p>
                      <p className="text-xs" title={`~${videos720p} 720p videos`}>
                        Best for repeat video and image workflows
                      </p>
                    </div>

                    <ul className="mt-5 space-y-3 text-sm text-[hsl(var(--color-muted))]">
                      {(featureCopy[plan.key] ?? []).map((feature) => (
                        <li key={feature} className="flex items-start gap-2">
                          <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <span
                      className={`mt-8 inline-flex w-full items-center justify-center rounded-[var(--radius-md)] px-6 py-3 text-sm font-semibold transition ${
                        isSelected || isPopular
                          ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                          : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-text))]'
                      }`}
                    >
                      {isSelected ? 'Selected Plan' : isPopular ? 'Choose Creator' : 'Select Plan'}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-16 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 shadow-[var(--shadow-soft)] sm:p-6 lg:mt-20 lg:p-8">
              <div className="mb-6 flex items-center gap-3">
                <Coins className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                <div>
                  <p className="font-semibold text-[hsl(var(--color-text))]">
                    Usage costs
                  </p>
                  <p className="text-sm text-[hsl(var(--color-muted))]">
                    Credits are consumed only when premium actions run.
                  </p>
                </div>
              </div>

              <div className="space-y-3 sm:hidden">
                {pricing.actionCosts.map((item) => (
                  <div
                    key={item.feature}
                    className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-[hsl(var(--color-text))]">{item.feature}</p>
                    <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">{item.cost} credits</p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] sm:block">
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

            <div className="mt-16 text-center lg:mt-20">
              <p className="mb-4 text-sm text-[hsl(var(--color-muted))]">
                Start with a plan today and top up anytime as your usage grows.
              </p>
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
