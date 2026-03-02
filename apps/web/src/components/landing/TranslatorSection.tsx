'use client';

import { motion } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

const languages = ['Hindi', 'Tamil', 'Bengali'] as const;

export function TranslatorSection() {
  const [selectedLanguage, setSelectedLanguage] = useState<(typeof languages)[number]>('Hindi');

  return (
    <section className="py-24">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-soft">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--color-muted))]">AI Video Translator</p>
          <div
            className="mt-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] p-4"
            style={{
              backgroundImage:
                'radial-gradient(circle at 20% 20%, hsl(var(--color-accent) / 0.18), transparent 45%), url(https://images.unsplash.com/photo-1526778548025-fa2f459cd5c1?auto=format&fit=crop&w=1000&q=80)',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="rounded-[var(--radius-md)] bg-[hsl(var(--color-bg)/0.72)] p-3 backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[hsl(var(--color-muted))]">Regional Scripts</p>
              <p className="mt-2 text-sm font-semibold text-[hsl(var(--color-text))]">नमस्ते · வணக்கம் · नमस्कार</p>
            </div>
          </div>

          <div className="mt-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-3">
                <p className="text-xs font-semibold text-[hsl(var(--color-muted))]">Before</p>
                <p className="mt-2 text-sm font-medium text-[hsl(var(--color-text))]">Audio Track: English</p>
                <p className="mt-1 text-xs text-[hsl(var(--color-muted))]">"Grow your business with video storytelling."</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.1)] p-3">
                <p className="text-xs font-semibold text-[hsl(var(--color-muted))]">After</p>
                <p className="mt-2 text-sm font-medium text-[hsl(var(--color-text))]">Audio Track: {selectedLanguage}</p>
                <p className="mt-1 text-xs text-[hsl(var(--color-muted))]">Localized voice, captions, and synced lip movement.</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {languages.map((language) => (
                <button
                  key={language}
                  type="button"
                  onClick={() => setSelectedLanguage(language)}
                  className={`rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold ${
                    selectedLanguage === language
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-muted))]'
                  }`}
                >
                  {language}
                </button>
              ))}
            </div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.25 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-soft"
        >
          <h2 className="font-heading text-3xl font-extrabold tracking-tight text-[hsl(var(--color-text))] sm:text-4xl">
            Break Language Barriers.
          </h2>
          <ul className="mt-5 space-y-3">
            <li className="flex items-start gap-2 text-sm text-[hsl(var(--color-text))]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" />
              Clone your voice perfectly
            </li>
            <li className="flex items-start gap-2 text-sm text-[hsl(var(--color-text))]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" />
              Seamless Lip-Sync
            </li>
            <li className="flex items-start gap-2 text-sm text-[hsl(var(--color-text))]">
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" />
              Support for 20+ Regional Dialects
            </li>
          </ul>
        </motion.div>
      </div>
    </section>
  );
}
