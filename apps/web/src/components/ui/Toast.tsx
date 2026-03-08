'use client';

import { createContext, PropsWithChildren, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

type ToastVariant = 'default' | 'success' | 'error' | 'info';
type ToastInput =
  | string
  | {
      title?: string;
      message: string;
      variant?: ToastVariant;
      actionLabel?: string;
      onAction?: () => void;
      durationMs?: number;
    };

type ToastItem = {
  id: number;
  title?: string;
  message: string;
  variant: ToastVariant;
  actionLabel?: string;
  onAction?: () => void;
};

const ToastContext = createContext<{ show: (toast: ToastInput) => void } | null>(null);

function normalizeToast(input: ToastInput): Omit<ToastItem, 'id'> & { durationMs: number } {
  if (typeof input === 'string') {
    return {
      message: input,
      variant: 'default',
      durationMs: 2500,
    };
  }
  return {
    title: input.title,
    message: input.message,
    variant: input.variant ?? 'default',
    actionLabel: input.actionLabel,
    onAction: input.onAction,
    durationMs: input.durationMs ?? 3200,
  };
}

function variantClassName(variant: ToastVariant) {
  switch (variant) {
    case 'success':
      return 'border-[hsl(var(--color-success)/0.26)] bg-[hsl(var(--color-surface)/0.94)]';
    case 'error':
      return 'border-[hsl(var(--color-danger)/0.28)] bg-[hsl(var(--color-surface)/0.94)]';
    case 'info':
      return 'border-[hsl(var(--color-accent)/0.28)] bg-[hsl(var(--color-surface)/0.94)]';
    default:
      return 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.94)]';
  }
}

function VariantIcon({ variant }: { variant: ToastVariant }) {
  switch (variant) {
    case 'success':
      return <CheckCircle2 className="h-4 w-4 text-[hsl(var(--color-success))]" />;
    case 'error':
      return <AlertCircle className="h-4 w-4 text-[hsl(var(--color-danger))]" />;
    case 'info':
      return <Info className="h-4 w-4 text-[hsl(var(--color-accent))]" />;
    default:
      return <Info className="h-4 w-4 text-muted" />;
  }
}

export function ToastProvider({ children }: PropsWithChildren) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((input: ToastInput) => {
    const toast = normalizeToast(input);
    const id = Date.now();
    setItems((prev) => [...prev, { id, ...toast }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((item) => item.id !== id));
    }, toast.durationMs);
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-40 space-y-2 px-4 sm:px-0">
        {items.map((item) => (
          <div
            key={item.id}
            className={`w-full max-w-sm rounded-[20px] border px-4 py-3 text-sm text-text shadow-[var(--shadow-hard)] backdrop-blur-xl sm:min-w-[320px] ${variantClassName(item.variant)}`}
          >
            <div className="flex items-start gap-3">
              <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.68)]">
                <VariantIcon variant={item.variant} />
              </span>
              <div className="min-w-0 flex-1">
                {item.title ? <p className="text-sm font-semibold text-text">{item.title}</p> : null}
                <p className={`text-sm ${item.title ? 'mt-1 text-muted' : 'text-text'}`}>{item.message}</p>
                {item.actionLabel && item.onAction ? (
                  <button
                    type="button"
                    onClick={() => {
                      item.onAction?.();
                      remove(item.id);
                    }}
                    className="mt-2 text-sm font-semibold text-[hsl(var(--color-accent))]"
                  >
                    {item.actionLabel}
                  </button>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-[hsl(var(--color-bg)/0.7)] hover:text-text"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside ToastProvider');
  }
  return ctx;
}
