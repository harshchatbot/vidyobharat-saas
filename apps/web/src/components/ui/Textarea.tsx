import { TextareaHTMLAttributes } from 'react';

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const { className = '', ...rest } = props;
  return (
    <textarea
      className={`min-h-[120px] w-full rounded-[var(--radius-md)] border border-border bg-bg px-3.5 py-2.5 text-sm leading-6 outline-none ring-accent transition focus:ring-2 ${className}`}
      {...rest}
    />
  );
}
