'use client';

/**
 * SceneCard — TOW Visual Storyboard frame card
 *
 * Displays a 9:16 scene image with scene metadata and approve/reject actions.
 * All colors from hsl(var(--color-*)); fonts: Sora (headings), Manrope (body).
 * Light + dark mode via CSS variables — no JS theme detection needed.
 */

import React, { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type SceneApprovalState = 'pending' | 'approved' | 'rejected';

export type SceneType = 'hook' | 'problem' | 'proof' | 'cta' | string;

export interface SceneCardProps {
  /** 1-based scene index */
  sceneNumber: number;
  /** Semantic type: hook, problem, proof, cta, etc. */
  sceneType: SceneType;
  /** VO / dialogue line shown below the image */
  spokenLine: string;
  /** URL of the generated frame; null = not yet generated */
  imageUrl?: string | null;
  /** Current approval state for this scene */
  approvalState?: SceneApprovalState;
  /** Called when the user clicks Approve */
  onApprove: () => void;
  /** Called when the user submits rejection feedback */
  onReject: (feedback: string) => void;
  /** Disable all actions (e.g. during a bulk operation) */
  disabled?: boolean;
  /** Optional extra class on the root */
  className?: string;
}

// ── Scene type → visual accent mapping ────────────────────────────────────────

/** Returns inline-style background for a scene-type pill using theme vars */
function typeStyle(type: SceneType): React.CSSProperties {
  switch (type) {
    case 'hook':     return { background: 'hsl(var(--color-accent) / 0.9)' };
    case 'problem':  return { background: 'hsl(var(--color-danger) / 0.82)' };
    case 'proof':    return { background: 'hsl(var(--color-success) / 0.82)' };
    case 'cta':      return { background: 'hsl(var(--color-accent) / 0.72)' };
    default:         return { background: 'hsl(var(--color-muted) / 0.55)' };
  }
}

const TYPE_LABELS: Record<string, string> = {
  hook: 'Hook', problem: 'Problem', proof: 'Proof', cta: 'CTA',
};

// ── Component ──────────────────────────────────────────────────────────────────

export function SceneCard({
  sceneNumber,
  sceneType,
  spokenLine,
  imageUrl,
  approvalState = 'pending',
  onApprove,
  onReject,
  disabled = false,
  className = '',
}: SceneCardProps) {
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedback, setFeedback] = useState('');

  const handleRejectSubmit = () => {
    if (!feedback.trim()) return;
    onReject(feedback.trim());
    setFeedback('');
    setShowFeedback(false);
  };

  const handleRejectCancel = () => {
    setFeedback('');
    setShowFeedback(false);
  };

  return (
    <article
      className={`glass-card rounded-[var(--radius-lg)] overflow-hidden transition-all duration-200 ease-out ${
        approvalState === 'approved'
          ? 'ring-1 ring-[hsl(var(--color-success)/0.6)]'
          : approvalState === 'rejected'
          ? 'ring-1 ring-[hsl(var(--color-danger)/0.5)]'
          : ''
      } ${className}`}
      style={{ boxShadow: 'var(--shadow-float)' }}
    >
      {/* ── 9:16 Image Frame ─────────────────────────────────────────────── */}
      <div className="relative w-full" style={{ aspectRatio: '9 / 16', maxHeight: '420px' }}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={`Scene ${sceneNumber}`}
            className="absolute inset-0 w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          /* Placeholder when image is not yet generated */
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{ background: 'hsl(var(--color-elevated))' }}
          >
            <span
              className="text-4xl rangmanch-loader-glow"
              role="img"
              aria-label="Generating"
            >
              🎬
            </span>
            <span
              className="text-xs font-sans"
              style={{ color: 'hsl(var(--color-muted))' }}
            >
              Frame not generated
            </span>
          </div>
        )}

        {/* Scene number badge — top-left */}
        <div
          className="absolute top-3 left-3 min-w-[2rem] min-h-[2rem] flex items-center justify-center rounded-full px-2 text-xs font-bold font-heading backdrop-blur-sm"
          style={{
            background: 'hsl(var(--color-text) / 0.72)',
            color: 'hsl(var(--color-bg))',
          }}
          aria-label={`Scene ${sceneNumber}`}
        >
          {sceneNumber}
        </div>

        {/* Type tag — top-right */}
        <div
          className="absolute top-3 right-3 px-2.5 py-0.5 rounded-full text-[11px] font-semibold font-heading backdrop-blur-sm"
          style={{
            ...typeStyle(sceneType),
            color: 'hsl(var(--color-accent-contrast))',
          }}
        >
          {TYPE_LABELS[sceneType] ?? sceneType}
        </div>

        {/* Approval ribbon — bottom */}
        {approvalState !== 'pending' && (
          <div
            className="absolute bottom-0 inset-x-0 py-1.5 text-center text-xs font-semibold font-heading backdrop-blur-sm"
            style={{
              background:
                approvalState === 'approved'
                  ? 'hsl(var(--color-success) / 0.88)'
                  : 'hsl(var(--color-danger) / 0.82)',
              color: 'hsl(var(--color-accent-contrast))',
            }}
          >
            {approvalState === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </div>
        )}
      </div>

      {/* ── Card Body ────────────────────────────────────────────────────── */}
      <div className="p-4 space-y-4">
        {/* Spoken line */}
        <p
          className="text-sm font-sans leading-relaxed italic border-l-2 pl-3"
          style={{
            color: 'hsl(var(--color-text))',
            borderColor: 'hsl(var(--color-accent) / 0.5)',
          }}
        >
          &ldquo;{spokenLine}&rdquo;
        </p>

        {/* Rejection feedback textarea (conditional) */}
        {showFeedback ? (
          <div className="space-y-2">
            <label
              className="block text-[11px] font-semibold uppercase tracking-wider font-heading"
              style={{ color: 'hsl(var(--color-danger))' }}
            >
              What should change?
            </label>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Describe the issue or required change…"
              rows={3}
              className="w-full rounded-[var(--radius-md)] px-3 py-2 text-sm font-sans resize-none outline-none transition-all duration-200 ease-out"
              style={{
                background: 'hsl(var(--color-bg-soft))',
                border: '1px solid hsl(var(--color-danger) / 0.5)',
                color: 'hsl(var(--color-text))',
              }}
              onFocus={(e) =>
                (e.currentTarget.style.borderColor = 'hsl(var(--color-danger))')
              }
              onBlur={(e) =>
                (e.currentTarget.style.borderColor = 'hsl(var(--color-danger) / 0.5)')
              }
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={handleRejectSubmit}
                disabled={!feedback.trim()}
                className="flex-1 min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
                style={{
                  background: 'hsl(var(--color-danger))',
                  color: 'hsl(var(--color-accent-contrast))',
                }}
              >
                Submit Feedback
              </button>
              <button
                onClick={handleRejectCancel}
                className="flex-1 min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out"
                style={{
                  background: 'hsl(var(--color-bg-soft))',
                  border: '1px solid hsl(var(--color-border))',
                  color: 'hsl(var(--color-text))',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          /* Primary action buttons */
          <div className="flex gap-2">
            <button
              onClick={onApprove}
              disabled={disabled || approvalState === 'approved'}
              aria-label={`Approve scene ${sceneNumber}`}
              className="flex-1 min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'hsl(var(--color-success))',
                color: 'hsl(var(--color-accent-contrast))',
              }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => setShowFeedback(true)}
              disabled={disabled}
              aria-label={`Reject scene ${sceneNumber}`}
              className="flex-1 min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'hsl(var(--color-danger))',
                color: 'hsl(var(--color-accent-contrast))',
              }}
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export default SceneCard;
