import { Clock3, Coins, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

export function GenerateButton({
  onClick,
  loading,
  estimatedCredits,
  estimatedTime,
  disabled,
  helperText,
}: {
  onClick: () => void;
  loading: boolean;
  estimatedCredits: number;
  estimatedTime: string;
  disabled?: boolean;
  helperText?: string;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-surface)),hsl(var(--color-bg)))] p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-heading text-xl font-extrabold tracking-tight text-text">Generate Video</p>
          <p className="mt-1 text-sm text-muted">Your current script, tags, media settings, and output preferences will be sent as a single job.</p>
        </div>
        <Button type="button" onClick={onClick} disabled={loading || disabled} className="gap-2 px-6 py-3 text-base">
          {loading ? <Spinner /> : <Sparkles className="h-4 w-4" />}
          {loading ? 'Submitting job...' : 'Generate Video'}
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
      </div>
      {helperText ? <p className="text-xs text-muted">{helperText}</p> : null}
    </div>
  );
}
