'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
  show: (titleOrOptions: string | { title?: string; message?: string; type?: ToastType; variant?: 'success' | 'error' | 'warning' | 'info'; duration?: number; durationMs?: number; celebrate?: boolean; actionLabel?: string; onAction?: () => void }, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const duration = toast.duration ?? 4000;

    setToasts((prev) => [...prev, { ...toast, id, duration }]);

    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  const show = useCallback(
    (titleOrOptions: string | { title?: string; message?: string; type?: ToastType; variant?: 'success' | 'error' | 'warning' | 'info'; duration?: number; durationMs?: number; celebrate?: boolean; actionLabel?: string; onAction?: () => void }, message?: string) => {
      let title: string;
      let msg: string | undefined;
      let type: ToastType = 'info';
      let duration: number | undefined;
      let actionLabel: string | undefined;
      let onAction: (() => void) | undefined;

      if (typeof titleOrOptions === 'string') {
        title = titleOrOptions;
        msg = message;
      } else {
        title = titleOrOptions.title || 'Notification';
        msg = titleOrOptions.message;
        type = titleOrOptions.type ?? (titleOrOptions.variant as ToastType) ?? 'info';
        duration = titleOrOptions.duration ?? (titleOrOptions.durationMs ? titleOrOptions.durationMs : undefined);
        actionLabel = titleOrOptions.actionLabel;
        onAction = titleOrOptions.onAction;
        
        // celebrate is for celebration toasts, typically success
        if (titleOrOptions.celebrate) {
          type = 'success';
          duration = duration ?? 5000; // Slightly longer for celebrations
        }
      }

      addToast({
        type,
        title,
        message: msg,
        duration: duration ?? 4000,
        actionLabel,
        onAction,
      });
    },
    [addToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, show }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed top-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const borderColor =
    toast.type === 'success'
      ? 'hsl(var(--color-success))'
      : toast.type === 'error'
        ? 'hsl(var(--color-error))'
        : toast.type === 'warning'
          ? 'hsl(var(--color-warning))'
          : 'hsl(var(--color-accent-cyan))';

  const icon =
    toast.type === 'success' ? (
      <CheckCircle className="h-5 w-5" style={{ color: borderColor }} />
    ) : toast.type === 'error' ? (
      <AlertCircle className="h-5 w-5" style={{ color: borderColor }} />
    ) : toast.type === 'warning' ? (
      <AlertTriangle className="h-5 w-5" style={{ color: borderColor }} />
    ) : (
      <Info className="h-5 w-5" style={{ color: borderColor }} />
    );

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 100 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 100 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className="pointer-events-auto"
      style={{
        background: `hsl(var(--glass-bg-strong))`,
        backdropFilter: `blur(var(--glass-blur))`,
        border: `1px solid hsl(var(--glass-border))`,
        borderLeft: `4px solid ${borderColor}`,
        borderRadius: `var(--radius-lg)`,
        boxShadow: `var(--shadow-lg)`,
        padding: '1rem',
        minWidth: '320px',
        maxWidth: '420px',
      }}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 pt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm" style={{ color: `hsl(var(--color-text))` }}>
            {toast.title}
          </p>
          {toast.message && (
            <p className="text-sm mt-1" style={{ color: `hsl(var(--color-text-secondary))` }}>
              {toast.message}
            </p>
          )}
          {toast.actionLabel && toast.onAction && (
            <button
              onClick={toast.onAction}
              className="text-xs font-semibold mt-2 hover:opacity-80 transition-opacity"
              style={{ color: borderColor }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
        <button
          onClick={() => onRemove(toast.id)}
          className="flex-shrink-0 p-1 hover:opacity-70 transition-opacity"
          style={{ color: `hsl(var(--color-muted))` }}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </motion.div>
  );
}
