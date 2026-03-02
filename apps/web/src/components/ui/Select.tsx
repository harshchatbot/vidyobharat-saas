import { SelectHTMLAttributes } from 'react';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className="w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-text" {...props} />;
}
