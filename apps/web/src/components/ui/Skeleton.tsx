'use client';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'card' | 'avatar' | 'video';
}

export function Skeleton({ className = '', variant = 'text' }: SkeletonProps) {
  let baseClasses = 'animate-shimmer';
  let dimensions = '';

  switch (variant) {
    case 'text':
      dimensions = 'h-4 w-full rounded-full';
      break;
    case 'card':
      dimensions = 'h-48 w-full rounded-[var(--radius-lg)]';
      break;
    case 'avatar':
      dimensions = 'h-10 w-10 rounded-full';
      break;
    case 'video':
      dimensions = 'aspect-video w-full rounded-[var(--radius-lg)]';
      break;
  }

  return (
    <div
      className={`${baseClasses} ${dimensions} ${className}`}
      style={{
        background: `linear-gradient(90deg, hsl(var(--color-surface-soft)) 25%, hsl(var(--color-elevated)) 50%, hsl(var(--color-surface-soft)) 75%)`,
        backgroundSize: '1000px 100%',
      }}
    />
  );
}
