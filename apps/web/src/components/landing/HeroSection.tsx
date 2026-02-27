'use client';

import { useState } from 'react';
import Link from 'next/link';

import { motion } from 'framer-motion';

import { HeroAuthCard } from '@/components/landing/HeroAuthCard';
import { HeroVisual } from '@/components/landing/HeroVisual';
import { MrGreenMascot } from '@/components/landing/MrGreenMascot';

type MascotLanguage = 'en' | 'hi' | 'ta';

const speechByLanguage: Record<MascotLanguage, string> = {
  en: 'Mr Green here. Your script is now production-ready for multilingual video.',
  hi: 'Mr Green बोल रहा हूं। आपका स्क्रिप्ट अब मल्टीलिंगुअल वीडियो के लिए तैयार है।',
  ta: 'Mr Green பேசுகிறேன். உங்கள் ஸ்கிரிப்ட் பல மொழி வீடியோவுக்கு தயாராக உள்ளது.',
};

export function HeroSection() {
  const [selectedLanguage, setSelectedLanguage] = useState<MascotLanguage>('en');

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="relative overflow-hidden py-8 sm:py-12"
    >
      <div className="pointer-events-none absolute -left-16 -top-24 h-52 w-52 rounded-full bg-[hsl(var(--color-accent)/0.22)] blur-3xl" />
      <div className="pointer-events-none absolute -right-16 top-16 h-56 w-56 rounded-full bg-[hsl(var(--color-accent)/0.14)] blur-3xl" />

      <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="space-y-6 text-center lg:text-left">
          <p className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1 text-xs font-medium text-[hsl(var(--color-muted))]">
            Hybrid Text-to-Video Engine for India
          </p>
          <h1 className="text-4xl font-extrabold leading-[0.95] tracking-tight text-[hsl(var(--color-accent))] sm:text-6xl lg:text-7xl">
            Create AI Videos in Hindi, Tamil & 20+ Indian Languages.
          </h1>
          <p className="mx-auto max-w-2xl text-base font-medium text-[hsl(var(--color-muted))] sm:text-lg lg:mx-0">
            Transform scripts into high-quality videos with culturally resonant avatars and voices.
          </p>

          <HeroAuthCard />

          <div className="mx-auto flex flex-wrap items-center justify-center gap-2 lg:mx-0 lg:justify-start">
            <span className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-[hsl(var(--color-muted))]">
              20+ Indian languages
            </span>
            <span className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-[hsl(var(--color-muted))]">
              9:16 and 16:9 exports
            </span>
            <span className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-[hsl(var(--color-muted))]">
              AI + template hybrid pipeline
            </span>
          </div>
          <Link href="/signup" className="inline-flex text-sm font-semibold text-[hsl(var(--color-accent))]">
            Explore all templates
          </Link>
        </div>

        <div className="space-y-4">
          <HeroVisual />
          <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-4 shadow-soft">
            <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
              <MrGreenMascot size="sm" className="mx-auto sm:mx-0" />
              <div className="space-y-3">
                <div className="inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs font-semibold text-[hsl(var(--color-text))]">
                  {speechByLanguage[selectedLanguage]}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['en', 'hi', 'ta'] as MascotLanguage[]).map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setSelectedLanguage(lang)}
                      className={`rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold transition ${
                        selectedLanguage === lang
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] text-[hsl(var(--color-muted))]'
                      }`}
                      aria-pressed={selectedLanguage === lang}
                    >
                      {lang === 'en' ? 'English' : lang === 'hi' ? 'Hindi' : 'Tamil'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
