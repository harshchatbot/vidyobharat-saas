import { forwardRef, TextareaHTMLAttributes } from 'react';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(props, ref) {
  const { className = '', ...rest } = props;
  return (
    <textarea
      ref={ref}
      className={`min-h-[120px] w-full rounded-[var(--radius-md)] border border-border bg-bg px-3.5 py-2.5 text-sm leading-6 outline-none ring-accent transition focus:ring-2 ${className}`}
      {...rest}
    />
  );
});
