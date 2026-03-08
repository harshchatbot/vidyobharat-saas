type StatusVariant = 'default' | 'success' | 'warning' | 'danger';

const styles: Record<StatusVariant, string> = {
  default: 'border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface-glass)/0.4)] text-text',
  success: 'border-[hsl(var(--color-success)/0.34)] bg-[hsl(var(--color-success)/0.12)] text-[hsl(var(--color-success))]',
  warning: 'border-[hsl(var(--color-accent)/0.34)] bg-[hsl(var(--color-accent)/0.14)] text-text',
  danger: 'border-[hsl(var(--color-danger)/0.34)] bg-[hsl(var(--color-danger)/0.12)] text-[hsl(var(--color-danger))]',
};

export function StatusChip({
  children,
  variant = 'default',
  className = '',
}: {
  children: React.ReactNode;
  variant?: StatusVariant;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${styles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
