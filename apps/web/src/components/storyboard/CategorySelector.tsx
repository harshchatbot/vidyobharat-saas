'use client';

/**
 * CategorySelector — RangManchAI storyboard ad category picker
 *
 * Responsive grid of 7 category cards. Clicking selects; a "Continue" CTA
 * appears once a selection is made.
 * All colors: hsl(var(--color-*)); fonts: Sora (heading) + Manrope (body).
 * Light + dark mode via CSS vars — no JS theme detection needed.
 */

import React, { useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AdCategory =
  | 'ugc_testimonial'
  | 'founder_talking_head'
  | 'problem_solution'
  | 'product_demo_lifestyle'
  | 'inner_monologue'
  | 'cinematic_narration'
  | 'cinematic_broll';

export interface CategorySelectorProps {
  /** Currently selected category (controlled) */
  selected?: AdCategory | null;
  /** Called when the user picks a category */
  onSelect: (category: AdCategory) => void;
  /** Called when the user confirms selection */
  onConfirm: (category: AdCategory) => void;
  /** Disable all cards (e.g. during submission) */
  disabled?: boolean;
  /** Optional extra class on the root */
  className?: string;
}

// ── Category Metadata ──────────────────────────────────────────────────────────

interface CategoryMeta {
  id: AdCategory;
  label: string;
  description: string;
  emoji: string;
  badge: string;
}

const CATEGORIES: CategoryMeta[] = [
  {
    id: 'ugc_testimonial',
    label: 'UGC Testimonial',
    description: 'Real-person review or testimonial, shot selfie-style for authentic feel.',
    emoji: '🎤',
    badge: 'High CTR',
  },
  {
    id: 'founder_talking_head',
    label: 'Founder Story',
    description: 'Founder speaks directly to camera — trust-building and brand authority.',
    emoji: '👤',
    badge: 'Brand Trust',
  },
  {
    id: 'problem_solution',
    label: 'Problem → Solution',
    description: 'Opens with a relatable pain point, then reveals the product as the fix.',
    emoji: '⚡',
    badge: 'Best Performer',
  },
  {
    id: 'product_demo_lifestyle',
    label: 'Product Demo',
    description: 'Hands-on walkthrough of your product in a real-life lifestyle setting.',
    emoji: '🛍️',
    badge: 'eCommerce',
  },
  {
    id: 'inner_monologue',
    label: 'Inner Monologue',
    description: 'Voiceover narrates the customer\'s internal thoughts as they discover the brand.',
    emoji: '💭',
    badge: 'Emotional',
  },
  {
    id: 'cinematic_narration',
    label: 'Cinematic Narration',
    description: 'Premium cinematic visuals with an offscreen narrator — ideal for brand films.',
    emoji: '🎬',
    badge: 'Premium',
  },
  {
    id: 'cinematic_broll',
    label: 'Cinematic B-Roll',
    description: 'Atmospheric B-roll footage montage, no talking head — pure visual storytelling.',
    emoji: '🎞️',
    badge: 'Visual',
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

export function CategorySelector({
  selected,
  onSelect,
  onConfirm,
  disabled = false,
  className = '',
}: CategorySelectorProps) {
  const [hovered, setHovered] = useState<AdCategory | null>(null);

  const handleConfirm = () => {
    if (selected) onConfirm(selected);
  };

  return (
    <div className={`flex flex-col gap-6 ${className}`}>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <h2
          className="text-2xl font-bold font-heading tracking-tight"
          style={{ color: 'hsl(var(--color-text))' }}
        >
          Choose your ad style
        </h2>
        <p
          className="text-sm font-sans"
          style={{ color: 'hsl(var(--color-muted))' }}
        >
          Each style is optimised for a different platform and audience goal.
        </p>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div
        className="grid gap-3"
        style={{
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 280px), 1fr))',
        }}
        role="radiogroup"
        aria-label="Ad category"
      >
        {CATEGORIES.map((cat) => {
          const isSelected = selected === cat.id;
          const isHovered = hovered === cat.id;

          return (
            <button
              key={cat.id}
              role="radio"
              aria-checked={isSelected}
              disabled={disabled}
              onClick={() => onSelect(cat.id)}
              onMouseEnter={() => setHovered(cat.id)}
              onMouseLeave={() => setHovered(null)}
              className="glass-card text-left rounded-[var(--radius-lg)] p-4 flex flex-col gap-3 transition-all duration-200 ease-out disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2"
              style={{
                /* Selected: accent border; hover: slightly stronger border; default: theme border */
                border: isSelected
                  ? '2px solid hsl(var(--color-accent))'
                  : isHovered && !disabled
                  ? '1px solid hsl(var(--color-accent) / 0.4)'
                  : '1px solid hsl(var(--color-border) / 0.72)',
                /* Selected: subtle accent tint behind card */
                background: isSelected
                  ? 'hsl(var(--color-accent) / 0.08)'
                  : undefined,
                transform: isSelected
                  ? 'scale(1.02)'
                  : isHovered && !disabled
                  ? 'scale(1.01)'
                  : 'scale(1)',
                boxShadow: isSelected ? 'var(--shadow-float)' : undefined,
              }}
            >
              {/* Top row: emoji + badge + checkmark */}
              <div className="flex items-start justify-between gap-2">
                {/* Emoji */}
                <span
                  className="text-2xl leading-none select-none"
                  role="img"
                  aria-hidden="true"
                >
                  {cat.emoji}
                </span>

                {/* Right side: badge + checkmark */}
                <div className="flex items-center gap-2">
                  {/* Category badge */}
                  <span
                    className="text-[10px] font-semibold font-heading px-2 py-0.5 rounded-full"
                    style={{
                      background: isSelected
                        ? 'hsl(var(--color-accent) / 0.18)'
                        : 'hsl(var(--color-elevated))',
                      color: isSelected
                        ? 'hsl(var(--color-accent))'
                        : 'hsl(var(--color-muted))',
                      border: isSelected
                        ? '1px solid hsl(var(--color-accent) / 0.3)'
                        : '1px solid hsl(var(--color-border) / 0.5)',
                    }}
                  >
                    {cat.badge}
                  </span>

                  {/* Selection checkmark — visible only when selected */}
                  <span
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold transition-all duration-200 ease-out"
                    style={{
                      background: isSelected
                        ? 'hsl(var(--color-accent))'
                        : 'hsl(var(--color-border) / 0.4)',
                      color: isSelected
                        ? 'hsl(var(--color-accent-contrast))'
                        : 'transparent',
                      border: isSelected
                        ? 'none'
                        : '1.5px solid hsl(var(--color-border))',
                      opacity: isSelected ? 1 : 0.5,
                    }}
                    aria-hidden="true"
                  >
                    {isSelected ? '✓' : ''}
                  </span>
                </div>
              </div>

              {/* Category label */}
              <div className="space-y-1">
                <p
                  className="text-sm font-semibold font-heading leading-snug"
                  style={{
                    color: isSelected
                      ? 'hsl(var(--color-accent))'
                      : 'hsl(var(--color-text))',
                  }}
                >
                  {cat.label}
                </p>

                {/* Description — 2-line clamp */}
                <p
                  className="text-xs font-sans leading-relaxed"
                  style={{
                    color: 'hsl(var(--color-muted))',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {cat.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Confirm CTA ────────────────────────────────────────────────────── */}
      <div
        className="transition-all duration-200 ease-out"
        style={{ opacity: selected ? 1 : 0, pointerEvents: selected ? 'auto' : 'none' }}
        aria-hidden={!selected}
      >
        <button
          onClick={handleConfirm}
          disabled={disabled || !selected}
          className="w-full min-h-[44px] rounded-[var(--radius-md)] text-sm font-semibold font-heading transition-all duration-200 ease-out hover:brightness-105 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: 'hsl(var(--color-accent))',
            color: 'hsl(var(--color-accent-contrast))',
          }}
        >
          {selected
            ? `Continue with ${CATEGORIES.find((c) => c.id === selected)?.label ?? selected} →`
            : 'Select a style to continue'}
        </button>
      </div>
    </div>
  );
}

export default CategorySelector;
