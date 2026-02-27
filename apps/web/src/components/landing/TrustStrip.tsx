'use client';

import { motion } from 'framer-motion';

const brands = ['EduScale', 'RetailRise', 'FinUp', 'HealthBridge', 'CreatorHive', 'BharatAds'];

export function TrustStrip() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5"
    >
      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-muted))]">
        Trusted by growth teams and creators
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {brands.map((brand) => (
          <div
            key={brand}
            className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-center text-xs font-semibold text-[hsl(var(--color-text))]"
          >
            {brand}
          </div>
        ))}
      </div>
    </motion.section>
  );
}
