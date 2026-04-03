'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Coins } from 'lucide-react';

import { PacmanLoader } from '@/components/ui/PacmanLoader';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { api } from '@/lib/api';
import { getBestForCopy, getEstimateAssumptions, getPlanOutputEstimates } from '@/lib/pricingEstimates';
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
    'Good first paid step after the free tier',
    'Balanced for images, drafts, and a few premium clips',
    'Straightforward top-up pack for solo creators',
  ],
  creator: [
    'Strong working budget for repeat creation',
    'Good mix of image, voice, and premium video usage',
    'Best fit for active solo creators',
  ],
  growth: [
    'Built for growing teams and client work',
    'Higher throughput for repeat campaigns',
    'Useful for agency-style workflows',
  ],
  pro: [
    'Maximum headroom for production-heavy work',
    'Best for studios and frequent premium generations',
    'Designed for sustained campaign output',
  ],
};

const pricingFaqs = [
  {
    q: 'Do unused credits roll over?',
    a: 'Top-up packs stay in your wallet. Monthly plan credits refresh on your active cycle and do not carry forward into the next cycle.',
  },
  {
    q: 'What can I realistically do on the free plan?',
    a: 'The free plan is designed for real testing: image drafts, template runs, voice previews, influencer setup, and lightweight Kling experiments. It is not meant to cover sustained premium Sora or Veo usage.',
  },
  {
    q: 'Can I mix image, voice, and video usage?',
    a: 'Yes. One shared wallet powers all premium generation actions across the studio.',
  },
  {
    q: 'Can I start free and upgrade later?',
    a: 'Yes. You can start on the free tier and move to paid packs whenever your output volume grows.',
  },
];

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

  const estimateAssumptions = useMemo(() => getEstimateAssumptions(), []);

  const handleSelectPlan = (planKey: string) => {
    setSelectedPlan(planKey);
    router.push(`/billing?plan=${encodeURIComponent(planKey)}`);
  };

  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <StudioPageHeader
          eyebrow="Plans"
          title="Simple credits for India-first creators and teams"
          description="Start with reliable workflows on the free tier, then scale into premium video, image, and voice usage only when your output volume grows."
          className="mx-auto max-w-5xl"
          actions={pricing ? (
            <div className="inline-flex items-center gap-3 rounded-full border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface-glass)/0.62)] px-4 py-2 text-sm text-muted">
              <span>
                Currency: <strong className="text-text">{pricing.currency}</strong>
              </span>
              <span>•</span>
              <span>
                Secure checkout: <strong className="text-text capitalize">{pricing.paymentProvider}</strong>
              </span>
            </div>
          ) : undefined}
        />

        {error && (
          <p className="mx-auto mt-4 max-w-5xl text-sm text-[hsl(var(--color-danger))]">
            {error}
          </p>
        )}

        {!pricing ? (
          <div className="rangmanch-studio-panel mx-auto mt-12 max-w-5xl rounded-[28px] p-6">
            <PacmanLoader centered size="lg" label="Loading pricing..." />
          </div>
        ) : (
          <>
            <div className="mt-12 grid gap-5 lg:mt-16 lg:grid-cols-4 lg:gap-8">
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="rangmanch-studio-panel relative flex h-full flex-col rounded-[28px] border-none bg-transparent p-5 text-left transition duration-200 hover:-translate-y-1 sm:p-6 lg:p-8"
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
                  40 credits / month
                </p>

                <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--color-accent))]">
                  {getBestForCopy('free')}
                </p>

                <div className="mt-4 rounded-[20px] border border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-bg)/0.44)] px-4 py-4">
                  <p className="text-sm font-semibold text-text">What you can roughly create</p>
                  <div className="mt-3 space-y-2 text-sm text-[hsl(var(--color-muted))]">
                    {getPlanOutputEstimates(40, 3).map((estimate) => (
                      <p key={estimate.id}>~{estimate.count} {estimate.label}</p>
                    ))}
                  </div>
                  <p className="mt-3 text-xs text-muted">Plus a one-time 25-credit activation bonus after your first real workflow win.</p>
                </div>

                <ul className="mt-5 space-y-3 text-sm text-[hsl(var(--color-muted))]">
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>40 credits every month for real product testing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>25-credit activation bonus after your first real workflow win</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>Good for first images, templates, voice tests, and lightweight Kling runs</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[hsl(var(--color-accent))]" />
                    <span>Upgrade later for premium Sora, Veo, and higher-volume output</span>
                  </li>
                </ul>

                <span className="mt-8 inline-flex w-full items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-6 py-3 text-sm font-semibold text-[hsl(var(--color-text))] transition">
                  Start Free
                </span>
              </button>

              {orderedPlans.map((plan) => {
                const isPopular = plan.key === 'creator';
                const isSelected = selectedPlan === plan.key;
                const outputEstimates = getPlanOutputEstimates(plan.credits, 4);

                return (
                  <button
                    key={plan.key}
                    type="button"
                    onClick={() => handleSelectPlan(plan.key)}
                    className={`relative flex h-full flex-col rounded-[28px] border p-5 text-left transition duration-200 sm:p-6 lg:p-8 ${
                      isSelected || isPopular
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-elevated)/0.92)] shadow-[var(--shadow-hard)]'
                        : 'rangmanch-studio-panel border-[hsl(var(--color-border)/0.9)] bg-transparent shadow-[var(--shadow-soft)] hover:-translate-y-1 hover:border-[hsl(var(--color-accent)/0.55)] hover:shadow-[var(--shadow-hard)]'
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

                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-[hsl(var(--color-accent))]">
                      {getBestForCopy(plan.key)}
                    </p>

                    <div className="mt-4 rounded-[20px] border border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-bg)/0.44)] px-4 py-4">
                      <p className="text-sm font-semibold text-text">What you can roughly create</p>
                      <div className="mt-3 space-y-2 text-sm text-[hsl(var(--color-muted))]">
                        {outputEstimates.map((estimate) => (
                          <p key={estimate.id}>~{estimate.count} {estimate.label}</p>
                        ))}
                      </div>
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

            <section className="mt-8 rounded-[28px] border border-[hsl(var(--color-border)/0.8)] bg-[hsl(var(--color-surface)/0.26)] px-5 py-5 sm:px-6">
              <div className="max-w-5xl">
                <p className="text-sm font-semibold text-text">Estimates based on common setups</p>
                <div className="mt-3 grid gap-2 text-sm text-muted sm:grid-cols-2">
                  {estimateAssumptions.map((item) => (
                    <p key={item}>{item}</p>
                  ))}
                </div>
                <p className="mt-4 text-sm text-muted">
                  Premium models like <span className="font-semibold text-text">Veo 3.1</span> use significantly more credits than images or Kling drafts.
                </p>
              </div>
            </section>

            <div className="rangmanch-studio-panel mt-16 rounded-[28px] border-none bg-transparent p-5 shadow-[var(--shadow-soft)] sm:p-6 lg:mt-20 lg:p-8">
              <div className="mb-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-[22px] border border-[hsl(var(--color-border)/0.82)] bg-[hsl(var(--color-bg)/0.46)] px-5 py-5">
                  <p className="text-sm font-semibold text-text">What 40 free credits are best for</p>
                  <div className="mt-3 space-y-2 text-sm text-muted">
                    {getPlanOutputEstimates(40, 3).map((estimate) => (
                      <p key={estimate.id}>~{estimate.count} {estimate.label}</p>
                    ))}
                  </div>
                </div>
                <div className="rounded-[22px] border border-[hsl(var(--color-border)/0.82)] bg-[hsl(var(--color-bg)/0.46)] px-5 py-5">
                  <p className="text-sm font-semibold text-text">Best way to use the free tier</p>
                  <p className="mt-3 text-sm text-muted">
                    Start with images, templates, influencer visuals, and fast drafts. Save Sora 2 and Veo 3.1 for the moment you need premium output quality.
                  </p>
                </div>
              </div>

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
                    className="rounded-[20px] border border-[hsl(var(--color-border)/0.82)] bg-[hsl(var(--color-bg)/0.46)] px-4 py-3"
                  >
                    <p className="text-sm font-semibold text-[hsl(var(--color-text))]">{item.feature}</p>
                    <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">{item.cost} credits</p>
                  </div>
                ))}
              </div>

              <div className="hidden overflow-x-auto rounded-[24px] border border-[hsl(var(--color-border)/0.82)] sm:block">
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

            <section className="mt-10 grid gap-4 lg:mt-12 lg:grid-cols-3">
              {pricingFaqs.map((item) => (
                <article
                  key={item.q}
                  className="rangmanch-studio-panel rounded-[24px] border-none bg-transparent p-4 shadow-[var(--shadow-soft)]"
                >
                  <h3 className="text-sm font-semibold text-[hsl(var(--color-text))]">{item.q}</h3>
                  <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">{item.a}</p>
                </article>
              ))}
            </section>

            <div className="mt-16 text-center lg:mt-20">
              <p className="mb-4 text-sm text-[hsl(var(--color-muted))]">
                Start free, earn the activation bonus on your first real win, and upgrade when you need more polished output or more weekly volume.
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
