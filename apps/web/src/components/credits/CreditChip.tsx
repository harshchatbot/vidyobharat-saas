'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Coins, RefreshCw, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { useCredits } from '@/components/credits/CreditContext';

type Props = {
  onNavigate?: (href: string, label: string) => void;
};

export function CreditChip({ onNavigate }: Props) {
  const pathname = usePathname();
  const { wallet, loading, refreshing, refresh } = useCredits();
  const low = (wallet?.currentCredits ?? 0) < 10;
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const onNavigationStart = () => setOpen(false);
    window.addEventListener('rangmanch:navigation-start', onNavigationStart);
    return () => {
      window.removeEventListener('rangmanch:navigation-start', onNavigationStart);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`flex list-none cursor-pointer items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold ${
          low
            ? 'border-[hsl(var(--color-danger)/0.35)] bg-[hsl(var(--color-danger)/0.08)] text-[hsl(var(--color-danger))]'
            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-text'
        }`}
        onClick={() => setOpen((current) => !current)}
      >
        {low ? <AlertTriangle className="h-4 w-4" /> : <Coins className="h-4 w-4 text-[hsl(var(--color-accent))]" />}
        {loading ? 'Loading credits…' : `${wallet?.currentCredits ?? 0} credits`}
        {!loading && refreshing ? <span className="text-[11px] font-medium text-muted">Refreshing…</span> : null}
      </button>
      {open ? (
      <div
        role="dialog"
        aria-label="Credit wallet"
        className="absolute right-0 z-30 mt-2 w-72 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-4 shadow-hard"
      >
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          <p className="text-sm font-semibold text-text">Credit wallet</p>
          {refreshing ? <span className="text-[11px] text-muted">Refreshing…</span> : null}
        </div>
        {wallet ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Monthly refill</p>
                <p className="mt-1 text-sm font-semibold text-text">{wallet.monthlyCredits}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Used this cycle</p>
                <p className="mt-1 text-sm font-semibold text-text">{wallet.usedCredits}</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-muted">Plan: {wallet.planName} · monthly credits refresh each cycle.</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">No wallet data available.</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void refresh()}
            disabled={loading || refreshing}
            className="gap-2"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link
            href="/billing"
            onClick={onNavigate ? (event) => {
              event.preventDefault();
              setOpen(false);
              onNavigate('/billing', 'Billing');
            } : () => setOpen(false)}
            className="inline-flex rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-3 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]"
          >
            Billing
          </Link>
          <Link
            href="/pricing"
            onClick={onNavigate ? (event) => {
              event.preventDefault();
              setOpen(false);
              onNavigate('/pricing', 'Pricing');
            } : () => setOpen(false)}
            className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-2 text-sm font-semibold text-text"
          >
            View plans
          </Link>
        </div>
      </div>
      ) : null}
    </div>
  );
}
