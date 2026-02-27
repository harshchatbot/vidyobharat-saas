'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { motion } from 'framer-motion';

import { HeroVisual } from '@/components/landing/HeroVisual';
import { MrGreenMascot } from '@/components/landing/MrGreenMascot';

type MascotLanguage = 'en' | 'hi' | 'ta';

const mascotSpeechByLanguage: Record<MascotLanguage, string> = {
  en: 'Hi, I am Mr. Green. Turn scripts into polished multilingual videos with speed, clarity, and consistency.',
  hi: 'नमस्ते, मैं Mr Green हूं। अपने स्क्रिप्ट को तेज़ी से प्रोफेशनल वीडियो में बदलें, साफ़ नैरेशन और स्मार्ट विज़ुअल्स के साथ।',
  ta: 'வணக்கம், நான் Mr Green. உங்கள் ஸ்கிரிப்ட்களை வேகமாக, தெளிவாக, தொழில்முறை வீடியோக்களாக மாற்ற உதவுகிறேன்.',
};

const languageLabels: Record<MascotLanguage, string> = {
  en: 'English',
  hi: 'Hindi',
  ta: 'Tamil',
};

export function HeroSection() {
  const [selectedLanguage, setSelectedLanguage] = useState<MascotLanguage>('en');
  const [typedText, setTypedText] = useState('');
  const speechScript = mascotSpeechByLanguage[selectedLanguage];

  useEffect(() => {
    setTypedText('');
    let index = 0;
    const timer = setInterval(() => {
      index += 1;
      setTypedText(speechScript.slice(0, index));
      if (index >= speechScript.length) {
        clearInterval(timer);
      }
    }, 24);
    return () => clearInterval(timer);
  }, [speechScript]);

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

          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.99 }} className="inline-flex">
            <Link
              href="/signup"
              className="shimmer-btn inline-flex rounded-full bg-[hsl(var(--color-accent))] px-8 py-4 text-lg font-bold text-[hsl(var(--color-accent-contrast))] shadow-hard"
            >
              Get Started for Free
            </Link>
          </motion.div>

          <div className="mx-auto inline-flex rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-[hsl(var(--color-muted))] lg:mx-0">
            20+ Indian languages • 9:16 and 16:9 exports
          </div>
        </div>

        <div className="space-y-4">
          <HeroVisual />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.2, ease: 'easeOut' }}
            className="mx-auto w-full max-w-[420px] p-2"
          >
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            {(Object.keys(languageLabels) as MascotLanguage[]).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setSelectedLanguage(lang)}
                className={`rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold transition ${
                  selectedLanguage === lang
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                    : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-muted))]'
                }`}
                aria-pressed={selectedLanguage === lang}
              >
                {languageLabels[lang]}
              </button>
            ))}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mb-5 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3 text-xs font-semibold leading-relaxed text-[hsl(var(--color-text))]"
          >
            {typedText}
            <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse bg-[hsl(var(--color-text)/0.7)] align-[-2px]" />
          </motion.div>
          <MrGreenMascot size="md" className="mx-auto mb-4" />
          <p className="text-center text-sm font-semibold text-[hsl(var(--color-muted))]">
            Meet Mr Green, the VidyoBharat mascot.
          </p>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}
