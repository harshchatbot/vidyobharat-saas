'use client';

import type { HTMLAttributes } from 'react';

type Props = HTMLAttributes<HTMLDivElement> & {
  label: string;
  progress?: number;
  size?: 'compact' | 'contextual';
  firstRun?: boolean;
};

/** A quiet, token-driven status treatment for local AI and editor work. */
export function BrandLoading({ label, progress, size = 'contextual', firstRun = false, className = '', ...props }: Props) {
  const knownProgress = typeof progress === 'number' && Number.isFinite(progress);
  const clamped = knownProgress ? Math.max(0, Math.min(100, progress!)) : undefined;
  return <div {...props} className={`rangmanch-loader rangmanch-loader--${size} ${className}`} role="status" aria-live="polite">
    <span className="rangmanch-loader__glow" aria-hidden="true" />
    <div className="rangmanch-loader__wordmark" aria-hidden="true">RangManch <em>AI</em></div>
    <p className="rangmanch-loader__label">{label}</p>
    {firstRun && <p className="rangmanch-loader__hint">The first setup may take a few minutes. Future launches are usually faster.</p>}
    <div className={`rangmanch-loader__track${knownProgress ? ' is-known' : ''}`} aria-hidden="true">
      <span style={knownProgress ? { width: `${clamped}%` } : undefined} />
    </div>
    {knownProgress && <span className="rangmanch-loader__percent">{Math.round(clamped!)}%</span>}
  </div>;
}
