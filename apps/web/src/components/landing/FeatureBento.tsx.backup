'use client';

import Link from 'next/link';

import { motion } from 'framer-motion';
import { ArrowRight, AudioLines, ShieldCheck, Sparkles, Zap } from 'lucide-react';
import { LandingVideo } from '@/components/landing/LandingVideo';

export function FeatureBento() {
  return (
    <section className="py-24">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="grid grid-cols-1 gap-6 md:grid-cols-4"
      >
        <motion.article whileHover={{ y: -5 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="group relative md:col-span-2">
          <div className="absolute inset-0 rounded-[var(--radius-lg)] opacity-0 blur-xl transition duration-300 group-hover:opacity-100" style={{ background: 'hsl(45 96% 55% / 0.22)' }} />
          <div className="relative h-full rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 shadow-soft">
            <div className="pb-12">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(45_100%_75%),hsl(45_96%_55%))] text-[hsl(var(--color-accent-contrast))] shadow-soft blur-[0.1px]">
                <Zap className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="font-heading text-2xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">AI Video Generation.</h3>
              <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
                Build production-ready videos fast with a script-first workflow designed for speed and ease of use.
              </p>

              <div className="mt-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-3">
                <div className="mb-2 flex items-center justify-between text-xs text-[hsl(var(--color-muted))]">
                  <span>Editor Preview</span>
                  <span>Render 92%</span>
                </div>
                <LandingVideo
                  className="h-52 w-full rounded-[var(--radius-md)] object-cover"
                  src="/videos/samples/english-startup-16x9.mp4"
                />
                <div className="pointer-events-none mt-2 h-1 w-3/4 rounded-full bg-[linear-gradient(90deg,hsl(var(--color-accent)),transparent)]" />
              </div>
            </div>

            <Link href="/platform" className="absolute bottom-5 right-5 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--color-text))] opacity-0 transition group-hover:opacity-100">
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.article>

        <motion.article whileHover={{ y: -5 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="group relative">
          <div className="absolute inset-0 rounded-[var(--radius-lg)] opacity-0 blur-xl transition duration-300 group-hover:opacity-100" style={{ background: 'hsl(210 100% 60% / 0.22)' }} />
          <div className="relative h-full rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 shadow-soft">
            <div className="pb-12">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(210_100%_85%),hsl(210_100%_60%))] text-[hsl(220_35%_18%)] shadow-soft blur-[0.1px]">
                <AudioLines className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="font-heading text-xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">Regional Voice Narration.</h3>
              <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">Preview and render multilingual voiceovers with Sarvam AI and fallback safety.</p>
              <div
                className="mt-3 h-24 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]"
                style={{
                  backgroundImage:
                    'radial-gradient(circle at 20% 40%, hsl(210 100% 60% / 0.28), transparent 40%), radial-gradient(circle at 80% 60%, hsl(210 100% 60% / 0.2), transparent 42%)',
                }}
              >
                <div className="relative h-full w-full">
                  <span className="absolute left-[18%] top-[48%] h-10 w-1 rounded bg-[hsl(210_100%_62%/0.8)]" />
                  <span className="absolute left-[28%] top-[42%] h-14 w-1 rounded bg-[hsl(210_100%_62%/0.7)]" />
                  <span className="absolute left-[38%] top-[50%] h-8 w-1 rounded bg-[hsl(210_100%_62%/0.8)]" />
                  <span className="absolute left-[48%] top-[38%] h-16 w-1 rounded bg-[hsl(210_100%_62%/0.75)]" />
                  <span className="absolute left-[58%] top-[46%] h-11 w-1 rounded bg-[hsl(210_100%_62%/0.8)]" />
                  <span className="absolute left-[68%] top-[40%] h-15 w-1 rounded bg-[hsl(210_100%_62%/0.7)]" />
                </div>
              </div>
            </div>

            <Link href="/use-cases" className="absolute bottom-5 right-5 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--color-text))] opacity-0 transition group-hover:opacity-100">
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.article>

        <motion.article whileHover={{ y: -5 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="group relative">
          <div className="absolute inset-0 rounded-[var(--radius-lg)] opacity-0 blur-xl transition duration-300 group-hover:opacity-100" style={{ background: 'hsl(330 90% 68% / 0.24)' }} />
          <div className="relative h-full rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-5 shadow-soft">
            <div className="pb-12">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(330_90%_84%),hsl(330_90%_68%))] text-[hsl(330_60%_22%)] shadow-soft blur-[0.1px]">
                <Sparkles className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="font-heading text-xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">AI Influencer Studio.</h3>
              <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">Build consistent personas with lock mode, scene controls, and reusable style memory.</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[hsl(var(--color-text))]">Persona Builder</span>
                <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[hsl(var(--color-text))]">Identity Lock</span>
                <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-1 text-xs font-semibold text-[hsl(var(--color-text))]">Scene Presets</span>
              </div>
            </div>

            <Link href="/platform" className="absolute bottom-5 right-5 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--color-text))] opacity-0 transition group-hover:opacity-100">
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.article>

        <motion.article whileHover={{ y: -5 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="group relative md:col-span-2">
          <div className="absolute inset-0 rounded-[var(--radius-lg)] opacity-0 blur-xl transition duration-300 group-hover:opacity-100" style={{ background: 'hsl(142 71% 45% / 0.2)' }} />
          <div className="relative h-full rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(142_71%_45%/0.06)] p-5 shadow-soft">
            <div className="pb-12">
              <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,hsl(142_71%_70%),hsl(142_71%_45%))] text-[hsl(145_42%_15%)] shadow-soft blur-[0.1px]">
                <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
              </div>
              <h3 className="font-heading text-2xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">Enterprise Security & Compliance.</h3>
              <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
                Production safeguards and compliance workflows built for global teams.
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                {['GDPR', 'SOC 2 TYPE II', 'AI ACT'].map((badge) => (
                  <div
                    key={badge}
                    className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-center text-xs font-bold text-[hsl(var(--color-text))]"
                  >
                    {badge}
                  </div>
                ))}
              </div>

              <ul className="mt-4 space-y-2">
                <li className="text-sm font-medium text-[hsl(var(--color-text))]">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[hsl(142_71%_45%)]" />Verified Data Controls
                </li>
                <li className="text-sm font-medium text-[hsl(var(--color-text))]">
                  <span className="mr-2 inline-block h-2 w-2 rounded-full bg-[hsl(142_71%_45%)]" />Audit-ready Governance
                </li>
              </ul>

              <div className="mt-3 w-fit rounded-[var(--radius-md)] border border-[hsl(142_71%_45%/0.35)] bg-[linear-gradient(145deg,hsl(142_71%_45%/0.18),hsl(var(--color-surface)))] px-3 py-1 text-xs font-bold text-[hsl(var(--color-text))]">
                SECURITY VERIFIED
              </div>
            </div>

            <Link href="/company" className="absolute bottom-5 right-5 inline-flex items-center gap-1 text-sm font-semibold text-[hsl(var(--color-text))] opacity-0 transition group-hover:opacity-100">
              Learn More <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </motion.article>
      </motion.div>
    </section>
  );
}
