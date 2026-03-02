'use client';

import { motion } from 'framer-motion';

const useCases = [
  {
    title: 'Ads and Performance Creatives',
    text: 'Generate multiple hooks and format variants for paid campaigns quickly.',
  },
  {
    title: 'Education and Course Content',
    text: 'Turn teaching scripts into clear explainer videos in local languages.',
  },
  {
    title: 'Startup Product Marketing',
    text: 'Build launch videos, feature updates, and social snippets from one script.',
  },
  {
    title: 'Agency Client Delivery',
    text: 'Scale output with reusable templates and faster render workflows.',
  },
];

export function UseCasesSection() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">Use cases that convert.</h2>
        <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">Designed for marketers, educators, founders, and agencies.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {useCases.map((item, index) => (
          <motion.article
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.38, delay: 0.06 * index, ease: 'easeOut' }}
            className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5"
          >
            <h3 className="text-base font-semibold text-[hsl(var(--color-text))]">{item.title}</h3>
            <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">{item.text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
