import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  Clapperboard,
  ImageIcon,
  Layers3,
  Mic2,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingVideo } from '@/components/landing/LandingVideo';

const trustStrip = [
  'Reels',
  'Explainers',
  'Product ads',
  'Story videos',
  'AI influencer visuals',
  'Short-form education',
];

const storyBlocks = [
  {
    eyebrow: 'Recipe-powered creation',
    title: 'Start from proven formats instead of guessing.',
    body:
      'Browse polished recipe outputs, spot strong hooks, and move straight into creation with a guided setup instead of starting from a blank screen.',
    cta: { href: '/create', label: 'Explore recipes' },
    media: (
      <div className="grid gap-4 sm:grid-cols-[1.15fr_0.85fr]">
        <div className="relative overflow-hidden rounded-[28px]">
          <LandingVideo
            src="/videos/samples/hindi-festival-9x16.mp4"
            poster="/videos/samples/creator-launch.png"
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.34))]" />
          <div className="absolute inset-x-4 bottom-4">
            <p className="text-xl font-heading font-extrabold text-white">Trending reel</p>
            <p className="mt-1 text-sm text-white/80">Festival storytelling • voice-led short-form</p>
          </div>
        </div>
        <div className="grid gap-4">
          <div className="relative overflow-hidden rounded-[24px]">
            <Image src="/videos/samples/divyanka-chauhan-ai-influencer.jpg" alt="AI influencer example" fill sizes="(max-width: 1024px) 100vw, 30vw" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.42))]" />
            <div className="absolute inset-x-4 bottom-4 text-sm font-semibold text-white">Persona-led visual</div>
          </div>
          <div className="relative overflow-hidden rounded-[24px]">
            <Image src="/videos/samples/creator-launch.png" alt="Creator launch visual" fill sizes="(max-width: 1024px) 100vw, 30vw" className="object-cover" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.42))]" />
            <div className="absolute inset-x-4 bottom-4 text-sm font-semibold text-white">Ad-ready visual</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: 'Guided recipes',
    title: 'Start from a proven format, not a blank interface.',
    body:
      'Recipes give you a clear starting point for explainers, product ads, offer promos, story reels, and character-led content. Change the idea, keep the momentum.',
    cta: { href: '/templates', label: 'Browse recipes' },
    media: (
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ['Talking Explainer', '/videos/samples/tamil-education-9x16.mp4', 'Character-led education'],
          ['Product Ad', '/videos/samples/advertisement.mp4', 'Offer-ready short promo'],
          ['Story Reel', '/videos/samples/english-startup-16x9.mp4', 'Narrative pacing'],
          ['Influencer Visual', '/videos/samples/influncer-persona.png', 'Consistent persona setup'],
        ].map(([title, src, meta]) => (
          <div key={title} className="group relative overflow-hidden rounded-[24px] border border-white/8 bg-white/[0.03]">
            {src.endsWith('.mp4') ? (
              <LandingVideo src={src} className="aspect-[4/5] w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
            ) : (
              <div className="relative aspect-[4/5] w-full">
                <Image src={src} alt={title} fill sizes="(max-width: 1024px) 50vw, 25vw" className="object-cover transition duration-300 group-hover:scale-[1.02]" />
              </div>
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_38%,rgba(0,0,0,0.78))]" />
            <div className="absolute inset-x-4 bottom-4">
              <p className="text-lg font-heading font-extrabold text-white">{title}</p>
              <p className="mt-1 text-sm text-white/70">{meta}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    eyebrow: 'One unified studio',
    title: 'Create images and videos from the same idea.',
    body:
      'Move from a prompt to social-ready visuals, voice-led reels, captions, and polished exports without having to think like a model operator.',
    cta: { href: '/create', label: 'Open the studio' },
    media: (
      <div className="relative overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(36,32,42,0.88),rgba(19,17,24,0.96))] p-4 sm:p-5">
        <div className="absolute inset-x-10 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--color-accent)/0.6),transparent)]" />
        <div className="rounded-[26px] border border-white/8 bg-[rgba(10,10,14,0.56)] p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">Create</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">Image + Video</span>
            <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">Community → Remix → Create</span>
          </div>
          <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
            <p className="text-lg text-white/92 sm:text-xl">
              Create a story-based reel about a struggling creator who finally finds a faster workflow.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2 text-sm text-white/72">
              <span className="rounded-full border border-white/10 px-3 py-1.5">Video</span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">9:16</span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">Voice on</span>
              <span className="rounded-full border border-white/10 px-3 py-1.5">Captions on</span>
              <span className="rounded-full border border-[hsl(var(--color-accent)/0.3)] bg-[hsl(var(--color-accent)/0.08)] px-3 py-1.5 text-[hsl(var(--color-accent))]">
                Ready to generate
              </span>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    eyebrow: 'Built for social formats',
    title: 'Optimized for actual publishing, not just raw generation.',
    body:
      'Short-form aspect ratios, voice preview, captions, repeatable prompts, and remix-friendly workflows make the output easier to publish and iterate on.',
    cta: { href: '/pricing', label: 'See plans' },
    media: (
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            title: '9:16 first',
            body: 'Built around vertical publishing and short-form surfaces.',
            icon: <Clapperboard className="h-5 w-5" />,
          },
          {
            title: 'Voice + captions',
            body: 'Narration and subtitle workflows for reel-ready output.',
            icon: <Mic2 className="h-5 w-5" />,
          },
          {
            title: 'Prompt to output',
            body: 'Recipes and community inspiration reduce blank-page friction.',
            icon: <Wand2 className="h-5 w-5" />,
          },
        ].map((item) => (
          <div key={item.title} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[hsl(var(--color-accent))]">
              {item.icon}
            </div>
            <p className="mt-4 text-lg font-heading font-extrabold text-text">{item.title}</p>
            <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
          </div>
        ))}
      </div>
    ),
  },
];

