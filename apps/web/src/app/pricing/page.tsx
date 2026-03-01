'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Coins, LoaderCircle, Sparkles, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  starter: ['Good for first premium generations', 'For solo creators testing the studio', 'Balanced top-up pack'],
  creator: ['Best value for active creators', 'Frequent video and voice usage', 'Strong monthly working budget'],
  growth: ['Built for growing teams', 'Higher generation throughput', 'Good for agency-style operations'],
  pro: ['Best for production workloads', 'Maximum credit headroom', 'For studios and heavy campaign output'],
};

export default function PricingPage() {
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api.getPricing()
      .then(setPricing)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load pricing.'));
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
    <div className="space-y-8">
      <Card className="space-y-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Pricing</p>
          <h1 className="mt-2 font-heading text-3xl font-extrabold tracking-tight text-text">Usage-based plans with transparent credit allocation</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Prices are served from the backend based on your detected region. Credits are internal usage units and are allocated by plan, not derived from money.
          </p>
          {pricing ? (
            <p className="mt-3 text-sm text-muted">
              Region: <span className="font-semibold text-text">{pricing.region}</span> · Currency: <span className="font-semibold text-text">{pricing.currency}</span>
            </p>
          ) : null}
          {error ? <p className="mt-3 text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
        </div>
      </Card>

      {!pricing ? (
        <Card className="flex items-center gap-3">
          <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--color-accent))]" />
          <p className="text-sm text-muted">Loading region-aware pricing...</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-4">
            {orderedPlans.map((plan) => (
              <Card
                key={plan.key}
                className={`space-y-5 ${plan.key === 'creator' ? 'border-[hsl(var(--color-accent))] shadow-soft' : ''}`}
              >
                <div className="space-y-2">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                    {plan.key === 'creator' ? <Sparkles className="h-5 w-5" /> : <Wallet className="h-5 w-5" />}
                  </div>
                  <p className="font-heading text-2xl font-extrabold capitalize text-text">{plan.key}</p>
                  <p className="text-sm text-muted">{plan.credits} credits included</p>
                </div>
                <div>
                  <span className="font-heading text-4xl font-extrabold tracking-tight text-text">
                    {formatMoney(pricing.currency, plan.price)}
                  </span>
                  <span className="ml-1 text-sm text-muted">/pack</span>
                </div>
                <ul className="space-y-2 text-sm text-muted">
                  {(featureCopy[plan.key] ?? []).map((feature) => (
                    <li key={feature} className="flex gap-2">
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/billing" className="block">
                  <Button className="w-full">{plan.key === 'creator' ? 'Choose Creator' : 'Select Plan'}</Button>
                </Link>
              </Card>
            ))}
          </div>

          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <div>
                <p className="text-sm font-semibold text-text">Credit cost breakdown</p>
                <p className="text-xs text-muted">Usage costs remain separate from money. Money only buys plan-based credit allocation.</p>
              </div>
            </div>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-[hsl(var(--color-border))]">
              <table className="min-w-full divide-y divide-[hsl(var(--color-border))] text-sm">
                <thead className="bg-[hsl(var(--color-bg))]">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-text">Action</th>
                    <th className="px-4 py-3 text-left font-semibold text-text">Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
                  {pricing.actionCosts.map((item) => (
                    <tr key={item.feature}>
                      <td className="px-4 py-3 text-text">{item.feature}</td>
                      <td className="px-4 py-3 text-muted">{item.cost} credits</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-heading text-xl font-extrabold text-text">Need more generation headroom?</p>
              <p className="mt-1 text-sm text-muted">Choose a plan, buy credits in your region, and keep premium voice, image, and video flows predictable.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/billing">
                <Button className="gap-2">
                  Upgrade or Top-Up
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/credits/history">
                <Button variant="secondary">View usage history</Button>
              </Link>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
