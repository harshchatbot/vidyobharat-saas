'use client';

import { Globe, Video, Zap } from 'lucide-react';
import { motion } from 'framer-motion';

const items = [
  {
    title: 'Multilingual AI',
    description: 'Generate videos in Hindi, Tamil, Telugu, Marathi, and more with localized voice styles.',
    icon: Globe,
  },
  {
    title: 'Smart B-Roll',
    description: 'Auto-select relevant clips and scenes that fit your script context and pacing.',
    icon: Video,
  },
  {
    title: 'Lightning Fast Render',
    description: 'Powered by our custom pipeline for rapid previews and production-ready exports.',
    icon: Zap,
  },
];

export function FeatureBento() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="grid gap-4 md:grid-cols-3"
    >
      {items.map((item) => (
        <motion.article
          key={item.title}
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{
            duration: 0.4,
            ease: 'easeOut',
            delay: item.title === 'Multilingual AI' ? 0.06 : item.title === 'Smart B-Roll' ? 0.12 : 0.18,
          }}
          whileHover={{ y: -4 }}
          className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 shadow-soft"
        >
          <div className="mb-4 inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] p-2 text-[hsl(var(--color-accent))]">
            <item.icon className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <h3 className="mb-2 text-lg font-semibold text-[hsl(var(--color-text))]">{item.title}</h3>
          <p className="text-sm text-[hsl(var(--color-muted))]">{item.description}</p>
        </motion.article>
      ))}
    </motion.section>
  );
}