const showcaseWall = [
  {
    title: 'Product promo',
    meta: 'Ads',
    type: 'video' as const,
    src: '/videos/samples/advertisement.mp4',
    poster: '/videos/samples/cr-launch.png',
  },
  {
    title: 'Creator persona',
    meta: 'Influencer visual',
    type: 'image' as const,
    src: '/videos/samples/divyanka-chauhan-ai-influencer.jpg',
  },
  {
    title: 'Festival storytelling',
    meta: 'Reel',
    type: 'video' as const,
    src: '/videos/samples/hindi-festival-9x16.mp4',
    poster: '/videos/samples/creator-launch.png',
  },
  {
    title: 'Mythology hero',
    meta: 'Character visual',
    type: 'image' as const,
    src: '/videos/samples/an-ultra-realistic-cinematic-8k-portrait-of-battle-worn-sun-wukong-with-glowing-amber-eyes-intricate-facial-hair-scarred-fur-ornate-weathered-armor-with-gold-and-jade-holding-a-glowing-ruyi-jingu-bang-atop-a-foggy-mountain-at-dawn-illuminat.png',
  },
  {
    title: 'Startup explainer',
    meta: 'Educational reel',
    type: 'video' as const,
    src: '/videos/samples/english-startup-16x9.mp4',
    poster: '/videos/samples/earth.png',
  },
  {
    title: 'Influencer launch',
    meta: 'Social visual',
    type: 'image' as const,
    src: '/videos/samples/influncer-persona.png',
  },
];

const recipeCards = [
  {
    title: 'Product Ad',
    body: 'Premium short promo for launches, offers, and brand-safe product storytelling.',
  },
  {
    title: 'Talking Explainer',
    body: 'Teach a concept with a clear hook, voice-led narration, and simple structure.',
  },
  {
    title: 'Offer Promo',
    body: 'Fast promo format for discounts, launches, and conversion-focused short videos.',
  },
  {
    title: 'Story Reel',
    body: 'Narrative-led format for transformations, journeys, and emotional hooks.',
  },
  {
    title: 'Before / After',
    body: 'Show contrast, progression, and outcomes in a scroll-friendly sequence.',
  },
  {
    title: 'Map / History Explainer',
    body: 'Turn places, timelines, and historical moments into guided visual storytelling.',
  },
];

