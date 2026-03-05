import { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const styles: Record<Variant, string> = {
  primary: 'bg-accent text-accent-contrast hover:opacity-90 shadow-soft',
  secondary: 'bg-surface text-text border border-border hover:bg-elevated',
  ghost: 'bg-transparent text-text hover:bg-elevated',
  danger: 'bg-danger text-white hover:opacity-90'
};

export function Button({
  children,
  className = '',
  variant = 'primary',
  ...props
}: PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement>> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex min-h-10 items-center justify-center rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-semibold leading-none transition ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
