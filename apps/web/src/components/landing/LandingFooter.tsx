'use client';

import { motion } from 'framer-motion';

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6"
    >
      <div className="grid gap-6 sm:grid-cols-3">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">VidyoBharat</p>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">India-first hybrid text-to-video platform.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Product</p>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">Templates, AI b-roll, captions, exports.</p>
        </div>
        <div className="sm:text-right">
          <span className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1 text-xs font-medium text-[hsl(var(--color-text))]">
            Made with ❤️ in India
          </span>
        </div>
      </div>
    </motion.footer>
  );
}
