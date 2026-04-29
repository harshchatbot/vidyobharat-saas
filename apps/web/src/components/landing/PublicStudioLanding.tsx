import Link from 'next/link';
import {
  ArrowRight,
  BadgeIndianRupee,
  Check,
  Heart,
  UploadCloud,
  UserRound,
  Video,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { ContainerScroll } from '@/components/ui/container-scroll-animation';
import { AnimatedMarqueeHero } from '@/components/ui/hero-3';
import { LampContainer } from '@/components/ui/lamp';
import { heroMedia } from '@/config/heroMedia';



const steps = [
  {
    title: 'Upload your product',
    body: 'Add a product photo and tell RangManch what you are selling.',
    icon: <UploadCloud className="h-5 w-5" />,
  },
  {
    title: 'Choose an AI avatar',
    body: 'Pick a presenter and budget lane that fits your campaign.',
    icon: <UserRound className="h-5 w-5" />,
  },
  {
    title: 'Generate your ad',
    body: 'Get a short UGC-style product video ready for social media.',
    icon: <Video className="h-5 w-5" />,
  },
];

const useCases = [
  {
    title: 'Small businesses',
    body: 'Create product ads without hiring a model, studio, editor, and voice artist every time.',
  },
  {
    title: 'Creators',
    body: 'Turn ideas into reels, explainers, thumbnails, and social visuals faster.',
  },
  {
    title: 'Agencies & freelancers',
    body: 'Test multiple ad directions for clients without increasing production cost.',
  },
];

const creditExamples = [
  ['Affordable 5s avatar ad', '49 credits'],
  ['Normal 5s video', 'from 25 credits'],
  ['Standard image', 'from 4 credits'],
];

function Header() {
  return (
    <header className="sticky top-0 z-30 -mx-4 border-b border-white/[0.06] bg-[hsl(var(--color-bg)/0.74)] px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto flex h-16 max-w-[1180px] items-center justify-between gap-4">
        <BrandLogo href="/" variant="full" size="md" className="max-w-[180px] sm:max-w-[220px]" />

        <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
          <Link href="/create" className="transition hover:text-text">
            Create
          </Link>
          <Link href="/pricing" className="transition hover:text-text">
            Pricing
          </Link>
          <Link href="/learning" className="transition hover:text-text">
            Learn
          </Link>
        </nav>

        <div className="flex items-center gap-2">
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
        </div>
      </div>
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
              From product photo to AI ad, without a production team.
            </h2>
            <p className="mx-auto max-w-2xl text-sm leading-7 text-muted sm:text-base">
              RangManch turns the hard parts of ad creation into a simple guided flow for Indian creators, small businesses, marketers, and freelancers.
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
          Most small teams cannot afford repeated shoots, editors, models, voice artists, and agency timelines. RangManch AI exists to make quality content creation accessible, faster, and more affordable.
        </p>
        <p>
          We are building an India-first creator platform where anyone can create product ads, social visuals, short videos, and educational content without understanding complex AI models.
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
          Built for people who need content, not complexity.
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
    <section className="grid gap-6 rounded-[34px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(34,29,40,0.72),rgba(16,14,21,0.95))] p-6 sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:p-10">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Simple credits</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight text-text sm:text-[3rem] sm:leading-[1.04]">
          Start small. Scale when content starts working.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 text-muted sm:text-base">
          Use credits across images, normal videos, and Avatar Product Ads. Higher quality and longer videos use more credits.
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/[0.10] bg-white/[0.04] px-5 py-3 text-sm font-semibold text-text transition hover:bg-white/[0.07]"
        >
          View plans
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        {creditExamples.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-black/[0.18] px-4 py-3">
            <span className="text-sm text-muted">{label}</span>
            <span className="text-sm font-bold text-text">{value}</span>
          </div>
        ))}
        <p className="px-1 text-xs leading-5 text-muted/80">Examples are approximate. Actual credits vary by model, duration, audio mode, references, and add-ons.</p>
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
            Create your first AI product ad today.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
            Upload a product photo, choose an AI avatar, and let RangManch help you create content that looks ready to publish.
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
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-10 sm:px-6 lg:px-8">
        <Header />

        <main className="space-y-16 pb-8 sm:space-y-20">
          <AnimatedMarqueeHero
            tagline="Made in India for avatar ads, short videos, and creator launches"
            title={
              <>
                Turn product ideas
                <br />
                into publish-ready ads.
              </>
            }
            description="RangManch helps creators, brands, and small teams generate AI avatar product ads, multilingual shorts, and campaign-ready visuals using the same studio workflow."
            ctaText="Start free"
            images={[]}
            mediaItems={heroMedia}
            className="overflow-hidden rounded-[40px] border border-white/[0.06] bg-white/[0.015]"
            ctaHref="/signup"
          />
          <ProductScrollPreview />
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
