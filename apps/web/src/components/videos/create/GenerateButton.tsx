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
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-surface)),hsl(var(--color-bg)))] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-heading text-xl font-extrabold tracking-tight text-text">Generate Video</p>
          <p className="mt-1 text-sm text-muted">Your current script, tags, media settings, and output preferences will be sent as a single job.</p>
        </div>
        <Button type="button" onClick={onClick} disabled={loading || disabled || insufficientCredits} className="gap-2 px-6 py-3 text-base">
          {loading ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {buttonLabel}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-muted">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5">
          <Coins className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          Est. {estimatedCredits} credits
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5">
          <Clock3 className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          Est. {estimatedTime}
        </span>
        {typeof currentBalance === 'number' ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-bg px-3 py-1.5">
            <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            {currentBalance} credits left
          </span>
        ) : null}
      </div>
      {helperText ? <p className="text-xs text-muted">{helperText}</p> : null}
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
