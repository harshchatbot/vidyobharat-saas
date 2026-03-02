import { PropsWithChildren } from 'react';

type BadgeVariant = 'default' | 'outline' | 'success' | 'warning';

const styles: Record<BadgeVariant, string> = {
  default: 'bg-elevated text-muted',
  outline: 'border border-border bg-transparent text-text',
  success: 'border border-[hsl(var(--color-success)/0.3)] bg-[hsl(var(--color-success)/0.12)] text-[hsl(var(--color-success))]',
  warning: 'border border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.14)] text-text',
};

export function Badge({
  children,
  className = '',
  variant = 'default',
}: PropsWithChildren<{ className?: string; variant?: BadgeVariant }>) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-1 text-xs font-medium ${styles[variant]} ${className}`}>
      {children}
    </span>
  );
}
