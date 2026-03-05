import { InputHTMLAttributes } from 'react';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className = '', ...rest } = props;
  return (
    <input
      className={`h-11 w-full rounded-[var(--radius-md)] border border-border bg-bg px-3.5 text-sm leading-5 outline-none ring-accent transition focus:ring-2 ${className}`}
      {...rest}
    />
  );
}
