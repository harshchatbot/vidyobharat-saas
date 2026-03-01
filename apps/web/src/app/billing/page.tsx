'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight, Coins, LoaderCircle, Receipt, Wallet } from 'lucide-react';

import { useCredits } from '@/components/credits/CreditContext';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import type { CreditHistoryItem, CreditWallet } from '@/types/api';

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

export default function BillingPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [history, setHistory] = useState<CreditHistoryItem[]>([]);
  const [topup, setTopup] = useState('100');
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
    void Promise.all([api.getCreditWallet(raw), api.getCreditHistory(raw, 8)])
      .then(([nextWallet, nextHistory]) => {
        setWallet(nextWallet);
        setHistory(nextHistory.items);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to load billing data.');
      })
      .finally(() => setLoading(false));
  }, []);

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
    if (!userId) return;
    const credits = Number(topup);
    if (!Number.isFinite(credits) || credits <= 0) {
      setError('Enter a valid credit amount.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !window.Razorpay) {
        throw new Error('Razorpay checkout could not be loaded.');
      }
      const order = await api.createTopupOrder(credits, userId);
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'RangManch AI',
        description: `${order.credits} credits top-up`,
        order_id: order.orderId,
        handler: async (response: Record<string, string>) => {
          try {
            const verification = await api.verifyTopupOrder(
              {
                credits: order.credits,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
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
        theme: {
          color: '#f6c21a',
        },
      });
      checkout.open();
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
              Track your plan allowance, top up credits for premium generations, and inspect recent usage.
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
                <p className="text-sm font-semibold text-text">Top up credits</p>
                <p className="text-xs text-muted">Manual top-up for local MVP billing. Payment gateway can be wired later.</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[100, 250, 500].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTopup(String(value))}
                  className={`rounded-[var(--radius-md)] border px-4 py-3 text-left ${
                    topup === String(value)
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]'
                  }`}
                >
                  <p className="text-sm font-semibold text-text">{value} credits</p>
                  <p className="mt-1 text-xs text-muted">Instant wallet add</p>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                value={topup}
                onChange={(event) => setTopup(event.target.value)}
                className="w-full rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-4 py-3 text-sm text-text outline-none"
                placeholder="Enter credits"
              />
              <Button onClick={() => void handleTopup()} disabled={submitting} className="min-w-40">
                {submitting ? 'Preparing checkout...' : 'Pay & top up'}
              </Button>
            </div>
            {wallet ? (
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4 text-sm text-muted">
                <p><span className="font-semibold text-text">Plan:</span> {wallet.planName}</p>
                <p className="mt-1"><span className="font-semibold text-text">Monthly allowance:</span> {wallet.monthlyCredits} credits</p>
                <p className="mt-1"><span className="font-semibold text-text">Last reset:</span> {new Date(wallet.lastReset).toLocaleDateString()}</p>
                <p className="mt-1"><span className="font-semibold text-text">Pricing:</span> 1 credit = INR 1 for the MVP checkout flow.</p>
              </div>
            ) : null}
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
