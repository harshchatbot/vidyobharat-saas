'use client';

import { motion } from 'framer-motion';

const steps = [
  {
    id: '01',
    title: 'Write or paste your script',
    text: 'Choose language, voice, and template that match your audience and objective.',
  },
  {
    id: '02',
    title: 'Generate with AI + templates',
    text: 'VidyoBharat combines structured scene templates with optional AI b-roll.',
  },
  {
    id: '03',
    title: 'Export and publish fast',
    text: 'Get captioned videos in 9:16 and 16:9 ready for social, ads, and websites.',
  },
];

export function WorkflowSection() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">
          From prompt to publish in three steps.
        </h2>
        <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
          A reliable production flow built for teams that need speed without sacrificing quality.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step, index) => (
          <motion.article
            key={step.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: 0.08 * index, ease: 'easeOut' }}
            className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 shadow-soft"
          >
            <p className="mb-3 text-xs font-bold text-[hsl(var(--color-accent))]">{step.id}</p>
            <h3 className="text-base font-semibold text-[hsl(var(--color-text))]">{step.title}</h3>
            <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">{step.text}</p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
