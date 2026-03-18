import Link from 'next/link';
import { ImageIcon, Sparkles, Wand2 } from 'lucide-react';

const modes = [
  { label: 'AI Image', icon: Sparkles },
  { label: 'AI Video', icon: ImageIcon },
  { label: 'AI Influencer', icon: Wand2 },
];

export function HeroPromptBar() {
  return (
    <div className="rangmanch-glass-strong rounded-[24px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-bg)/0.34)] p-3 shadow-[var(--shadow-soft)] backdrop-blur-xl sm:rounded-[28px] sm:p-4">
      <div className="flex flex-wrap gap-2">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <span
              key={mode.label}
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-accent)/0.28)] bg-[hsl(var(--color-accent)/0.1)] px-3 py-2 text-xs font-medium text-[hsl(var(--color-text))] sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              {mode.label}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-3 rounded-[20px] border border-[hsl(var(--color-border)/0.38)] bg-[hsl(var(--color-bg)/0.54)] p-3 sm:rounded-[24px] sm:flex-row sm:items-center sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[hsl(var(--color-muted))]">Prompt</p>
          <p className="mt-1 text-sm leading-6 text-[hsl(var(--color-text))] sm:truncate sm:text-base">
            Create an apocalyptic vertical reel with moody sky, cracked streets, drifting ash, and cinematic camera motion.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:self-auto">
          <Link
            href="/pricing"
            className="inline-flex w-full items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.6)] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] sm:w-auto"
          >
            View plans
          </Link>
          <Link
            href="/signup"
            className="rangmanch-landing-cta-primary inline-flex w-full items-center justify-center rounded-full px-5 py-2 text-sm font-semibold sm:w-auto"
          >
            Generate
          </Link>
        </div>
      </div>
    </div>
  );
}
