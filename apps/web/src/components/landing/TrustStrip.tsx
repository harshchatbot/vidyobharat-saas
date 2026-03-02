'use client';

import { useEffect, useRef, useState } from 'react';

import { motion } from 'framer-motion';

const brands = ['EduScale', 'RetailRise', 'FinUp', 'HealthBridge', 'CreatorHive', 'BharatAds'];
const stats = [
  { label: 'Videos Generated', value: 2.4, suffix: 'M+' },
  { label: 'AI Voices Rendered', value: 780, suffix: 'K+' },
  { label: 'Regional Exports Delivered', value: 1.1, suffix: 'M+' },
];

export function TrustStrip() {
  const [animatedValues, setAnimatedValues] = useState<number[]>(() => stats.map(() => 0));
  const [hasAnimated, setHasAnimated] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const target = sectionRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting || hasAnimated) return;
        setHasAnimated(true);
      },
      { threshold: 0.3 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasAnimated]);

  useEffect(() => {
    if (!hasAnimated) return;
    const start = performance.now();
    const durationMs = 1200;

    const frame = (now: number) => {
      const progress = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setAnimatedValues(stats.map((item) => Number((item.value * eased).toFixed(1))));
      if (progress < 1) {
        requestAnimationFrame(frame);
      }
    };

    requestAnimationFrame(frame);
  }, [hasAnimated]);

  return (
    <motion.section
      ref={sectionRef}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="space-y-5"
    >
      <div className="grid gap-3 sm:grid-cols-3">
        {stats.map((item, index) => (
          <div key={item.label} className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-4 py-3">
            <p className="text-2xl font-bold tracking-tight text-[hsl(var(--color-text))]">
              {Number.isInteger(item.value)
                ? Math.round(animatedValues[index]).toLocaleString('en-IN')
                : animatedValues[index].toFixed(1)}
              {item.suffix}
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.08em] text-[hsl(var(--color-muted))]">{item.label}</p>
          </div>
        ))}
      </div>

      <p className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-muted))]">
        Trusted by growth teams and creators worldwide
      </p>

      <div
        className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_20%,black_80%,transparent)]"
        style={{ WebkitMaskImage: 'linear-gradient(to right, transparent, black 20%, black 80%, transparent)' }}
      >
        <motion.div
          animate={{ x: ['0%', '-50%'] }}
          transition={{ duration: 25, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
          className="flex w-max gap-3"
        >
          {[...brands, ...brands].map((brand, index) => (
            <div
              key={`${brand}-${index}`}
              className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-xs font-semibold text-[hsl(var(--color-text))]"
            >
              {brand}
            </div>
          ))}
        </motion.div>
      </div>
    </motion.section>
  );
}
