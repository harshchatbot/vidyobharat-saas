'use client';

/**
 * CreditBar — RangManchAI fixed-bottom credit transparency bar
 *
 * Sticky bottom bar that shows the credit cost of the NEXT action,
 * current balance, and projected balance after deduction.
 * The confirm button MUST be clicked by the user — no auto-deduction.
 *
 * Colors: hsl(var(--color-*)); fonts: Sora (heading) + Manrope (body).
 * Light + dark via CSS vars — no JS theme detection.
 */

import React from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface CreditBarProps {
  /** Cost of the next operation (credits to be deducted) */
  nextActionCost: number;
  /** Label for what the next action does */
  nextActionLabel: string;
  /** User's current credit balance */
  currentBalance: number;
  /** Called when the user confirms the action */
  onConfirm: () => void;
  /** Loading state — replaces button label with spinner */
  loading?: boolean;
  /** Disable the confirm button (e.g. validation not met) */
  disabled?: boolean;
  /** Optional extra class on the root */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return n.toLocaleString();
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CreditBar({
  nextActionCost,
  nextActionLabel,
  currentBalance,
  onConfirm,
  loading = false,
  disabled = false,
  className = '',
}: CreditBarProps) {
  const afterBalance = currentBalance - nextActionCost;
  const insufficient = afterBalance < 0;
  const isDisabled = disabled || loading || insufficient;

  return (
    <div
      role="region"
      aria-label="Credit cost summary"
      className={`fixed bottom-0 inset-x-0 z-50 rangmanch-glass-strong ${className}`}
      style={{ boxShadow: 'var(--shadow-cinematic)' }}
    >
      {/* Safe-area padding for notched devices */}
      <div className="max-w-5xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">

        {/* ── Credit breakdown ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 flex-1 min-w-0">

          {/* Next action cost */}
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-xs font-sans"
              style={{ color: 'hsl(var(--color-muted))' }}
            >
              Next step
            </span>
            <span
              className="text-sm font-bold font-heading"
              style={{
                color: insufficient
                  ? 'hsl(var(--color-danger))'
                  : 'hsl(var(--color-text))',
              }}
            >
              {fmt(nextActionCost)} cr
            </span>
          </div>

          {/* Divider */}
          <span
            className="hidden sm:block w-px h-4 self-center"
            style={{ background: 'hsl(var(--color-border))' }}
            aria-hidden="true"
          />

          {/* Current balance */}
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-xs font-sans"
              style={{ color: 'hsl(var(--color-muted))' }}
            >
              Balance
            </span>
            <span
              className="text-sm font-semibold font-heading"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              {fmt(currentBalance)} cr
            </span>
          </div>

          {/* Divider */}
          <span
            className="hidden sm:block w-px h-4 self-center"
            style={{ background: 'hsl(var(--color-border))' }}
            aria-hidden="true"
          />

          {/* After balance */}
          <div className="flex items-baseline gap-1.5">
            <span
              className="text-xs font-sans"
              style={{ color: 'hsl(var(--color-muted))' }}
            >
              After
            </span>
            <span
              className="text-sm font-semibold font-heading transition-colors duration-200 ease-out"
              style={{
                color: insufficient
                  ? 'hsl(var(--color-danger))'
                  : 'hsl(var(--color-success))',
              }}
            >
              {insufficient ? '−' : ''}{fmt(Math.abs(afterBalance))} cr
            </span>
          </div>

          {/* Insufficient credits warning */}
          {insufficient && (
            <span
              className="text-xs font-semibold font-heading px-2 py-0.5 rounded-full"
              style={{
                background: 'hsl(var(--color-danger) / 0.12)',
                color: 'hsl(var(--color-danger))',
                border: '1px solid hsl(var(--color-danger) / 0.25)',
              }}
              role="alert"
            >
              Insufficient credits
            </span>
          )}
        </div>

        {/* ── Confirm button ───────────────────────────────────────────── */}
        <button
          onClick={onConfirm}
          disabled={isDisabled}
          aria-busy={loading}
          className="flex-shrink-0 min-h-[44px] px-6 rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 whitespace-nowrap"
          style={{
            background: insufficient
              ? 'hsl(var(--color-danger))'
              : 'hsl(var(--color-accent))',
            color: 'hsl(var(--color-accent-contrast))',
          }}
        >
          {loading ? (
            <>
              {/* Inline spinner using existing animation */}
              <span
                className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin"
                aria-hidden="true"
              />
              Processing…
            </>
          ) : insufficient ? (
            'Top up credits'
          ) : (
            <>
              {nextActionLabel}
              <span aria-hidden="true">→</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default CreditBar;
