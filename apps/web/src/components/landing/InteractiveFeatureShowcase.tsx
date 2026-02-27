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
    key: 'avatars',
    title: 'AI Avatars',
    subtitle: 'Create presenter-style videos with expressive avatar scenes and regional voice adaptation.',
    preview: '/videos/samples/english-startup-16x9.mp4',
  },
  {
    key: 'broll',
    title: 'B-Roll Engine',
    subtitle: 'Auto-select context-aware supporting visuals that fit script mood and timing.',
    preview: '/videos/samples/hindi-festival-9x16.mp4',
  },
  {
    key: 'script',
    title: 'Script-to-Video',
    subtitle: 'Turn plain text into polished video scenes with captions, narration, and music.',
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
              Explore the core workflows powering VidyoBharat.
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
