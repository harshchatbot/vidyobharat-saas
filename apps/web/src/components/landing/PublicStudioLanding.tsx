import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Clapperboard,
  ShieldCheck,
  Sparkles,
  Wand2,
} from 'lucide-react';

import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingVideo } from '@/components/landing/LandingVideo';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

const whyRangManch = [
  {
    title: 'One studio for images, reels, and influencer content',
    body: 'Create and organize everything from one workflow.',
    icon: Sparkles,
  },
  {
    title: 'Built for repeatable creative workflows',
    body: 'Keep prompts, references, and outputs aligned.',
    icon: Wand2,
  },
  {
    title: 'Templates and guided lanes reduce prompt friction',
    body: 'Start faster and reach a usable output sooner.',
    icon: Clapperboard,
  },
];

const creationUseCases = [
  'AI influencer visuals',
  'Short ad creatives',
  'Social media images',
  'Voice-led short videos',
];

const trustPoints = [
  'One workspace',
  'Guided templates',
  'Fast creator workflows',
];

function HeroMediaRibbon() {
  const ribbonItems = [
    { key: 'persona-1', kind: 'image' as const, src: '/videos/samples/creator-launch.png', height: 'h-32 sm:h-40 lg:h-52', tilt: '-rotate-[2deg]' },
    { key: 'reel-1', kind: 'video' as const, src: '/videos/samples/hindi-festival-9x16.mp4', poster: '/videos/samples/creator-launch.png', height: 'h-36 sm:h-44 lg:h-58', tilt: 'rotate-[1.35deg]' },
    { key: 'persona-2', kind: 'image' as const, src: '/videos/samples/divyanka-chauhan-ai-influencer.jpg', height: 'h-30 sm:h-38 lg:h-48', tilt: '-rotate-[1deg]' },
    { key: 'reel-2', kind: 'video' as const, src: '/videos/samples/tamil-education-9x16.mp4', poster: '/videos/samples/earth.png', height: 'h-34 sm:h-42 lg:h-54', tilt: 'rotate-[0.9deg]' },
    { key: 'persona-3', kind: 'image' as const, src: '/videos/samples/influncer-persona.png', height: 'h-38 sm:h-48 lg:h-64', tilt: '-rotate-[1.4deg]' },
    { key: 'reel-3', kind: 'video' as const, src: '/videos/samples/advertisement.mp4', poster: '/videos/samples/cr-launch.png', height: 'h-36 sm:h-46 lg:h-60', tilt: 'rotate-[1.8deg]' },
    { key: 'persona-4', kind: 'image' as const, src: '/videos/samples/an-ultra-realistic-cinematic-8k-portrait-of-battle-worn-sun-wukong-with-glowing-amber-eyes-intricate-facial-hair-scarred-fur-ornate-weathered-armor-with-gold-and-jade-holding-a-glowing-ruyi-jingu-bang-atop-a-foggy-mountain-at-dawn-illuminat.png', height: 'h-30 sm:h-38 lg:h-48', tilt: '-rotate-[0.8deg]' },
    { key: 'reel-4', kind: 'video' as const, src: '/videos/samples/lip-sync.mp4', poster: '/videos/samples/divyanka-chauhan-ai-influencer.jpg', height: 'h-32 sm:h-40 lg:h-52', tilt: 'rotate-[1deg]' },
  ];

  return (
    <div className="rangmanch-landing-ribbon mx-auto mt-8 flex max-w-[1160px] items-end justify-center gap-2 overflow-hidden px-2 pb-2 sm:mt-10 sm:gap-3 lg:mt-12 lg:gap-4">
      {ribbonItems.map((item) => (
        <div
          key={item.key}
          className={`relative ${item.height} ${item.tilt} aspect-[9/16] w-[4.8rem] shrink-0 overflow-hidden rounded-[18px] border border-[hsl(var(--color-accent)/0.18)] bg-[hsl(var(--color-surface-glass)/0.22)] shadow-[var(--shadow-soft)] backdrop-blur-md sm:w-[5.8rem] lg:w-[7rem] lg:rounded-[22px]`}
        >
          {item.kind === 'video' ? (
            <LandingVideo src={item.src} poster={item.poster} className="h-full w-full object-cover" />
          ) : (
            <Image src={item.src} alt="" aria-hidden fill sizes="(max-width: 1024px) 96px, 128px" className="object-cover" />
          )}
          <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--landing-hero-bg)/0.03),transparent_38%,hsl(var(--landing-hero-bg-deep)/0.24)_100%)]" />
          <div className="absolute inset-x-[18%] bottom-0 h-8 rounded-full bg-[hsl(var(--color-accent)/0.22)] blur-2xl" />
        </div>
      ))}
    </div>
  );
}

