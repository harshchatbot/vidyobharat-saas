'use client';

/**
 * ApprovalModal — RangManchAI confirmation dialog for irreversible actions
 *
 * Rendered as a portal-style overlay with:
 *   • backdrop-blur-xl + bg-black/60 backdrop
 *   • .rangmanch-glass-strong body card
 *   • scale(0.95→1) + opacity(0→1) entrance at 200ms ease-out
 *   • Primary (accent) + Secondary (glass) action buttons
 *   • Closes on backdrop click or Escape key
 *
 * Colors: hsl(var(--color-*)); fonts: Sora (heading) + Manrope (body).
 * Light + dark via CSS vars — no JS theme detection.
 */

import React, { useEffect, useCallback, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type ModalVariant = 'default' | 'danger' | 'success';

export interface ApprovalModalProps {
  /** Whether the modal is open */
  open: boolean;
  /** Short title shown at the top */
  title: string;
  /** Body copy explaining what will happen */
  description?: string;
  /** Visual variant — affects accent color of primary button */
  variant?: ModalVariant;
  /** Label for the confirm/primary button */
  confirmLabel?: string;
  /** Label for the cancel/secondary button */
  cancelLabel?: string;
  /** Loading state on the primary button */
  loading?: boolean;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels or closes the modal */
  onCancel: () => void;
  /** Optional icon (emoji or element) shown above the title */
  icon?: React.ReactNode;
  /** Optional extra content rendered inside the card */
  children?: React.ReactNode;
  /** Optional extra class on the card */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function variantColor(variant: ModalVariant): string {
  switch (variant) {
    case 'danger':  return 'hsl(var(--color-danger))';
    case 'success': return 'hsl(var(--color-success))';
    default:        return 'hsl(var(--color-accent))';
  }
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ApprovalModal({
  open,
  title,
  description,
  variant = 'default',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  onConfirm,
  onCancel,
  icon,
  children,
  className = '',
}: ApprovalModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // ── Close on Escape key ────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onCancel();
    },
    [open, onCancel],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // ── Focus trap: move focus into modal when it opens ────────────────────────
  useEffect(() => {
    if (open) {
      // Small delay so CSS transition doesn't fight focus ring
      const t = setTimeout(() => confirmBtnRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [open]);

  // ── Prevent scroll on body while open ─────────────────────────────────────
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  if (!open) return null;

  const primaryColor = variantColor(variant);

  return (
    /* ── Backdrop ──────────────────────────────────────────────────────── */
    <div
      role="presentation"
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{
        backdropFilter: 'blur(12px)',
        background: 'hsl(220 35% 8% / 0.6)',
        // Fade in
        animation: 'rangmanchModalFadeIn 200ms ease-out forwards',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      {/* ── Card ─────────────────────────────────────────────────────────── */}
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-modal-title"
        aria-describedby={description ? 'approval-modal-desc' : undefined}
        className={`rangmanch-glass-strong rounded-[var(--radius-lg)] w-full max-w-md p-6 flex flex-col gap-5 ${className}`}
        style={{
          // Scale + fade entrance
          animation: 'rangmanchModalSlideIn 200ms ease-out forwards',
        }}
      >
        {/* Icon */}
        {icon && (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl mx-auto"
            style={{
              background: `${primaryColor.replace(')', ' / 0.12)').replace('hsl(', 'hsl(')}`,
              border: `1px solid ${primaryColor.replace(')', ' / 0.25)').replace('hsl(', 'hsl(')}`,
            }}
            aria-hidden="true"
          >
            {icon}
          </div>
        )}

        {/* Title */}
        <h2
          id="approval-modal-title"
          className="text-lg font-bold font-heading text-center leading-snug"
          style={{ color: 'hsl(var(--color-text))' }}
        >
          {title}
        </h2>

        {/* Description */}
        {description && (
          <p
            id="approval-modal-desc"
            className="text-sm font-sans text-center leading-relaxed"
            style={{ color: 'hsl(var(--color-muted))' }}
          >
            {description}
          </p>
        )}

        {/* Optional extra content */}
        {children && (
          <div
            className="rounded-[var(--radius-md)] p-3"
            style={{
              background: 'hsl(var(--color-bg-soft))',
              border: '1px solid hsl(var(--color-border) / 0.6)',
            }}
          >
            {children}
          </div>
        )}

        {/* ── Actions ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {/* Primary / confirm */}
          <button
            ref={confirmBtnRef}
            onClick={onConfirm}
            disabled={loading}
            aria-busy={loading}
            className="flex-1 min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{
              background: primaryColor,
              color: 'hsl(var(--color-accent-contrast))',
            }}
          >
            {loading ? (
              <>
                <span
                  className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                  aria-hidden="true"
                />
                Processing…
              </>
            ) : (
              confirmLabel
            )}
          </button>

          {/* Secondary / cancel */}
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'hsl(var(--color-bg-soft))',
              border: '1px solid hsl(var(--color-border))',
              color: 'hsl(var(--color-text))',
            }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>

      {/* ── Keyframe injections ───────────────────────────────────────────── */}
      <style>{`
        @keyframes rangmanchModalFadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes rangmanchModalSlideIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
      `}</style>
    </div>
  );
}

export default ApprovalModal;