const platformDepth = [
  {
    title: 'Prompt to image or video',
    body: 'Start with one idea and route into creator-safe defaults for the right output.',
    icon: <Sparkles className="h-5 w-5" />,
  },
  {
    title: 'Remix from community',
    body: 'Pull visual direction from real outputs instead of inventing everything from scratch.',
    icon: <Layers3 className="h-5 w-5" />,
  },
  {
    title: 'Voice and caption workflows',
    body: 'Build reels that feel publish-ready with narration previews and subtitle support.',
    icon: <Mic2 className="h-5 w-5" />,
  },
  {
    title: 'Creator-ready exports',
    body: 'Short-form-first formats and workflow defaults reduce setup fatigue before publishing.',
    icon: <ImageIcon className="h-5 w-5" />,
  },
];

function SectionIntro({
  eyebrow,
  title,
  body,
  cta,
}: {
  eyebrow: string;
  title: string;
  body: string;
  cta?: { href: string; label: string };
}) {
  return (
    <div className="max-w-3xl space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">{eyebrow}</p>
      <h2 className="font-heading text-[2rem] font-extrabold tracking-tight text-text sm:text-[2.6rem] sm:leading-[1.02]">
        {title}
      </h2>
      <p className="max-w-2xl text-sm leading-7 text-muted sm:text-base">{body}</p>
      {cta ? (
        <Link
          href={cta.href}
          className="inline-flex items-center gap-2 text-sm font-semibold text-text transition hover:text-[hsl(var(--color-accent))]"
        >
          {cta.label}
          <ArrowRight className="h-4 w-4" />
        </Link>
      ) : null}
    </div>
  );
}

