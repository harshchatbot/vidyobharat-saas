'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Coins, LoaderCircle, Receipt, Wallet } from 'lucide-react';

import { useCredits } from '@/components/credits/CreditContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { CreditHistoryItem, CreditWallet, PricingResponse } from '@/types/api';

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
    };
  }
}

function getUserIdFromCookie() {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('vidyo_user_id='))
    ?.split('=')[1] ?? null;
}

function formatMoney(currency: string, amount: number) {
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export default function BillingPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [history, setHistory] = useState<CreditHistoryItem[]>([]);
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [selectedPlan, setSelectedPlan] = useState('creator');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { applyWallet } = useCredits();
  const { show } = useToast();

  useEffect(() => {
    const raw = getUserIdFromCookie();
    if (!raw) {
      setLoading(false);
      return;
    }
    setUserId(raw);
    void Promise.all([api.getCreditWallet(raw), api.getCreditHistory(raw, 8), api.getPricing()])
      .then(([nextWallet, nextHistory, nextPricing]) => {
        setWallet(nextWallet);
        setHistory(nextHistory.items);
        setPricing(nextPricing);
        if (!(selectedPlan in nextPricing.plans)) {
          const firstPlan = Object.keys(nextPricing.plans)[0];
          if (firstPlan) setSelectedPlan(firstPlan);
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load billing data.');
      })
      .finally(() => setLoading(false));
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

  const loadRazorpayScript = async () => {
    if (window.Razorpay) return true;
    return new Promise<boolean>((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleTopup = async () => {
    if (!userId || !pricing) return;
    setSubmitting(true);
    setError(null);
    try {
      const order = await api.createTopupOrder(selectedPlan, userId);
      if (order.provider === 'razorpay') {
        const scriptReady = await loadRazorpayScript();
        if (!scriptReady || !window.Razorpay || !order.keyId || !order.orderId) {
          throw new Error('Razorpay checkout could not be loaded.');
        }
        const checkout = new window.Razorpay({
          key: order.keyId,
          amount: order.amountMinor,
          currency: order.currency,
          name: 'RangManch AI',
          description: `${order.planName} plan · ${order.credits} credits`,
          order_id: order.orderId,
          handler: async (response: Record<string, string>) => {
            try {
              const verification = await api.verifyTopupOrder(
                {
                  provider: 'razorpay',
                  providerOrderId: response.razorpay_order_id,
                  providerPaymentId: response.razorpay_payment_id,
                  providerSignature: response.razorpay_signature,
                },
                userId,
              );
              setWallet(verification.wallet);
              applyWallet(verification.wallet);
              const refreshed = await api.getCreditHistory(userId, 8);
              setHistory(refreshed.items);
              show(`Top-up successful! Credits Added: ${verification.addedCredits} · Balance: ${verification.wallet.currentCredits}`);
            } catch (verifyError) {
              setError(verifyError instanceof Error ? verifyError.message : 'Payment verification failed.');
            }
          },
          theme: { color: '#f6c21a' },
        });
        checkout.open();
      } else {
        setError(order.message ?? 'Stripe checkout is prepared but not enabled yet for this region.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Top-up failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Card className="flex items-center gap-3">
        <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--color-accent))]" />
        <p className="text-sm text-muted">Loading billing data...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text">Billing & Credits</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Pick a plan, buy credits in your region, and keep premium generation predictable. Pricing is always validated on the backend.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/pricing">
              <Button variant="secondary">View plans</Button>
            </Link>
            <Link href="/credits/history">
              <Button variant="secondary">Full history</Button>
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Card className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                <Wallet className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Current balance</p>
              <p className="font-heading text-2xl font-extrabold text-text">{wallet?.currentCredits ?? 0}</p>
            </Card>
            <Card className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                <Coins className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Monthly credits</p>
              <p className="font-heading text-2xl font-extrabold text-text">{wallet?.monthlyCredits ?? 0}</p>
            </Card>
            <Card className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                <Receipt className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Used this cycle</p>
              <p className="font-heading text-2xl font-extrabold text-text">{wallet?.usedCredits ?? 0}</p>
            </Card>
            <Card className="space-y-2">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
                <ArrowRight className="h-5 w-5" />
              </div>
              <p className="text-xs uppercase tracking-[0.16em] text-muted">Plan</p>
              <p className="font-heading text-2xl font-extrabold text-text">{wallet?.planName ?? 'Free'}</p>
            </Card>
          </div>

          <Card className="space-y-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <div>
                <p className="text-sm font-semibold text-text">Choose a plan</p>
                <p className="text-xs text-muted">
                  {pricing ? `Detected region: ${pricing.region} · currency: ${pricing.currency} · provider: ${pricing.paymentProvider}` : 'Loading region-aware checkout...'}
                </p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {orderedPlans.map((plan) => (
                <button
                  key={plan.key}
                  type="button"
                  onClick={() => setSelectedPlan(plan.key)}
                  className={`rounded-[var(--radius-md)] border px-4 py-4 text-left ${
                    selectedPlan === plan.key
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold capitalize text-text">{plan.key}</p>
                      <p className="mt-1 text-sm text-muted">{plan.credits} credits</p>
                    </div>
                    {pricing ? (
                      <p className="text-base font-semibold text-text">{formatMoney(pricing.currency, plan.price)}</p>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
              <div className="text-sm text-muted">
                {pricing ? (
                  <>
                    <p><span className="font-semibold text-text capitalize">{selectedPlan}</span> allocates <span className="font-semibold text-text">{pricing.creditAllocation[selectedPlan] ?? 0} credits</span>.</p>
                    <p className="mt-1">Backend-controlled regional pricing prevents client-side tampering.</p>
                  </>
                ) : null}
              </div>
              <Button onClick={() => void handleTopup()} disabled={submitting || !pricing} className="min-w-44">
                {submitting ? 'Preparing checkout...' : pricing?.paymentProvider === 'stripe' ? 'Prepare checkout' : 'Proceed to checkout'}
              </Button>
            </div>
            {error ? <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
          </Card>
        </div>

        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">Recent credit activity</p>
              <p className="mt-1 text-xs text-muted">Recent debits, free runs, top-ups, and resets.</p>
            </div>
            <Link href="/credits/history" className="text-sm font-semibold text-[hsl(var(--color-accent))]">
              View all
            </Link>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-muted">No billing activity yet.</p>
          ) : (
            <div className="space-y-3">
              {history.map((item) => (
                <div key={item.id} className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text">{item.featureName}</p>
                    <span className="text-sm font-semibold text-text">
                      {item.transactionType === 'credit' ? '+' : '-'}
                      {item.creditsUsed}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(item.createdAt).toLocaleString()} • balance after {item.remainingBalance}
                  </p>
                  <p className="mt-1 text-xs text-muted">Source: {item.source}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
