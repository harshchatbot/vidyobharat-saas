import { PropsWithChildren } from 'react';
import { X } from 'lucide-react';

export function Modal({ open, onClose, children }: PropsWithChildren<{ open: boolean; onClose: () => void }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-text/40 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex min-h-full items-start justify-center py-2 sm:items-center sm:py-4">
        <div
          className="relative w-full max-w-5xl overflow-hidden rounded-[24px] border border-border bg-surface shadow-hard sm:rounded-[32px]"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-[hsl(var(--color-surface)/0.96)] text-text shadow-soft backdrop-blur sm:right-4 sm:top-4"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="max-h-[calc(100vh-1.5rem)] overflow-y-auto p-4 pt-14 sm:max-h-[calc(100vh-3rem)] sm:p-6 sm:pt-16">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