export function PublicStudioLanding() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,hsl(var(--color-hero-glow)/0.08),transparent_26%),linear-gradient(180deg,hsl(var(--color-bg)),hsl(var(--color-bg))_38%,hsl(260_16%_6%)_100%)] text-text">
      <div className="mx-auto w-full max-w-[1380px] px-4 pb-10 sm:px-6 lg:px-8">
        <header className="sticky top-0 z-30 -mx-4 border-b border-white/6 bg-[hsl(var(--color-bg)/0.72)] px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="mx-auto flex h-16 max-w-[1380px] items-center justify-between gap-4">
            <BrandLogo href="/" variant="full" size="md" className="max-w-[180px] sm:max-w-[220px]" />
            <nav className="hidden items-center gap-7 text-sm font-medium text-muted lg:flex">
              <Link href="/create" className="transition hover:text-text">Create</Link>
              <Link href="/create" className="transition hover:text-text">Recipes</Link>
              <Link href="/pricing" className="transition hover:text-text">Pricing</Link>
              <Link href="/learning" className="transition hover:text-text">Learn</Link>
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

        <main className="space-y-20 pb-8 pt-8 sm:space-y-24 sm:pt-10">
          <section className="grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-end">
            <div className="space-y-7">
              <div className="inline-flex w-fit items-center rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">
                India-first short-form creation
              </div>
              <div className="space-y-5">
                <h1 className="max-w-3xl font-heading text-[3rem] font-extrabold tracking-[-0.04em] text-text sm:text-[4.3rem] sm:leading-[0.95] lg:text-[5.6rem]">
                  See what works.
                  <br />
                  Remix it.
                  <br />
                  Create instantly.
                </h1>
                <p className="max-w-2xl text-base leading-8 text-muted sm:text-lg">
                  RangManch AI helps creators, marketers, educators, and brands turn ideas into reel-ready videos and visuals with community inspiration, guided recipes, and one cleaner creation flow.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-6 py-3.5 text-base font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[0_18px_60px_hsl(var(--color-accent)/0.22)]"
                >
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm font-semibold text-text transition hover:border-white/18 hover:bg-white/[0.05]"
                >
                  Open studio
                </Link>
              </div>
            </div>

            <div className="relative">
              <div className="pointer-events-none absolute -inset-6 bg-[radial-gradient(circle_at_68%_20%,hsl(var(--color-accent)/0.22),transparent_28%),radial-gradient(circle_at_25%_80%,hsl(var(--color-hero-glow)/0.18),transparent_26%)] blur-2xl" />
              <div className="relative grid gap-4 sm:grid-cols-[1.06fr_0.94fr]">
                <div className="relative overflow-hidden rounded-[34px] border border-white/10 bg-white/[0.03] shadow-[0_28px_90px_rgba(0,0,0,0.4)]">
                  <LandingVideo
                    src="/videos/samples/creator111.mp4"
                    poster="/videos/samples/creator-launch.png"
                    className="aspect-[4/5] w-full object-cover"
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_22%,rgba(0,0,0,0.72)_100%)]" />
                  <div className="absolute inset-x-5 bottom-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/25 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/75 backdrop-blur">
                      <Play className="h-3.5 w-3.5" />
                      Creator workflow preview
                    </div>
                    <p className="mt-4 max-w-sm text-2xl font-heading font-extrabold text-white sm:text-[2rem]">
                      From one idea to a reel-ready visual story.
                    </p>
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.03]">
                    <Image src="/videos/samples/divyanka-chauhan-ai-influencer.jpg" alt="AI influencer sample" fill sizes="(max-width: 1024px) 100vw, 28vw" className="object-cover" />
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_28%,rgba(0,0,0,0.76))]" />
                    <div className="absolute inset-x-4 bottom-4">
                      <p className="text-lg font-heading font-extrabold text-white">AI influencer visuals</p>
                      <p className="mt-1 text-sm text-white/72">Persona-led content with visual consistency.</p>
                    </div>
                  </div>
                  <div className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(29,25,35,0.96),rgba(17,15,21,0.98))] p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">
                      One cleaner workflow
                    </p>
                    <div className="mt-4 rounded-[22px] border border-white/8 bg-black/20 p-4">
                      <p className="text-base leading-7 text-white/92">
                        Create a story reel about a struggling creator who finally finds a faster workflow.
                      </p>
                      <div className="mt-4 flex flex-wrap gap-2 text-xs text-white/70">
                        <span className="rounded-full border border-white/10 px-3 py-1.5">Recipe-guided</span>
                        <span className="rounded-full border border-white/10 px-3 py-1.5">Community remix</span>
                        <span className="rounded-full border border-white/10 px-3 py-1.5">Image + video</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="border-y border-white/6 py-5">
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted sm:gap-4">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--color-accent))]">Made for short-form creation</span>
              {trustStrip.map((item) => (
                <span key={item} className="rounded-full border border-white/8 bg-white/[0.03] px-3 py-1.5">
                  {item}
                </span>
              ))}
            </div>
          </section>

          <section className="space-y-16">
            {storyBlocks.map((block, index) => (
              <div
                key={block.title}
                className={`grid gap-8 lg:items-center ${index % 2 === 1 ? 'lg:grid-cols-[1.08fr_0.92fr]' : 'lg:grid-cols-[0.92fr_1.08fr]'}`}
              >
                <div className={index % 2 === 1 ? 'lg:order-2' : ''}>
                  <SectionIntro eyebrow={block.eyebrow} title={block.title} body={block.body} cta={block.cta} />
                </div>
                <div className={index % 2 === 1 ? 'lg:order-1' : ''}>{block.media}</div>
              </div>
            ))}
          </section>

          <section className="space-y-8">
            <SectionIntro
              eyebrow="Showcase"
              title="The kind of outputs people immediately picture themselves making."
              body="Recipes deliver the result. This is the creative surface where users can instantly imagine ads, explainers, story reels, and character-led visuals."
              cta={{ href: '/create', label: 'View recipes' }}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {showcaseWall.map((item, index) => (
                <div
                  key={item.title}
                  className={`group relative overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] ${index % 3 === 0 ? 'lg:row-span-2' : ''}`}
                >
                  {item.type === 'video' ? (
                    <LandingVideo src={item.src} poster={item.poster} className={`w-full object-cover ${index % 3 === 0 ? 'aspect-[4/5] lg:aspect-[4/6]' : 'aspect-[4/5]'}`} />
                  ) : (
                    <div className={`relative w-full ${index % 3 === 0 ? 'aspect-[4/5] lg:aspect-[4/6]' : 'aspect-[4/5]'}`}>
                      <Image src={item.src} alt={item.title} fill sizes="(max-width: 1024px) 100vw, 33vw" className="object-cover transition duration-300 group-hover:scale-[1.02]" />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_30%,rgba(0,0,0,0.78))]" />
                  <div className="absolute inset-x-4 bottom-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">{item.meta}</p>
                    <p className="mt-2 text-2xl font-heading font-extrabold text-white">{item.title}</p>
                    <button
                      type="button"
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/12 bg-black/20 px-3 py-2 text-sm font-semibold text-white/88 backdrop-blur"
                    >
                      Remix this
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-8">
            <SectionIntro
              eyebrow="Guided creation"
              title="Start with a proven format."
              body="Recipes are the execution engine behind faster creation. They are compact starting points for real creator and brand use cases, not old-style template clutter."
              cta={{ href: '/templates', label: 'See all recipes' }}
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recipeCards.map((recipe) => (
                <Link
                  key={recipe.title}
                  href="/signup"
                  className="group rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(30,26,36,0.72),rgba(17,15,21,0.92))] p-5 transition hover:-translate-y-1 hover:border-[hsl(var(--color-accent)/0.26)]"
                >
                  <p className="text-xl font-heading font-extrabold text-text">{recipe.title}</p>
                  <p className="mt-3 text-sm leading-7 text-muted">{recipe.body}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[hsl(var(--color-accent))]">
                    Use this recipe
                    <ArrowRight className="h-4 w-4" />
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <section className="space-y-8">
            <SectionIntro
              eyebrow="Platform depth"
              title="Serious enough for repeat creation, simple enough to stay fast."
              body="RangManch AI is built around creator workflows rather than model complexity. The product gives enough depth to support real publishing without forcing users into technical setup."
            />
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {platformDepth.map((item) => (
                <div key={item.title} className="rounded-[24px] border border-white/8 bg-white/[0.03] p-5">
                  <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[hsl(var(--color-accent))]">
                    {item.icon}
                  </div>
                  <p className="mt-4 text-lg font-heading font-extrabold text-text">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(34,29,40,0.86),rgba(16,14,21,0.98))] px-6 py-10 text-center sm:px-10 sm:py-14">
            <div className="mx-auto max-w-3xl space-y-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[hsl(var(--color-accent))]">Start creating</p>
              <h2 className="font-heading text-[2.2rem] font-extrabold tracking-tight text-text sm:text-[3.4rem] sm:leading-[1.02]">
                What will you create first?
              </h2>
              <p className="text-sm leading-7 text-muted sm:text-base">
                See what works, remix the direction, and create your first reel or visual in one cleaner flow.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/signup"
                  className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-accent))] px-6 py-3.5 text-base font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[0_18px_60px_hsl(var(--color-accent)/0.22)]"
                >
                  Start free
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-3.5 text-sm font-semibold text-text"
                >
                  Explore recipes
                </Link>
              </div>
            </div>
          </section>

          <LandingFooter />
        </main>
      </div>
    </div>
  );
}
