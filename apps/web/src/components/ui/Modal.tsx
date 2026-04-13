'use client';

import { PropsWithChildren, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export function Modal({ open, onClose, children }: PropsWithChildren<{ open: boolean; onClose: () => void }>) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open) return null;
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 bg-text/40 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-[100dvh] items-start justify-center overflow-y-auto overscroll-contain p-2 sm:p-4">
        <div
          className="relative mt-1 w-full max-w-5xl overflow-hidden rounded-[20px] border border-border bg-surface shadow-hard sm:mt-4 sm:rounded-[32px]"
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
          <div className="max-h-[calc(100dvh-0.5rem)] overflow-y-auto p-3 pt-14 sm:max-h-[calc(100dvh-2rem)] sm:p-6 sm:pt-16">
            {children}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
