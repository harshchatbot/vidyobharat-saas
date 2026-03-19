import type { Metadata } from 'next';
import Link from 'next/link';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { GlassPanel } from '@/components/landing/GlassPanel';

export const dynamic = 'force-static';

export const metadata: Metadata = {
  title: 'Indian AI Voiceovers for Creator Videos | RangManch AI',
  description:
    'Create reels, explainers, faceless content, and regional campaign videos with natural Indian AI voiceovers inside the RangManch workflow.',
  alternates: {
    canonical: '/sarvam-ai-voiceovers',
  },
  keywords: [
    'Sarvam AI voiceovers',
    'Indian AI voiceovers',
    'Indian-language narration',
    'Hindi AI voiceover',
    'AI voiceovers for reels',
    'regional campaign voiceovers',
  ],
};

const useCases = [
  'Short-form reels with natural Indian AI narration',
  'Explainer videos for education, product walkthroughs, and knowledge content',
  'Faceless creator content with cleaner voice-led storytelling',
  'Regional campaign content for brands and agencies',
];

export default function SarvamAIVoiceoversPage() {
  return (
    <main className="min-h-screen bg-[hsl(var(--color-bg))] text-[hsl(var(--color-text))]">
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-8 px-4 py-4 sm:px-5 sm:py-5 lg:px-6 lg:py-6">
        <header className="rounded-[28px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.3)] px-5 py-5 shadow-soft backdrop-blur-md sm:px-6 sm:py-6">
          <div className="flex flex-col gap-10">
            <div className="flex items-center justify-between gap-4">
              <BrandLogo href="/" variant="full" size="md" className="max-w-[200px]" />
              <div className="flex flex-wrap gap-3">
                <Link href="/pricing" className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.6)] px-4 py-2 text-sm font-medium">
                  Pricing
                </Link>
                <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--color-accent))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]">
                  Start free
                </Link>
              </div>
            </div>

            <div className="max-w-4xl">
              <p className="rangmanch-section-eyebrow">Voiceovers in RangManch</p>
              <h1 className="mt-1 font-heading text-4xl font-extrabold tracking-tight sm:text-5xl">
                Indian AI voiceovers for creator videos, explainers, and regional campaigns.
              </h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                RangManch brings Indian-language narration into the same workflow you use for scripts, reels, templates, and creator publishing. Voice support is optimized for Indian languages and natural-sounding delivery, with Sarvam-powered voices available inside the product workflow rather than treated as a separate tool.
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <GlassPanel variant="strong" className="px-5 py-5 sm:px-6 sm:py-6">
            <p className="rangmanch-section-eyebrow">Why It Matters</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
              Build videos for Indian audiences without leaving the creator workflow.
            </h2>
            <p className="mt-3 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
              RangManch supports natural Indian AI voiceovers for short-form publishing, regional storytelling, and creator explainers. The underlying voice capability supports 11 languages, including 10 Indian languages plus Indian English, and gives you access to 30+ speaker voices to match different video styles.
            </p>
            <p className="mt-3 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
              In practice, that means you can write a script, choose a voice, preview delivery, and render creator-ready output from the same studio instead of patching together separate generation and narration tools.
            </p>
          </GlassPanel>

          <GlassPanel className="px-5 py-5 sm:px-6 sm:py-6">
            <p className="rangmanch-section-eyebrow">Use Cases</p>
            <div className="mt-3 grid gap-3">
              {useCases.map((item) => (
                <div
                  key={item}
                  className="rounded-[20px] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface-glass)/0.22)] px-4 py-3 text-sm leading-6 text-[hsl(var(--color-text))]"
                >
                  {item}
                </div>
              ))}
            </div>
          </GlassPanel>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <GlassPanel className="px-5 py-5 sm:px-6 sm:py-6">
            <p className="rangmanch-section-eyebrow">Reels</p>
            <p className="mt-2 text-sm leading-7 text-[hsl(var(--color-muted))]">
              Add natural Indian-language narration to short-form reels without breaking your fast creation workflow.
            </p>
          </GlassPanel>
          <GlassPanel className="px-5 py-5 sm:px-6 sm:py-6">
            <p className="rangmanch-section-eyebrow">Explainers</p>
            <p className="mt-2 text-sm leading-7 text-[hsl(var(--color-muted))]">
              Turn educational or product scripts into clearer voice-led videos for creators, coaches, and brands.
            </p>
          </GlassPanel>
          <GlassPanel className="px-5 py-5 sm:px-6 sm:py-6">
            <p className="rangmanch-section-eyebrow">Campaigns</p>
            <p className="mt-2 text-sm leading-7 text-[hsl(var(--color-muted))]">
              Use one workflow for regional campaign content, brand storytelling, and client-facing video iterations.
            </p>
          </GlassPanel>
        </section>

        <section>
          <GlassPanel variant="matte" className="px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-3xl">
                <p className="rangmanch-section-eyebrow">Inside RangManch</p>
                <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">
                  Voice is part of the workflow, not a detached add-on.
                </h2>
                <p className="mt-3 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                  Choose voice when you build the video, preview delivery, keep captions optional, and render everything from the same creator studio. This keeps the workflow cleaner for faceless pages, explainers, educational reels, and regional content operations.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link href="/signup" className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--color-accent))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]">
                  Start free
                </Link>
                <Link href="/pricing" className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.6)] px-5 py-2.5 text-sm font-medium">
                  View pricing
                </Link>
              </div>
            </div>
          </GlassPanel>
        </section>
      </div>
    </main>
  );
}
