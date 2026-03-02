'use client';

import { motion } from 'framer-motion';

const testimonials = [
  {
    quote: 'We reduced video production time from two days to under an hour for regional campaigns.',
    author: 'Aditi Sharma',
    role: 'Marketing Lead, RetailRise',
  },
  {
    quote: 'The Hindi voice quality and caption timing are strong enough for our daily social content.',
    author: 'Vijay Kumar',
    role: 'Growth Manager, EduScale',
  },
  {
    quote: 'Template + AI b-roll made our client delivery far more consistent and predictable.',
    author: 'Shreya Iyer',
    role: 'Founder, CreatorHive Studio',
  },
];

export function TestimonialsSection() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">What teams say</h2>
        <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">Customer voice is a major conversion lever on top AI SaaS pages.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {testimonials.map((item, index) => (
          <motion.blockquote
            key={item.author}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: 0.08 * index, ease: 'easeOut' }}
            className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5"
          >
            <p className="text-sm leading-relaxed text-[hsl(var(--color-text))]">"{item.quote}"</p>
            <footer className="mt-3 text-xs text-[hsl(var(--color-muted))]">
              <span className="font-semibold text-[hsl(var(--color-text))]">{item.author}</span>
              <span> · {item.role}</span>
            </footer>
          </motion.blockquote>
        ))}
      </div>
    </section>
  );
}
