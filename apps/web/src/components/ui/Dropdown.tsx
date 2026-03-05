import { SelectHTMLAttributes } from 'react';

export function Dropdown(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className = '', ...rest } = props;
  return (
    <select
      className={`h-11 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3.5 text-sm leading-5 text-text outline-none ring-accent transition focus:ring-2 ${className}`}
      {...rest}
    />
  );
}
