'use client';

import { motion } from 'framer-motion';

export function HeroVisual() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 18 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: 0.6, delay: 0.2, ease: 'easeOut' }}
      className="relative mx-auto h-[360px] w-full max-w-[440px]"
    >
      <div className="absolute inset-0 rounded-[36px] bg-[radial-gradient(circle_at_20%_20%,hsl(var(--color-accent)/0.28),transparent_50%)]" />

      <motion.div
        animate={{ rotate: [0, 2.2, -2.2, 0] }}
        transition={{ duration: 8, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        className="absolute left-10 top-8 h-48 w-64 overflow-hidden rounded-[28px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-soft"
      >
        <video className="h-full w-full object-cover" src="/videos/samples/english-startup-16x9.mp4" autoPlay muted loop playsInline preload="metadata" />
      </motion.div>

      <motion.div
        animate={{ rotate: [0, -2.8, 2.8, 0] }}
        transition={{ duration: 9, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay: 0.2 }}
        className="absolute left-2 top-36 h-44 w-60 overflow-hidden rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-soft"
      >
        <video className="h-full w-full object-cover" src="/videos/samples/hindi-festival-9x16.mp4" autoPlay muted loop playsInline preload="metadata" />
      </motion.div>

      <motion.div
        animate={{ rotate: [0, 3, -3, 0] }}
        transition={{ duration: 10, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut', delay: 0.4 }}
        className="absolute right-1 top-24 h-52 w-44 overflow-hidden rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-soft"
      >
        <video className="h-full w-full object-cover" src="/videos/samples/tamil-education-9x16.mp4" autoPlay muted loop playsInline preload="metadata" />
      </motion.div>
    </motion.div>
  );
}
