'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowRight,
  BadgeIndianRupee,
  Check,
  Film,
  Heart,
  ImagePlus,
  IndianRupee,
  Layers3,
  Menu,
  Sparkles,
  UploadCloud,
  UserRound,
  Video,
  X,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingVideo } from '@/components/landing/LandingVideo';
import { ToggleTheme } from '@/components/ui/ToggleTheme';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { AnimatedMarqueeHero } from '@/components/ui/hero-3';
import { LampContainer } from '@/components/ui/lamp';
import { heroMedia } from '@/config/heroMedia';

const steps = [
  {
    title: 'Upload your product',
    body: 'Add a product photo, product angle, and a few basic campaign details. RangManch takes it from there.',
    icon: <UploadCloud className="h-5 w-5" />,
  },
  {
    title: 'Choose an AI avatar',
    body: 'Pick a presenter and a quality lane from affordable to premium, based on your budget and output target.',
    icon: <UserRound className="h-5 w-5" />,
  },
  {
    title: 'Generate your ad',
    body: 'Publish-ready UGC-style ads, guided anime reels, or freeform videos and images from one studio.',
    icon: <Video className="h-5 w-5" />,
  },
];

const offerHighlights = [
  {
    title: 'Quick UGC ads at low cost',
    body: 'Avatar Product is built for predictable, fast output. Upload product image, choose AI avatar, fill the basics, and generate.',
    icon: <IndianRupee className="h-5 w-5" />,
  },
  {
    title: 'Guided anime lofi reels',
    body: 'Upload a character image, choose motion, vibe, and scenery, and let the guided recipe create the final anime-style reel.',
    icon: <Film className="h-5 w-5" />,
  },
  {
    title: 'Freeform creation when you want it',
    body: 'Recipes are for speed and predictable outcomes. Freeform video and image generation are there when you want to push your own creativity.',
    icon: <Layers3 className="h-5 w-5" />,
  },
];

const useCases = [
  {
    title: 'AI avatar product ads',
    body: 'Create short, sharp UGC ads without hiring a model, studio, editor, and voice artist for every product iteration.',
  },
  {
    title: 'Anime lofi reels',
    body: 'Turn a single character image into a beautiful motion-led anime reel with guided choices instead of prompt complexity.',
  },
  {
    title: 'Creators, agencies, and local brands',
    body: 'Move faster on ads, launches, social content, explainers, and experiments while keeping cost under control.',
  },
];

