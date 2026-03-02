'use client';

import Link from 'next/link';
import { AlertTriangle, Coins, Wallet } from 'lucide-react';

import { useCredits } from '@/components/credits/CreditContext';

export function CreditChip() {
  const { wallet, loading } = useCredits();
  const low = (wallet?.currentCredits ?? 0) < 10;

  return (
    <details className="relative">
      <summary
        className={`flex list-none cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
          low
            ? 'border-[hsl(var(--color-danger)/0.35)] bg-[hsl(var(--color-danger)/0.08)] text-[hsl(var(--color-danger))]'
            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
        }`}
      >
        {low ? <AlertTriangle className="h-4 w-4" /> : <Coins className="h-4 w-4 text-[hsl(var(--color-accent))]" />}
        {loading ? 'Loading credits…' : `${wallet?.currentCredits ?? 0} credits`}
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-72 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-4 shadow-hard">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          <p className="text-sm font-semibold text-text">Credit wallet</p>
        </div>
        {wallet ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Monthly credits</p>
                <p className="mt-1 text-sm font-semibold text-text">{wallet.monthlyCredits}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Used this cycle</p>
                <p className="mt-1 text-sm font-semibold text-text">{wallet.usedCredits}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">Plan: {wallet.planName}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No wallet data available.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/billing" className="inline-flex rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-3 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]">
            Billing
          </Link>
          <Link href="/pricing" className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-2 text-sm font-semibold text-text">
            View plans
          </Link>
        </div>
      </div>
    </details>
  );
}
