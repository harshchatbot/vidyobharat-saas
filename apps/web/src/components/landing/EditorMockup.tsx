'use client';

import { motion } from 'framer-motion';

export function EditorMockup() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-4 shadow-soft sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">RangManch AI Video Editor</p>
          <p className="text-xs text-[hsl(var(--color-muted))]">Template: Business Explainer · Voice: Hindi Female</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-1 text-xs text-[hsl(var(--color-muted))]">
          Render: 86%
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.1 }}
          className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted))]">Script</p>
          <p className="text-sm leading-7 text-[hsl(var(--color-text))]">
            Bharat&apos;s next growth story is being written by creators, educators, and entrepreneurs who speak every
            language. With RangManch AI, turn your message into a polished video with smart scenes, captions, and
            native-sounding narration.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 16 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.45, ease: 'easeOut', delay: 0.15 }}
          className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4"
        >
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--color-muted))]">Preview</p>
          <video
            className="h-52 w-full rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] object-cover"
            src="/videos/samples/hindi-festival-9x16.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
          />
          <div className="mt-3 grid grid-cols-3 gap-2">
            <div className="h-10 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]" />
            <div className="h-10 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]" />
            <div className="h-10 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]" />
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
