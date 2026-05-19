'use client';

import { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({
  icon,
  title,
  description,
  ctaLabel,
  onCta,
}: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="text-center">
        {/* Icon with glass circle background */}
        <div
          className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4"
          style={{
            backgroundColor: `hsl(var(--color-surface))`,
            border: `1px solid hsl(var(--color-border))`,
          }}
        >
          <div style={{ color: `hsl(var(--color-muted))` }} className="w-12 h-12">
            {icon}
          </div>
        </div>

        {/* Title */}
        <h3 className="gradient-text text-xl font-bold mb-2">{title}</h3>

        {/* Description */}
        <p
          className="text-sm max-w-xs mx-auto mb-4"
          style={{ color: `hsl(var(--color-text-secondary))` }}
        >
          {description}
        </p>

        {/* CTA Button */}
        {ctaLabel && onCta && (
          <button
            onClick={onCta}
            className="glow-button mt-4"
          >
            {ctaLabel}
          </button>
        )}
      </div>
    </div>
  );
}
