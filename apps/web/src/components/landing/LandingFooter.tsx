'use client';

import { motion } from 'framer-motion';

export function LandingFooter() {
  return (
    <motion.footer
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.35 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-soft"
    >
      <div className="grid items-start gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">VidyoBharat</p>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">India-first hybrid text-to-video platform.</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Product</p>
          <ul className="mt-2 space-y-1 text-sm text-[hsl(var(--color-muted))]">
            <li>Templates, AI b-roll, captions, exports.</li>
            <li>Languages, voiceovers, project workflows.</li>
          </ul>
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Company</p>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">About</p>
          <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">Contact</p>
          <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">Privacy</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Support</p>
          <ul className="mt-2 space-y-1 text-sm text-[hsl(var(--color-muted))]">
            <li>Help Center</li>
            <li>Status</li>
            <li>Email Support</li>
          </ul>
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-3 border-t border-[hsl(var(--color-border))] pt-4 text-xs text-[hsl(var(--color-muted))] sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} VidyoBharat. All rights reserved.</p>
        <span className="inline-flex w-fit rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1 font-medium text-[hsl(var(--color-text))]">
          Made with ❤️ in India
        </span>
      </div>
    </motion.footer>
  );
}
