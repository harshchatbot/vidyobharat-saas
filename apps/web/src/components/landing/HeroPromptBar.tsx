'use client';

import Link from 'next/link';
import { ImageIcon, Sparkles, Wand2 } from 'lucide-react';

const modes = [
  { label: 'Text to Video', icon: Sparkles },
  { label: 'Image to Video', icon: ImageIcon },
  { label: 'AI Influencer', icon: Wand2 },
];

export function HeroPromptBar() {
  return (
    <div className="rangmanch-glass-strong rounded-[28px] p-3 sm:p-4">
      <div className="flex flex-wrap gap-2">
        {modes.map((mode) => {
          const Icon = mode.icon;
          return (
            <span
              key={mode.label}
              className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.62)] bg-[hsl(var(--color-surface-glass)/0.42)] px-3 py-2 text-xs font-medium text-[hsl(var(--color-text))] sm:text-sm"
            >
              <Icon className="h-4 w-4" />
              {mode.label}
            </span>
          );
        })}
      </div>
      <div className="mt-3 flex flex-col gap-3 rounded-[24px] border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-bg)/0.5)] p-3 sm:flex-row sm:items-center sm:p-4">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[hsl(var(--color-muted))]">Prompt</p>
          <p className="mt-1 truncate text-sm text-[hsl(var(--color-text))] sm:text-base">
            Create an apocalyptic vertical reel with moody sky, cracked streets, drifting ash, and cinematic camera motion.
          </p>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Link
            href="/pricing"
            className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.6)] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))]"
          >
            View plans
          </Link>
          <Link
            href="/signup"
            className="inline-flex rounded-full bg-[hsl(var(--color-text))] px-5 py-2 text-sm font-semibold text-[hsl(var(--color-bg))]"
          >
            Generate
          </Link>
        </div>
      </div>
    </div>
  );
}

