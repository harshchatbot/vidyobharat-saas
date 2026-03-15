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
    <div className="flex flex-col gap-4 rounded-[24px] border border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.94),hsl(var(--color-elevated)/0.86))] p-5 shadow-[var(--shadow-soft)]">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-heading text-xl font-extrabold tracking-tight text-text">Generate Video</p>
        </div>
        <Button type="button" onClick={onClick} disabled={loading || disabled || insufficientCredits} className="gap-2 rounded-full bg-[linear-gradient(135deg,hsl(var(--color-accent)),hsl(var(--color-accent)/0.78))] px-6 py-3 text-base text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-hard)]">
          {loading ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {buttonLabel}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-muted">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--color-bg)/0.72)] px-3 py-1.5">
          <Coins className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          Est. {estimatedCredits} credits
        </span>
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--color-bg)/0.72)] px-3 py-1.5">
          <Clock3 className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          Est. {estimatedTime}
        </span>
        {typeof currentBalance === 'number' ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--color-bg)/0.72)] px-3 py-1.5">
            <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            {currentBalance} credits left
          </span>
        ) : null}
      </div>
      {helperText ? <p className="text-[11px] text-muted line-clamp-2">{helperText}</p> : null}
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
