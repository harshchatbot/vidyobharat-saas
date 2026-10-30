'use client';

import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

/** Small entrance transition that becomes an immediate render for reduced motion. */
export function MotionReveal({ children, className, delay = 0 }: RevealProps) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : { duration: 0.25, delay, ease: [0, 0, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}

type StatusTone = 'loading' | 'success' | 'error';

type StatusTransitionProps = {
  tone: StatusTone;
  label: string;
  detail?: string;
  className?: string;
  children?: ReactNode;
};

/** Accessible status surface for real async work; it never implies progress that is not known. */
export function StatusTransition({ tone, label, detail, className = '', children }: StatusTransitionProps) {
  const reduceMotion = useReducedMotion();
  const toneClass = tone === 'success'
    ? 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-100'
    : tone === 'error'
      ? 'border-red-400/25 bg-red-500/[0.08] text-red-100'
      : 'border-amber-400/25 bg-amber-400/[0.06] text-slate-200';

  return (
    <motion.div
      key={`${tone}:${label}`}
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={`rounded-lg border px-3 py-2 text-xs ${toneClass} ${className}`}
      initial={reduceMotion ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2, ease: 'easeOut' }}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${tone === 'success' ? 'bg-emerald-300' : tone === 'error' ? 'bg-red-300' : 'bg-amber-300'}`} />
        <span className="font-medium">{label}</span>
      </span>
      {detail ? <p className="mt-1 pl-3.5 text-[11px] text-slate-400">{detail}</p> : null}
      {children ? <div className="pl-3.5">{children}</div> : null}
    </motion.div>
  );
}

/** Indeterminate progress for transports that do not expose byte-level progress. */
export function IndeterminateProgress({ label = 'Working…', className = '' }: { label?: string; className?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <div className={`space-y-1.5 ${className}`} role="status" aria-live="polite" aria-label={label}>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full w-1/3 rounded-full bg-[hsl(var(--color-accent))]"
          animate={reduceMotion ? { x: 0, opacity: 0.75 } : { x: ['-120%', '320%'], opacity: [0.45, 1, 0.45] }}
          transition={reduceMotion ? { duration: 0 } : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

/** Quiet activity signal for Copilot while the real request is in flight. */
export function AIActivityIndicator({ label = 'AI is preparing your edit…' }: { label?: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <span className="inline-flex items-center gap-2" role="status" aria-live="polite">
      <span className="inline-flex items-end gap-0.5" aria-hidden="true">
        {[0, 1, 2].map((index) => (
          <motion.span
            key={index}
            className="w-1 rounded-full bg-[hsl(var(--color-primary-light))]"
            animate={reduceMotion ? { height: 5, opacity: 0.8 } : { height: [5, 11, 5], opacity: [0.55, 1, 0.55] }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.9, delay: index * 0.12, repeat: Infinity, ease: 'easeInOut' }}
          />
        ))}
      </span>
      <span>{label}</span>
    </span>
  );
}

export function AnimatedStatus({ visible, children }: { visible: boolean; children: ReactNode }) {
  return <AnimatePresence initial={false}>{visible ? <MotionReveal>{children}</MotionReveal> : null}</AnimatePresence>;
}
