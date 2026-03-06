'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';

type FeatureTab = {
  key: string;
  title: string;
  subtitle: string;
  preview: string;
};

const tabs: FeatureTab[] = [
  {
    key: 'script-assist',
    title: 'AI Script Assist',
    subtitle: 'Generate and enhance scripts from templates, auto-fill title/topic, and keep everything ready for one-click rendering.',
    preview: '/videos/samples/english-startup-16x9.mp4',
  },
  {
    key: 'voice-language',
    title: 'Regional Voice Preview',
    subtitle: 'Preview multilingual voices, translate preview text by language, and choose sample rate before final video generation.',
    preview: '/videos/samples/hindi-festival-9x16.mp4',
  },
  {
    key: 'render-controls',
    title: 'Image-to-Video + Output Controls',
    subtitle: 'Use reference images or pure text, then set ratio, resolution, duration, captions, and background music in one flow.',
    preview: '/videos/samples/tamil-education-9x16.mp4',
  },
];

export function InteractiveFeatureShowcase() {
  const [active, setActive] = useState<FeatureTab>(tabs[0]);

  return (
    <section className="py-24">
      <div className="rounded-[var(--radius-lg)] bg-[hsl(var(--color-surface))] p-6 shadow-soft sm:p-8">
        <div className="grid items-center gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-[hsl(var(--color-text))] sm:text-4xl">
              Featured Video Capabilities
            </h2>
            <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
              Built around the workflows currently live in RangManch AI.
            </p>

            <div className="mt-6 space-y-2">
              {tabs.map((item) => {
                const isActive = active.key === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setActive(item)}
                    className={`w-full rounded-[var(--radius-md)] border px-4 py-3 text-left transition ${
                      isActive
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                        : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]'
                    }`}
                  >
                    <p className="text-sm font-semibold text-[hsl(var(--color-text))]">{item.title}</p>
                    <p className="mt-1 text-xs text-[hsl(var(--color-muted))]">{item.subtitle}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="relative rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
            <AnimatePresence mode="wait">
              <motion.video
                key={active.key}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                className="h-[340px] w-full rounded-[var(--radius-md)] object-cover"
                src={active.preview}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}
