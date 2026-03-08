'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { motion } from 'framer-motion';
import { Clapperboard, ImagePlus, Megaphone, Mic2, Sparkles, UserRound, Wand2 } from 'lucide-react';

import { GlassPanel } from '@/components/landing/GlassPanel';
import { LandingVideo } from '@/components/landing/LandingVideo';
import { MediaTile } from '@/components/landing/MediaTile';

const launcherItems: Array<{
  title: string;
  description: string;
  href: string;
  mediaSrc?: string;
  imageSrc?: string;
  badge: string;
  icon: ReactNode;
}> = [
  {
    title: 'Text to Video',
    description: 'Turn one script into a polished short-form video with voice, captions, and music.',
    href: '/signup',
    mediaSrc: '/videos/samples/english-startup-16x9.mp4',
    badge: 'Core flow',
    icon: <Clapperboard className="h-4 w-4" />,
  },
  {
    title: 'Image to Video',
    description: 'Animate a reference image into a cinematic shot or social-ready reel.',
    href: '/signup',
    mediaSrc: '/videos/samples/tamil-education-9x16.mp4',
    badge: 'Frame-led',
    icon: <ImagePlus className="h-4 w-4" />,
  },
  {
    title: 'AI Influencer',
    description: 'Lock a consistent persona across visuals, scenes, and future content drops.',
    href: '/signup',
    imageSrc: '/brand/logo-dark.png',
    badge: 'Persona',
    icon: <UserRound className="h-4 w-4" />,
  },
  {
    title: 'Product Ads',
    description: 'Launch ad creatives, explainers, and product-led reels with faster iteration.',
    href: '/signup',
    mediaSrc: '/videos/samples/hindi-festival-9x16.mp4',
    badge: 'Launch',
    icon: <Megaphone className="h-4 w-4" />,
  },
];

const toolPills = [
  'Text to video',
  'Image to video',
  'AI influencer',
  'Shorts creator',
  'Talking videos',
];

export function HeroSection() {
  return (
    <section className="space-y-8 py-4 sm:space-y-10 sm:py-6">
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="rangmanch-floating-hero relative overflow-hidden rounded-[calc(var(--radius-xl)+0.25rem)] px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10"
      >
        <div className="pointer-events-none absolute inset-y-0 right-[-10%] w-[48%] bg-[radial-gradient(circle_at_center,hsl(var(--color-accent)/0.16),transparent_60%)] blur-3xl" />
        <div className="pointer-events-none absolute left-[-12%] top-[-18%] h-60 w-60 rounded-full bg-[hsl(var(--color-hero-glow)/0.18)] blur-3xl" />

        <div className="relative grid gap-8 lg:grid-cols-[0.92fr_1.08fr] lg:items-center">
          <div className="space-y-6">
            <div className="space-y-4">
              <p className="rangmanch-section-eyebrow">AI Video Studio</p>
              <h1 className="font-heading text-4xl font-extrabold leading-[0.95] tracking-tight text-text sm:text-5xl lg:text-[4.25rem]">
                Create cinematic AI videos with a cleaner, faster studio workflow.
              </h1>
              <p className="max-w-2xl text-base leading-7 text-muted sm:text-lg">
                Build text-to-video reels, image-led motion, talking videos, product ads, and AI influencer content
                from one premium workspace built for modern creators.
              </p>
            </div>

            <GlassPanel className="max-w-2xl rounded-[28px] px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg)/0.56)] px-4 py-3">
                  <Sparkles className="h-4 w-4 shrink-0 text-[hsl(var(--color-accent))]" />
                  <span className="truncate text-sm text-muted">
                    Write a script, add a reference image, or launch a creator workflow.
                  </span>
                </div>
                <div className="flex gap-2">
                  <Link
                    href="/signup"
                    className="inline-flex items-center justify-center rounded-full bg-[hsl(var(--color-text))] px-5 py-3 text-sm font-semibold text-[hsl(var(--color-bg))] transition hover:opacity-90"
                  >
                    Start creating
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.28)] px-5 py-3 text-sm font-semibold text-text transition hover:bg-[hsl(var(--color-surface)/0.44)]"
                  >
                    View pricing
                  </Link>
                </div>
              </div>
            </GlassPanel>

            <div className="flex flex-wrap gap-2">
              {toolPills.map((item) => (
                <span
                  key={item}
                  className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.18)] px-3 py-2 text-xs font-semibold text-text backdrop-blur-md"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="grid gap-4 md:grid-cols-[1.15fr_0.85fr]">
              <GlassPanel variant="strong" className="overflow-hidden p-3">
                <div className="relative overflow-hidden rounded-[calc(var(--radius-xl)-0.3rem)]">
                  <LandingVideo
                    src="/videos/samples/hindi-festival-9x16.mp4"
                    className="h-[360px] w-full object-cover sm:h-[420px]"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.92),transparent)] p-5">
                    <p className="rangmanch-section-eyebrow text-[hsl(var(--color-accent))]">Live preview</p>
                    <p className="mt-1 text-2xl font-semibold tracking-tight text-text">Launch-ready short-form output</p>
                    <p className="mt-2 max-w-md text-sm leading-6 text-muted">
                      Generate voice-led videos, edit pacing, and ship reels, explainers, and product-led creatives from one studio.
                    </p>
                  </div>
                </div>
              </GlassPanel>

              <div className="grid gap-4">
                <GlassPanel className="overflow-hidden p-3">
                  <div className="overflow-hidden rounded-[calc(var(--radius-xl)-0.3rem)]">
                    <LandingVideo
                      src="/videos/samples/english-startup-16x9.mp4"
                      className="h-44 w-full object-cover"
                    />
                  </div>
                  <div className="space-y-1 px-1 pt-3">
                    <p className="rangmanch-section-eyebrow">Creator Pro</p>
                    <p className="text-lg font-semibold text-text">Balanced quality for repeat publishing</p>
                  </div>
                </GlassPanel>

                <GlassPanel className="p-4">
                  <div className="grid gap-3">
                    <div className="flex items-center gap-3 rounded-[20px] border border-[hsl(var(--color-border)/0.68)] bg-[hsl(var(--color-bg)/0.54)] px-3 py-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.16)] text-[hsl(var(--color-accent))]">
                        <Mic2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text">Regional voices</p>
                        <p className="text-xs text-muted">Hindi, Tamil, Hinglish, and more</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-[20px] border border-[hsl(var(--color-border)/0.68)] bg-[hsl(var(--color-bg)/0.54)] px-3 py-3">
                      <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-hero-glow)/0.16)] text-text">
                        <Wand2 className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-text">AI script assist</p>
                        <p className="text-xs text-muted">Scene cues, narrator lines, and CTA-ready structure</p>
                      </div>
                    </div>
                  </div>
                </GlassPanel>
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {launcherItems.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.35, delay: index * 0.05, ease: 'easeOut' }}
          >
            <MediaTile
              title={item.title}
              description={item.description}
              href={item.href}
              mediaSrc={item.mediaSrc}
              imageSrc={item.imageSrc}
              badge={item.badge}
              eyebrow="Tool launcher"
              icon={item.icon}
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