export function PublicStudioLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[hsl(var(--color-bg))] text-[hsl(var(--color-text))]">
      <div className="flex min-h-screen max-w-full overflow-x-clip">
        <main className="min-w-0 max-w-full flex-1 overflow-x-clip">
          <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col px-3 pb-8 pt-3 sm:px-4 sm:pb-9 sm:pt-4 lg:px-5 lg:pb-10 xl:px-6 2xl:px-8 2xl:pb-12">
            <section id="hero" className="scroll-mt-24 pt-2 md:pt-3 2xl:pt-6">
              <div className="rangmanch-floating-hero rangmanch-landing-grid-hero relative overflow-hidden rounded-[28px] px-4 py-4 sm:rounded-[32px] sm:px-5 sm:py-5 xl:rounded-[36px] xl:px-7 xl:py-6">
                <div className="relative z-10">
                  <header className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <BrandLogo href="/" variant="full" size="md" className="max-w-[180px] sm:max-w-[220px]" />
                    </div>
                    <nav className="hidden items-center gap-8 text-sm font-medium text-[hsl(var(--color-text))] lg:flex">
                      <Link href="/company">About</Link>
                      <Link href="/use-cases">Workflows</Link>
                      <Link href="/pricing">Pricing</Link>
                      <Link href="/learning">Learning</Link>
                    </nav>
                    <div className="flex items-center gap-2">
                      <div className="hidden sm:block">
                        <ToggleTheme />
                      </div>
                      <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]"
                      >
                        Start free
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </header>

                  <div className="mx-auto flex min-h-[600px] max-w-[78rem] flex-col items-center justify-center pt-8 text-center sm:min-h-[660px] sm:pt-12 lg:min-h-[710px] lg:pt-14">
                    <div className="space-y-4">
                      <h1 className="max-w-5xl font-heading text-[2.55rem] font-extrabold tracking-tight text-[hsl(var(--color-accent))] sm:text-[3.4rem] sm:leading-[1.02] md:text-[4.3rem] lg:text-[5.3rem] 2xl:text-[5.9rem]">
                        Create with
                        <br />
                        RangManch AI
                      </h1>
                      <p className="mx-auto max-w-3xl text-sm leading-6 text-[hsl(var(--color-text))] sm:text-[15px] sm:leading-7 lg:text-[1rem]">
                        Create images, reels, influencer visuals, and Indian voice-led content in one studio.
                      </p>
                    </div>
                    <HeroMediaRibbon />
                    <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                      <Link
                        href="/signup"
                        className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-6 py-3 text-base font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]"
                      >
                        Start free
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                      <Link
                        href="/pricing"
                        className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.52)] px-5 py-3 text-sm font-medium"
                      >
                        View pricing
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="why-rangmanch" className="scroll-mt-24 pt-7 lg:pt-8">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="rangmanch-section-eyebrow">Why RangManch AI</p>
                  <h2 className="mt-1 text-[2rem] font-extrabold tracking-tight sm:text-[2.4rem]">
                    Built to make creation feel faster and cleaner.
                  </h2>
                  <p className="mt-2 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                    Focus on the idea, not the tool-hopping.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trustPoints.map((point) => (
                    <span
                      key={point}
                      className="rangmanch-landing-accent-chip inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-muted))] backdrop-blur-md"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-4 grid gap-4 border-t border-[hsl(var(--color-border)/0.45)] pt-4 md:grid-cols-2 2xl:grid-cols-3">
                {whyRangManch.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.title} className="h-full border-l border-[hsl(var(--color-border)/0.45)] pl-4 sm:pl-5">
                      <div className="flex h-full flex-col gap-4">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[hsl(var(--color-accent)/0.18)] bg-[hsl(var(--color-accent)/0.08)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-[hsl(var(--color-text))]">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{item.body}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section id="what-you-can-create" className="scroll-mt-24 pt-7 lg:pt-8">
              <div className="overflow-hidden border-y border-[hsl(var(--color-border)/0.45)] px-1 py-5 sm:px-0 sm:py-6 lg:py-7">
                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                  <div className="max-w-2xl">
                    <p className="rangmanch-section-eyebrow">What You Can Create</p>
                    <h2 className="mt-1 text-[2rem] font-extrabold tracking-tight sm:text-[2.4rem]">
                      A few strong workflows, all in one place.
                    </h2>
                    <p className="mt-2 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                      Use one studio for the most common creator and brand outputs.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {creationUseCases.map((item, index) => (
                      <div
                        key={item}
                        className="border-l border-[hsl(var(--color-border)/0.45)] pl-4"
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-accent)/0.18)] bg-[hsl(var(--color-accent)/0.08)] text-xs font-semibold text-[hsl(var(--color-text))]">
                            {index + 1}
                          </span>
                          <p className="pt-1 text-sm font-medium leading-6 text-[hsl(var(--color-text))]">{item}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section id="pricing" className="scroll-mt-24 pt-7 sm:pt-8">
              <div className="grid gap-5 border-t border-[hsl(var(--color-border)/0.45)] px-1 py-5 sm:px-0 sm:py-5 2xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-3">
                  <p className="rangmanch-section-eyebrow">Plans</p>
                  <h2 className="text-[2rem] font-extrabold tracking-tight sm:text-[2.4rem]">Start simple. Scale when needed.</h2>
                  <p className="max-w-2xl text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                    Start free with 40 monthly credits, get a one-time activation bonus after your first real workflow win, and scale only when you need more volume.
                  </p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Link href="/pricing" className="rangmanch-landing-cta-primary inline-flex w-full items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold sm:w-auto">
                      See plans
                    </Link>
                    <Link href="/signup" className="inline-flex w-full items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.52)] px-5 py-2.5 text-sm font-medium sm:w-auto">
                      Start free
                    </Link>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {[
                    ['Free', '40 credits / month', 'Enough to test real image, template, voice, and fast-draft workflows.'],
                    ['Starter', '200 credits', 'For repeat creator work and your first premium runs.'],
                    ['Creator', '650 credits', 'For active publishing and heavier weekly output.'],
                  ].map(([name, credits, blurb]) => (
                    <div
                      key={name}
                      className="border-l border-[hsl(var(--color-border)/0.45)] pl-4"
                    >
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="mt-4 text-2xl font-extrabold tracking-tight">{credits}</p>
                      <p className="mt-3 text-sm leading-6 text-[hsl(var(--color-muted))]">{blurb}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="pt-8">
              <LandingFooter />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
