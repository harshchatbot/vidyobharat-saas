import Link from 'next/link';
import { Clock3, Coins, Sparkles, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export function GenerateButton({
  onClick,
  loading,
  estimatedCredits,
  estimatedTime,
  currentBalance,
  disabled,
  helperText,
  insufficientCredits,
  onOpenLowBalance,
}: {
  onClick: () => void;
  loading: boolean;
  estimatedCredits: number;
  estimatedTime: string;
  currentBalance?: number | null;
  disabled?: boolean;
  helperText?: string;
  insufficientCredits?: boolean;
  onOpenLowBalance?: () => void;
}) {
  const buttonLabel = loading
    ? 'Submitting job...'
    : estimatedCredits > 0
      ? `Generate Video · ${estimatedCredits} credits`
      : 'Generate Video · Free';

  return (
    <div className="flex flex-col gap-3 rounded-[20px] border border-[hsl(var(--color-border)/0.78)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.74),hsl(var(--color-bg)/0.56))] p-3.5 sm:gap-3.5 sm:rounded-[22px] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-heading text-lg font-extrabold tracking-tight text-text">Generate Video</p>
          <p className="mt-1 text-xs text-muted">We’ll submit the current script, media, and output settings as one render job.</p>
        </div>
        <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.66)] px-2.5 py-1 text-[11px] font-semibold text-text">
          Ready
        </span>
      </div>

      <div className="flex flex-wrap gap-2 text-sm text-muted">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--color-bg)/0.64)] px-3 py-1.5">
          <Coins className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          {estimatedCredits} credits
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--color-bg)/0.64)] px-3 py-1.5">
          <Clock3 className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          {estimatedTime}
        </span>
        {typeof currentBalance === 'number' ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--color-bg)/0.64)] px-3 py-1.5">
            <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            {currentBalance} left
          </span>
        ) : null}
      </div>

      <Button type="button" onClick={onClick} disabled={loading || disabled || insufficientCredits} className="gap-2 rounded-full bg-[linear-gradient(135deg,hsl(var(--color-accent)),hsl(var(--color-accent)/0.78))] px-6 py-3 text-base text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-hard)]">
          {loading ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {buttonLabel}
      </Button>
      {helperText ? <p className="text-[11px] leading-5 text-muted">{helperText}</p> : null}
      {insufficientCredits ? (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-danger)/0.24)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3">
          <p className="text-sm font-medium text-text">Insufficient credits for this generation.</p>
          {onOpenLowBalance ? (
            <button type="button" onClick={onOpenLowBalance} className="text-sm font-semibold text-[hsl(var(--color-danger))]">
              See options
            </button>
          ) : null}
          <Link href="/billing" className="text-sm font-semibold text-[hsl(var(--color-danger))]">
            Top up credits
          </Link>
          <Link href="/pricing" className="text-sm font-semibold text-[hsl(var(--color-danger))]">
            View plans
          </Link>
        </div>
      ) : null}
    </div>
  );
}
