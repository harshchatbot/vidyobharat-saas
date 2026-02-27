import { TextareaHTMLAttributes } from 'react';

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm outline-none ring-accent focus:ring-2"
      {...props}
    />
  );
}