const creditExamples = [
  ['Monthly free credits', '40 every month'],
  ['New user activation bonus', '120 one-time credits'],
  ['Affordable 5s avatar ad', '49 credits'],
];

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/create', label: 'Create' },
    { href: '/images', label: 'Images' },
    { href: '/videos', label: 'Videos' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/learning', label: 'Learn' },
  ];

  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.06] bg-[hsl(var(--color-bg)/0.74)] px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4">
        <BrandLogo href="/" variant="full" size="md" className="max-w-[180px] sm:max-w-[220px]" />

        <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
          {navItems.map((item) => (
            <Link key={item.href} href={item.href} className="transition hover:text-text">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:inline-flex">
            <ToggleTheme />
          </div>
          <Link href="/login" className="hidden rounded-full px-4 py-2 text-sm font-medium text-muted transition hover:text-text sm:inline-flex">
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-4 py-2.5 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[0_18px_60px_hsl(var(--color-accent)/0.22)]"
          >
            Start free
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.72),hsl(var(--color-elevated)/0.68))] text-text shadow-[var(--shadow-soft)] lg:hidden"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobileMenuOpen ? (
        <div className="mx-auto max-w-[1180px] border-t border-[hsl(var(--color-border)/0.45)] py-4 lg:hidden">
          <div className="overflow-hidden rounded-[26px] border border-[hsl(var(--color-border)/0.55)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.9),hsl(var(--color-elevated)/0.82))] p-3 shadow-[var(--shadow-float)] backdrop-blur-xl">
            <div className="rounded-[20px] border border-[hsl(var(--color-border)/0.38)] bg-[radial-gradient(circle_at_top_left,hsl(var(--color-accent)/0.12),transparent_42%),hsl(var(--color-bg-soft)/0.5)] px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Explore RangManch</p>
              <p className="mt-1 text-sm leading-6 text-muted">Jump into create, browse public galleries, check pricing, or switch your theme.</p>
            </div>
            <div className="mt-3 grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="group rounded-[18px] border border-[hsl(var(--color-border)/0.5)] bg-[hsl(var(--color-surface)/0.62)] px-4 py-3.5 text-sm font-medium text-text shadow-[var(--shadow-soft)] transition hover:-translate-y-0.5 hover:border-[hsl(var(--color-accent)/0.34)] hover:bg-[hsl(var(--color-surface)/0.84)]"
              >
                <span className="flex items-center justify-between gap-3">
                  <span>{item.label}</span>
                  <ArrowRight className="h-4 w-4 text-muted transition group-hover:text-[hsl(var(--color-accent))]" />
                </span>
              </Link>
            ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-surface)/0.5)] px-4 py-3 sm:hidden">
              <div>
                <p className="text-sm font-semibold text-text">Theme</p>
                <p className="mt-0.5 text-xs text-muted">Switch light or dark mode</p>
              </div>
              <ToggleTheme />
            </div>
            <div className="mt-3 grid gap-2 sm:hidden">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-[18px] border border-[hsl(var(--color-border)/0.5)] bg-[hsl(var(--color-surface)/0.62)] px-4 py-3.5 text-center text-sm font-medium text-text shadow-[var(--shadow-soft)]"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] bg-[hsl(var(--color-accent))] px-4 py-3.5 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[0_18px_60px_hsl(var(--color-accent)/0.22)]"
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function ProductPreviewMock() {
  return (
    <div className="grid h-full gap-4 bg-[radial-gradient(circle_at_top_left,hsl(var(--color-accent)/0.16),transparent_34%),linear-gradient(135deg,#0f0d16,#181320_42%,#08070b)] p-4 text-white md:grid-cols-[0.88fr_1.12fr] md:p-6">
      <div className="rounded-3xl border border-white/[0.10] bg-white/[0.04] p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-white/[0.78]">Avatar Product</p>
          <span className="rounded-full bg-emerald-400/[0.12] px-3 py-1 text-xs font-semibold text-emerald-200">Ready</span>
        </div>

        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-white/[0.10] bg-black/[0.20] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/[0.42]">Product</p>
            <p className="mt-2 text-lg font-bold">Glow serum for busy working women</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.10] bg-black/[0.20] p-4">
              <UserRound className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold">Ruhi avatar</p>
              <p className="mt-1 text-xs text-white/[0.48]">Indoor creator look</p>
            </div>
            <div className="rounded-2xl border border-white/[0.10] bg-black/[0.20] p-4">
              <BadgeIndianRupee className="h-5 w-5 text-[hsl(var(--color-accent))]" />
              <p className="mt-3 text-sm font-semibold">Standard lane</p>
              <p className="mt-1 text-xs text-white/[0.48]">Better consistency</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[hsl(var(--color-accent)/0.28)] bg-[hsl(var(--color-accent)/0.08)] p-4">
            <p className="text-sm font-semibold text-[hsl(var(--color-accent))]">Estimated output</p>
            <p className="mt-1 text-xs text-white/[0.56]">Short vertical product ad • AI avatar • voice + lip sync</p>
          </div>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/[0.10] bg-black/[0.30] p-4">
        <div className="absolute right-4 top-4 z-10 rounded-full border border-white/[0.10] bg-black/[0.40] px-3 py-1 text-xs font-semibold text-white/[0.70] backdrop-blur">
          Generated video
        </div>
        <div className="flex h-full items-center justify-center rounded-[24px] bg-[linear-gradient(180deg,rgba(255,255,255,0.09),rgba(255,255,255,0.02))]">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-2xl">
              <Video className="h-7 w-7" />
            </div>
            <p className="mt-5 text-2xl font-heading font-extrabold">Your product ad is ready</p>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/[0.58]">
              Download, post, or generate another version with a different lane.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductScrollPreview() {
  return (
    <section className="-my-8">
      <ContainerScroll
        titleComponent={
          <div className="mx-auto max-w-3xl space-y-4 px-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">How RangManch helps</p>
            <h2 className="font-heading text-[2.2rem] font-extrabold tracking-tight text-text sm:text-[3.5rem] sm:leading-[1.02]">
              From one product photo to a finished UGC ad, without a production team.
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-muted sm:text-base">
              The live recipe flow is simple: choose AI avatar, upload product image, provide a few basics, and generate high-quality ads at a fraction of traditional production cost.
            </p>
          </div>
        }
      >
        <ProductPreviewMock />
      </ContainerScroll>
    </section>
  );
}

function MissionSection() {
  return (
    <section className="grid gap-6 rounded-[34px] border border-white/[0.08] bg-white/[0.03] p-6 sm:p-8 lg:grid-cols-[0.9fr_1.1fr] lg:p-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Our mission</p>
        <h2 className="mt-4 max-w-xl font-heading text-[2.1rem] font-extrabold tracking-tight text-text sm:text-[3rem] sm:leading-[1.04]">
          Make AI creation simple for Bharat&apos;s creators and businesses.
        </h2>
      </div>
      <div className="space-y-5 text-sm leading-7 text-muted sm:text-base">
        <p>
          Most small teams cannot afford repeated shoots, editors, models, voice artists, and agency timelines. RangManch AI exists to make quality content creation accessible, faster, and dramatically more affordable.
        </p>
        <p>
          We are building an India-first creator platform where anyone can create avatar-led product ads, anime reels, social visuals, short videos, and educational content without understanding complex AI models.
        </p>
        <div className="flex flex-wrap gap-2 pt-1">
          {['Built for creators', 'Useful for local businesses', 'Simple credit pricing', 'Made in India'].map((item) => (
            <span key={item} className="rounded-full border border-white/[0.08] bg-black/[0.16] px-3 py-1.5 text-sm text-text/86">
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

function OfferSection() {
  return (
    <section className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">What you can do today</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight text-text sm:text-[3rem] sm:leading-[1.04]">
          Two guided recipes for speed, plus freeform creation when you want full control.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {offerHighlights.map((item) => (
          <div key={item.title} className="rounded-[28px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.45)] p-5 shadow-[var(--shadow-soft)]">
            <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg-soft)/0.8)] text-[hsl(var(--color-accent))]">
              {item.icon}
            </div>
            <p className="mt-5 text-xl font-heading font-extrabold text-text">{item.title}</p>
            <p className="mt-3 text-sm leading-7 text-muted">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RecipeShowcaseSection() {
  return (
    <section className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Guided recipes</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight text-text sm:text-[3rem] sm:leading-[1.04]">
          The two fastest ways to see RangManch working for you.
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="overflow-hidden rounded-[30px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.48)] shadow-[var(--shadow-soft)]">
          <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
            <div className="border-b border-[hsl(var(--color-border)/0.65)] md:border-b-0 md:border-r">
              <LandingVideo
                src="/hero/ugc_avtaar_product_ad.mp4"
                poster="/hero/ugc_avtaar_product_ad.mp4"
                className="aspect-[9/16] h-full w-full object-cover"
              />
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Avatar Product</p>
              <h3 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-text">Quick UGC ads with AI avatars</h3>
              <p className="mt-3 text-sm leading-7 text-muted">
                Select an AI avatar, upload product image, provide a few basic inputs, click generate, and get a polished UGC-style product ad.
              </p>
              <div className="mt-5 space-y-2 text-sm text-muted">
                <div className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" /> Affordable to premium quality lanes</div>
                <div className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" /> Product image + avatar + a few campaign basics</div>
                <div className="flex items-start gap-2"><Check className="mt-0.5 h-4 w-4 text-[hsl(var(--color-accent))]" /> Built for fast, repeatable ad output</div>
              </div>
            </div>
          </div>
        </article>

        <article className="overflow-hidden rounded-[30px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.48)] shadow-[var(--shadow-soft)]">
          <div className="grid gap-0 md:grid-cols-[0.95fr_1.05fr]">
            <div className="relative border-b border-[hsl(var(--color-border)/0.65)] md:border-b-0 md:border-r">
            <div className="mt-5 overflow-hidden rounded-[20px] border border-[hsl(var(--color-border)/0.65)]">
                <LandingVideo
                  src="/videos/samples/anime_lofi_reel.mp4"
                  poster="/videos/samples/anime_lofi_reel.mp4"
                  className="aspect-[9/16] w-full object-cover"
                />
              </div>
              <div className="absolute inset-x-3 bottom-3 rounded-[16px] border border-white/12 bg-black/45 px-3 py-2 text-xs font-medium text-white/90 backdrop-blur">
                Upload character {'->'} choose motion, vibe, scene {'->'} generate reel
              </div>
            </div>
            <div className="p-5 sm:p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Anime Lofi Reel</p>
              <h3 className="mt-3 font-heading text-2xl font-extrabold tracking-tight text-text">Beautiful anime reels without prompt complexity</h3>
              <p className="mt-3 text-sm leading-7 text-muted">
                Upload the anime character, choose the motion, vibe, and scenery, and RangManch builds the reel prompt for you automatically.
              </p>
              
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

function StepsSection() {
  return (
    <section className="space-y-8">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Simple workflow</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight text-text sm:text-[3rem] sm:leading-[1.04]">
          No complex model settings. Just a clear path to content.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={step.title} className="rounded-[28px] border border-white/[0.08] bg-white/[0.03] p-5">
            <div className="flex items-center justify-between">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/[0.10] bg-white/[0.04] text-[hsl(var(--color-accent))]">
                {step.icon}
              </div>
              <span className="text-sm font-bold text-white/[0.26]">0{index + 1}</span>
            </div>
            <p className="mt-5 text-xl font-heading font-extrabold text-text">{step.title}</p>
            <p className="mt-3 text-sm leading-7 text-muted">{step.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function UseCasesSection() {
  return (
    <section className="space-y-8">
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Who it helps</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight text-text sm:text-[3rem] sm:leading-[1.04]">
          Built for people who need content, speed, and better unit economics.
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {useCases.map((item) => (
          <div key={item.title} className="rounded-[28px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(255,255,255,0.045),rgba(255,255,255,0.018))] p-5">
            <Check className="h-5 w-5 text-[hsl(var(--color-accent))]" />
            <p className="mt-5 text-xl font-heading font-extrabold text-text">{item.title}</p>
            <p className="mt-3 text-sm leading-7 text-muted">{item.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function PricingTeaser() {
  return (
    <section className="grid gap-6 rounded-[34px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(34,29,40,0.86),rgba(16,14,21,0.98))] p-6 text-white shadow-[0_30px_90px_rgba(0,0,0,0.28)] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:p-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Simple credits</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight text-white sm:text-[3rem] sm:leading-[1.04]">
          Start free, test fast, and scale only when content starts working.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-slate-200 sm:text-base">
          Every user gets 40 free credits every month, plus a one-time 120 credit activation bonus. Use credits across images, normal videos, anime reels, and Avatar Product Ads.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.08] px-3 py-1.5 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            40 monthly free credits
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.08] px-3 py-1.5 text-sm font-semibold text-white">
            <ImagePlus className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            120 activation credits one time
          </span>
        </div>
        <Link
          href="/pricing"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.08] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/[0.12]"
        >
          View plans
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        {creditExamples.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border border-white/[0.10] bg-white/[0.06] px-4 py-3">
            <span className="text-sm text-slate-200">{label}</span>
            <span className="text-sm font-bold text-white">{value}</span>
          </div>
        ))}
        <p className="px-1 text-xs leading-5 text-slate-300/90">Examples are approximate. Actual credits vary by model, duration, audio mode, references, and add-ons.</p>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="overflow-hidden rounded-[36px] border border-white/[0.08]">
      <LampContainer>
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p className="inline-flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-cyan-200">
            <Heart className="h-3.5 w-3.5" />
            Made for Indian creators
          </p>

          <h2 className="mt-4 bg-gradient-to-br from-slate-100 to-slate-400 bg-clip-text font-heading text-[2.2rem] font-extrabold tracking-tight text-transparent sm:text-[3.4rem] sm:leading-[1.02]">
            Start with a guided recipe, then create as freely as you want.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Build low-cost AI avatar ads, beautiful anime lofi reels, and freeform videos or images from the same studio. RangManch is designed to help you publish faster, not learn model jargon.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-6 py-3.5 text-base font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[0_18px_60px_hsl(var(--color-accent)/0.22)]"
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/create"
              className="inline-flex items-center gap-2 rounded-full border border-white/[0.12] bg-white/[0.04] px-5 py-3.5 text-sm font-semibold text-white"
            >
              Open studio
            </Link>
          </div>
        </div>
      </LampContainer>
    </section>
  );
}

export function PublicStudioLanding() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--color-hero-glow)/0.08),transparent_26%),linear-gradient(180deg,hsl(var(--color-bg)),hsl(var(--color-bg))_42%,hsl(260_16%_6%)_100%)] text-text">
      <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <Header />
      </div>

      <section className="w-full overflow-hidden">
        <AnimatedMarqueeHero
          tagline="40 free monthly credits + 120 activation credits for new users"
          title={
            <>
              Generate avatar ads,
              <br />
              anime reels, and social videos fast.
            </>
          }
          description="RangManch helps creators, brands, and small teams create quick UGC ads with AI avatars, guided anime lofi reels, and freeform videos or images without dealing with complicated model settings."
          ctaText="Start free with credits"
          images={[]}
          mediaItems={heroMedia}
          className="rounded-none border-0 bg-transparent shadow-none"
          ctaHref="/signup"
        />
      </section>

      <div className="mx-auto w-full max-w-[1180px] px-4 pb-10 sm:px-6 lg:px-8">
        <main className="space-y-16 pb-8 sm:space-y-20">
          <ProductScrollPreview />
          <OfferSection />
          <RecipeShowcaseSection />
          <MissionSection />
          <StepsSection />
          <UseCasesSection />
          <PricingTeaser />
          <FinalCta />
          <LandingFooter />
        </main>
      </div>
    </div>
  );
}
