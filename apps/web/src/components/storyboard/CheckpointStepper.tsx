'use client';

/**
 * CheckpointStepper — RangManchAI storyboard approval pipeline stepper
 *
 * Vertical 4-step stepper showing the user's current position in the
 * storyboard approval workflow. Three visual states:
 *   • done    — success circle + ✓ icon, label struck through
 *   • active  — accent circle + rangmanch-tabla-pulse animation
 *   • pending — muted empty circle
 *
 * Colors: hsl(var(--color-*)); fonts: Sora (heading) + Manrope (body).
 * Light + dark via CSS vars — no JS theme detection.
 */

import React from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type StepState = 'done' | 'active' | 'pending';

export interface Step {
  id: string;
  label: string;
  description?: string;
}

export interface CheckpointStepperProps {
  steps: Step[];
  /** id of the currently active step */
  activeStepId: string;
  /** ids of completed steps */
  completedStepIds?: string[];
  /** Optional extra class on the root */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveState(
  step: Step,
  activeStepId: string,
  completedStepIds: string[],
): StepState {
  if (completedStepIds.includes(step.id)) return 'done';
  if (step.id === activeStepId) return 'active';
  return 'pending';
}

// ── Sub-components ─────────────────────────────────────────────────────────────

interface StepIndicatorProps {
  state: StepState;
  index: number;
}

function StepIndicator({ state, index }: StepIndicatorProps) {
  const base =
    'relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200 ease-out';

  if (state === 'done') {
    return (
      <span
        className={base}
        style={{
          background: 'hsl(var(--color-success))',
          boxShadow: '0 0 0 3px hsl(var(--color-success) / 0.18)',
        }}
        aria-hidden="true"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2.5 7L5.5 10L11.5 4"
            stroke="hsl(var(--color-accent-contrast))"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    );
  }

  if (state === 'active') {
    return (
      <span
        className={`${base} rangmanch-tabla-pulse`}
        style={{
          background: 'hsl(var(--color-accent))',
          boxShadow: '0 0 0 3px hsl(var(--color-accent) / 0.22)',
        }}
        aria-hidden="true"
      >
        <span
          className="text-[11px] font-bold font-heading"
          style={{ color: 'hsl(var(--color-accent-contrast))' }}
        >
          {index + 1}
        </span>
      </span>
    );
  }

  // pending
  return (
    <span
      className={base}
      style={{
        background: 'hsl(var(--color-elevated))',
        border: '2px solid hsl(var(--color-border))',
      }}
      aria-hidden="true"
    >
      <span
        className="text-[11px] font-medium font-heading"
        style={{ color: 'hsl(var(--color-muted))' }}
      >
        {index + 1}
      </span>
    </span>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export function CheckpointStepper({
  steps,
  activeStepId,
  completedStepIds = [],
  className = '',
}: CheckpointStepperProps) {
  return (
    <nav
      aria-label="Approval checkpoints"
      className={`rangmanch-matte-surface rounded-[var(--radius-lg)] p-5 ${className}`}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-widest font-heading mb-4"
        style={{ color: 'hsl(var(--color-muted))' }}
      >
        Progress
      </p>

      <ol className="relative flex flex-col gap-0">
        {steps.map((step, idx) => {
          const state = resolveState(step, activeStepId, completedStepIds);
          const isLast = idx === steps.length - 1;

          return (
            <li key={step.id} className="relative flex gap-3">
              {/* ── Connector line (left gutter) ─────────────────────────── */}
              <div className="flex flex-col items-center">
                <StepIndicator state={state} index={idx} />

                {/* Vertical line between steps */}
                {!isLast && (
                  <span
                    className="flex-1 w-px mt-1 mb-1"
                    style={{
                      background:
                        state === 'done'
                          ? 'hsl(var(--color-success) / 0.35)'
                          : 'hsl(var(--color-border) / 0.6)',
                      minHeight: '20px',
                    }}
                    aria-hidden="true"
                  />
                )}
              </div>

              {/* ── Step content ─────────────────────────────────────────── */}
              <div
                className={`pb-5 pt-1 min-w-0 ${isLast ? 'pb-0' : ''}`}
                style={{ flex: 1 }}
              >
                <p
                  className="text-sm font-semibold font-heading leading-snug transition-all duration-200 ease-out"
                  style={{
                    color:
                      state === 'active'
                        ? 'hsl(var(--color-accent))'
                        : state === 'done'
                        ? 'hsl(var(--color-success))'
                        : 'hsl(var(--color-muted))',
                    textDecoration: state === 'done' ? 'line-through' : 'none',
                    textDecorationColor: 'hsl(var(--color-success) / 0.5)',
                  }}
                >
                  {step.label}
                </p>

                {step.description && state !== 'done' && (
                  <p
                    className="text-xs font-sans leading-relaxed mt-0.5"
                    style={{ color: 'hsl(var(--color-muted))' }}
                  >
                    {step.description}
                  </p>
                )}

                {/* Active state badge */}
                {state === 'active' && (
                  <span
                    className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold font-heading"
                    style={{
                      background: 'hsl(var(--color-accent) / 0.12)',
                      color: 'hsl(var(--color-accent))',
                      border: '1px solid hsl(var(--color-accent) / 0.25)',
                    }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full rangmanch-tabla-pulse"
                      style={{ background: 'hsl(var(--color-accent))' }}
                      aria-hidden="true"
                    />
                    In progress
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ── Default step config for the storyboard pipeline ───────────────────────────

export const STORYBOARD_STEPS: Step[] = [
  {
    id: 'script',
    label: 'Script',
    description: 'Review and approve the generated ad script.',
  },
  {
    id: 'storyboard',
    label: 'Storyboard',
    description: 'Approve each scene frame and spoken line.',
  },
  {
    id: 'images',
    label: 'Base Images',
    description: 'Approve generated reference images per scene.',
  },
  {
    id: 'production',
    label: 'Production',
    description: 'Voice, video, lipsync — final video generated.',
  },
];

export default CheckpointStepper;
