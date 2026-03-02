import { PropsWithChildren } from 'react';

export function Modal({ open, onClose, children }: PropsWithChildren<{ open: boolean; onClose: () => void }>) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-text/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-hard" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
