import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  BriefcaseBusiness,
  Clapperboard,
  Film,
  ImageIcon,
  PlaySquare,
  ShieldCheck,
  Sparkles,
  Users2,
  Wand2,
} from 'lucide-react';

import { GlassPanel } from '@/components/landing/GlassPanel';
import { HeroBackgroundVideo } from '@/components/landing/HeroBackgroundVideo';
import { HeroPromptBar } from '@/components/landing/HeroPromptBar';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { LandingVideo } from '@/components/landing/LandingVideo';
import { StudioSidebar } from '@/components/landing/StudioSidebar';
import { ToggleTheme } from '@/components/ui/ToggleTheme';

const heroBackgroundMedia = {
  src: '/videos/samples/hindi-festival-9x16.mp4',
  poster: '/illustrations/startup.png',
} as const;

type ToolTileMedia =
  | {
      type: 'image';
      src: string;
    }
  | {
      type: 'video';
      src: string;
      poster?: string;
    };

const toolTiles = [
  {
    title: 'Text to Video',
    subtitle: 'Turn script into cinematic scenes',
    href: '/signup',
    media: { type: 'video', src: '/videos/samples/creator111.mp4', poster: '/illustrations/startup.png' } satisfies ToolTileMedia,
    eyebrow: 'Script to scene',
    icon: Clapperboard,
  },
  {
    title: 'Image to Video',
    subtitle: 'Animate reference visuals into motion',
    href: '/signup',
    media: { type: 'video', src: '/videos/samples/lip-sync.mp4', poster: '/illustrations/product-ads.png' } satisfies ToolTileMedia,
    eyebrow: 'Reference motion',
    icon: ImageIcon,
  },
  {
    title: 'AI Influencer',
    subtitle: 'Build a consistent character identity',
    href: '/signup',
    media: { type: 'image', src: '/illustrations/ai-influencer.png' } satisfies ToolTileMedia,
    eyebrow: 'Persona lock',
    icon: Wand2,
  },
  {
    title: 'Ad Shorts',
    subtitle: 'High-frequency vertical reel workflows',
    href: '/signup',
    media: { type: 'video', src: '/videos/samples/advertisement.mp4', poster: '/illustrations/agency.png' } satisfies ToolTileMedia,
    eyebrow: 'Vertical output',
    icon: Sparkles,
  },
  {
    title: 'Trending Templates',
    subtitle: 'Start viral images and reels instantly',
    href: '/templates',
    media: { type: 'image', src: '/illustrations/edtech.png' } satisfies ToolTileMedia,
    eyebrow: 'Template-led',
    icon: PlaySquare,
  },
];

const whyRangManch = [
  {
    title: 'One creator studio, not five disconnected tools',
    body: 'Generate images, reels, influencer visuals, and template-led assets from one workflow instead of stitching together separate apps.',
    icon: Sparkles,
  },
  {
    title: 'Built for repeatable persona and story workflows',
    body: 'Keep visual direction, character consistency, and campaign output closer together so publishing feels faster and less chaotic.',
    icon: Wand2,
  },
  {
    title: 'Templates and guided lanes reduce prompt friction',
    body: 'Move from blank page to usable output with presets designed for reels, social visuals, educational content, and commercial creative.',
    icon: Clapperboard,
  },
  {
    title: 'India-first creator workflows with global output goals',
    body: 'Designed for creators, brands, and agencies that need fast short-form production with a commercially aware workflow.',
    icon: ShieldCheck,
  },
];

const creationUseCases = [
  'AI influencer posts and character-led content',
  'Product promo reels and short ad creatives',
  'Faceless brand videos and daily reel workflows',
  'Educational visuals, explainers, and infographic posts',
  'Client-ready campaign concepts and social media assets',
  'Short-form storytelling for creators and media pages',
];

const audienceGroups = [
  {
    title: 'Creators',
    body: 'Build repeatable reels, visual stories, and character content without rebuilding your process each time.',
  },
  {
    title: 'Agencies',
    body: 'Prototype client-facing concepts, campaign visuals, and short-form variations from one organized studio.',
  },
  {
    title: 'Brands & marketers',
    body: 'Move faster on social ads, product storytelling, and visual testing while keeping output commercially usable.',
  },
  {
    title: 'Educators & faceless content teams',
    body: 'Turn topics, references, and templates into cleaner educational posts, explainers, and repeat publishing systems.',
  },
];

const trustPoints = [
  'Built for repeat creator workflows, not one-off experiments',
  'Templates, personas, images, and videos work together in one studio',
  'Clear task-based workflow lanes instead of an overwhelming model catalog',
];

function ToolTileMediaSurface({
  media,
  alt,
  sizes,
}: {
  media: ToolTileMedia;
  alt: string;
  sizes: string;
}) {
  if (media.type === 'video') {
    return (
      <LandingVideo
        src={media.src}
        poster={media.poster}
        className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
      />
    );
  }

  return (
    <>
      <Image
        src={media.src}
        alt=""
        aria-hidden
        fill
        sizes={sizes}
        className="object-cover opacity-70 blur-md scale-[1.08] transition duration-500 group-hover:scale-[1.12]"
      />
      <Image
        src={media.src}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover object-center transition duration-500 group-hover:scale-[1.03]"
      />
    </>
  );
}

export function PublicStudioLanding() {
  return (
    <div className="min-h-screen overflow-x-clip bg-[hsl(var(--color-bg))] text-[hsl(var(--color-text))]">
      <div className="flex min-h-screen max-w-full overflow-x-clip">
        <StudioSidebar />

        <main className="min-w-0 max-w-full flex-1 overflow-x-clip pt-[72px] sm:pt-[76px] xl:pt-0">
          <div className="mx-auto flex min-h-screen w-full max-w-[1560px] flex-col px-3 pb-8 sm:px-4 sm:pb-10 lg:px-5 lg:pb-12 xl:px-6 2xl:px-8 2xl:pb-14">
            <section id="hero" className="scroll-mt-24 pt-2 md:pt-3 2xl:pt-6">
              <div className="hidden items-center justify-between gap-4 pb-5 xl:flex">
                <div className="inline-flex items-center gap-3 rounded-full border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-surface-glass)/0.34)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-[hsl(var(--color-muted))] backdrop-blur-md">
                  Public Studio
                  <span className="h-1 w-1 rounded-full bg-[hsl(var(--color-accent))]" />
                  AI video creation
                </div>
                <div className="flex items-center gap-2">
                  <ToggleTheme />
                  <Link
                    href="/login"
                    className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.56)] bg-[hsl(var(--color-surface-glass)/0.48)] px-4 py-2 text-sm font-medium backdrop-blur-md"
                  >
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-text))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-bg))]"
                  >
                    Start free
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="rangmanch-floating-hero relative overflow-hidden rounded-[28px] sm:rounded-[32px] xl:rounded-[36px]">
                <HeroBackgroundVideo
                  src={heroBackgroundMedia.src}
                  poster={heroBackgroundMedia.poster}
                />
                <div className="relative z-10 min-h-[420px] px-4 py-5 sm:min-h-[470px] sm:px-5 sm:py-6 md:min-h-[520px] md:px-6 md:py-7 lg:min-h-[560px] lg:px-7 lg:py-8 2xl:min-h-[620px] 2xl:px-8 2xl:py-8">
                  <div className="flex h-full flex-col justify-between gap-6 sm:gap-7 lg:gap-8">
                    <div className="max-w-[44rem] space-y-4 sm:space-y-5">
                      <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.54)] bg-[hsl(var(--color-bg)/0.22)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-text))] backdrop-blur-md">
                        <span className="inline-flex h-2 w-2 rounded-full bg-[hsl(var(--color-accent))]" />
                        Make one day your day one
                      </div>
                      <div className="space-y-3">
                        <h1 className="max-w-3xl font-heading text-[2.1rem] font-extrabold tracking-tight text-[hsl(var(--color-text))] sm:text-[2.8rem] sm:leading-[1.02] md:text-[3.3rem] lg:text-[4rem] 2xl:text-6xl">
                          Create AI influencers, reels, ads, and visual stories from one creator studio.
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-[hsl(var(--color-muted))] sm:text-[15px] sm:leading-7 lg:text-base">
                          Turn prompts, photos, personas, and templates into publish-ready content without juggling separate image, video, and workflow tools.
                        </p>
                      </div>
                      <HeroPromptBar />
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section id="why-rangmanch" className="scroll-mt-24 pt-8 lg:pt-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div className="max-w-3xl">
                  <p className="rangmanch-section-eyebrow">Why RangManch AI</p>
                  <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                    Built for creator output, not just raw generation.
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                    RangManch AI helps you move from idea to usable creative faster, with workflow structure that suits creators, teams, and client work.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {trustPoints.map((point) => (
                    <span
                      key={point}
                      className="inline-flex items-center rounded-full border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-surface-glass)/0.24)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-muted))] backdrop-blur-md"
                    >
                      {point}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                {whyRangManch.map((item) => {
                  const Icon = item.icon;
                  return (
                    <GlassPanel key={item.title} variant="matte" className="h-full p-4 sm:p-5">
                      <div className="flex h-full flex-col gap-4">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[hsl(var(--color-border)/0.48)] bg-[hsl(var(--color-surface-glass)/0.26)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-base font-semibold text-[hsl(var(--color-text))]">{item.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{item.body}</p>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>
            </section>

            <section id="tools" className="scroll-mt-24 pt-8 lg:pt-10">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="rangmanch-section-eyebrow">Tool launcher</p>
                  <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Launch the workflow you need, not a maze of settings.</h2>
                </div>
                <Link href="/signup" className="hidden rounded-full border border-[hsl(var(--color-border)/0.5)] px-4 py-2 text-sm font-medium text-[hsl(var(--color-text))] sm:inline-flex">
                  Open studio
                </Link>
              </div>
              <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
                {toolTiles.map((tool) => {
                  const Icon = tool.icon;
                  return (
                    <Link
                      key={tool.title}
                      href={tool.href}
                      className="group overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.22)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                    >
                      <div className="relative aspect-[6/5]">
                        <ToolTileMediaSurface
                          media={tool.media}
                          alt={tool.title}
                          sizes="(max-width: 639px) 78vw, (max-width: 1279px) 50vw, (max-width: 1535px) 33vw, 20vw"
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.96),transparent_55%)]" />
                        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.4)] px-2.5 py-1 text-[11px] font-medium backdrop-blur-md">
                          <Icon className="h-3.5 w-3.5" />
                          {tool.eyebrow}
                        </div>
                        <div className="absolute inset-x-0 bottom-0 p-3.5">
                          <p className="text-base font-semibold">{tool.title}</p>
                          <p className="mt-1 text-sm leading-5 text-[hsl(var(--color-muted))]">{tool.subtitle}</p>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
              <div className="-mx-3 mt-5 overflow-x-auto px-3 sm:hidden">
                <div className="flex w-max gap-3 pb-1">
                  {toolTiles.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <Link
                        key={tool.title}
                        href={tool.href}
                        className="group block w-[72vw] max-w-[280px] shrink-0 overflow-hidden rounded-[24px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.22)] backdrop-blur-md transition duration-300 active:scale-[0.99]"
                      >
                        <div className="relative aspect-[6/5]">
                          <ToolTileMediaSurface
                            media={tool.media}
                            alt={tool.title}
                            sizes="72vw"
                          />
                          <div className="absolute inset-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.96),transparent_55%)]" />
                          <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.4)] px-2.5 py-1 text-[11px] font-medium backdrop-blur-md">
                            <Icon className="h-3.5 w-3.5" />
                            {tool.eyebrow}
                          </div>
                          <div className="absolute inset-x-0 bottom-0 p-3.5">
                            <p className="text-base font-semibold">{tool.title}</p>
                            <p className="mt-1 text-sm leading-5 text-[hsl(var(--color-muted))]">{tool.subtitle}</p>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>

            <section id="what-you-can-create" className="scroll-mt-24 pt-8 lg:pt-10">
              <GlassPanel variant="strong" className="overflow-hidden px-5 py-6 sm:px-6 sm:py-7 lg:px-7">
                <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
                  <div className="max-w-2xl">
                    <p className="rangmanch-section-eyebrow">What You Can Create</p>
                    <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                      Real content workflows for publishing, campaigns, and client work.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                      Use one studio to move across image generation, short-form video, influencer-style content, and template-driven creative production.
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    {creationUseCases.map((item, index) => (
                      <div
                        key={item}
                        className="rounded-[22px] border border-[hsl(var(--color-border)/0.44)] bg-[hsl(var(--color-surface-glass)/0.2)] px-4 py-4 backdrop-blur-md"
                      >
                        <div className="flex items-start gap-3">
                          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.48)] bg-[hsl(var(--color-bg)/0.34)] text-xs font-semibold text-[hsl(var(--color-muted))]">
                            {index + 1}
                          </span>
                          <p className="pt-1 text-sm font-medium leading-6 text-[hsl(var(--color-text))]">{item}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </GlassPanel>
            </section>

            <section id="who-its-for" className="scroll-mt-24 pt-8 lg:pt-10">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {audienceGroups.map((group, index) => {
                  const icons = [Users2, BriefcaseBusiness, Film, Sparkles];
                  const Icon = icons[index] || Users2;
                  return (
                    <GlassPanel key={group.title} className="h-full p-4 sm:p-5">
                      <div className="flex h-full flex-col gap-4">
                        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-surface-glass)/0.26)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-base font-semibold">{group.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{group.body}</p>
                        </div>
                      </div>
                    </GlassPanel>
                  );
                })}
              </div>
            </section>

            <section id="commercial-use" className="scroll-mt-24 pt-8 lg:pt-10">
              <GlassPanel variant="matte" className="px-5 py-6 sm:px-6 sm:py-7">
                <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                  <div className="max-w-3xl">
                    <p className="rangmanch-section-eyebrow">Commercial Use</p>
                    <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
                      Commercial-friendly workflows for brand content and client-facing output.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                      Create content for campaigns, brands, and agency work from the same studio you use for creator publishing. Use generated assets for branded and client-facing content, subject to platform terms, provider terms, and applicable law.
                    </p>
                  </div>
                  <div className="grid gap-3">
                    {[
                      'Create concept visuals, reels, explainers, and social creatives from one workspace.',
                      'Keep templates, personas, and generation lanes organized for repeat campaign use.',
                      'Scale from solo creator experiments into structured brand or client workflows.',
                    ].map((item) => (
                      <div
                        key={item}
                        className="rounded-[20px] border border-[hsl(var(--color-border)/0.42)] bg-[hsl(var(--color-surface-glass)/0.2)] px-4 py-3 text-sm leading-6 text-[hsl(var(--color-text))]"
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              </GlassPanel>
            </section>

           {/* <section id="community" className="scroll-mt-24 pt-10">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="rangmanch-section-eyebrow">Community / Explore</p>
                  <h2 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">Browse public inspiration in a live creative wall.</h2>
                </div>
                <div className="inline-flex w-fit flex-wrap items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.46)] bg-[hsl(var(--color-surface-glass)/0.28)] p-1 backdrop-blur-md">
                  {[
                    { key: 'all', label: 'All' },
                    { key: 'videos', label: 'Videos' },
                    { key: 'images', label: 'Images' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setCommunityFilter(item.key as 'all' | 'videos' | 'images')}
                      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                        communityFilter === item.key
                          ? 'bg-[hsl(var(--color-text))] text-[hsl(var(--color-bg))]'
                          : 'text-[hsl(var(--color-muted))] hover:text-[hsl(var(--color-text))]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6 columns-1 gap-4 md:columns-2 xl:columns-4">
                {communityItems.length === 0 ? (
                  <GlassPanel className="mb-4 px-5 py-8 text-sm text-[hsl(var(--color-muted))]">
                    Community creations are loading. Published videos and images will appear here automatically.
                  </GlassPanel>
                ) : null}

                {communityItems.map((entry) => {
                  if (entry.type === 'video') {
                    const video = entry.item;
                    return (
                      <article
                        key={`video-${video.id}`}
                        className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.38)] bg-[hsl(var(--color-surface-glass)/0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                      >
                        <div style={{ aspectRatio: aspectRatioToCss(video.aspect_ratio) }}>
                          <LandingVideo src={video.video_url} poster={video.thumbnail_url || undefined} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" />
                        </div>
                        <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.64)] bg-[hsl(var(--color-bg)/0.5)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
                          <Layers3 className="h-3.5 w-3.5" />
                          {video.model_key}
                        </div>
                        <div className="absolute right-3 top-3 rounded-full border border-[hsl(var(--color-border)/0.64)] bg-[hsl(var(--color-bg)/0.5)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
                          {video.duration_seconds}s
                        </div>
                        <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.94),transparent)] p-4">
                          <p className="line-clamp-1 text-base font-semibold">{video.title}</p>
                          <p className="mt-1 line-clamp-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{video.prompt}</p>
                        </div>
                      </article>
                    );
                  }

                  const image = entry.item;
                  return (
                    <article
                      key={`image-${image.id}`}
                      className="group relative mb-4 break-inside-avoid overflow-hidden rounded-[28px] border border-[hsl(var(--color-border)/0.38)] bg-[hsl(var(--color-surface-glass)/0.18)] backdrop-blur-md transition duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-soft)]"
                    >
                      <div style={{ aspectRatio: aspectRatioToCss(image.aspect_ratio) }}>
                        <img src={image.image_url} alt={image.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]" loading="lazy" />
                      </div>
                      <div className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border)/0.64)] bg-[hsl(var(--color-bg)/0.5)] px-3 py-1.5 text-[11px] font-medium backdrop-blur-md">
                        <Layers3 className="h-3.5 w-3.5" />
                        {image.model_key}
                      </div>
                      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,hsl(var(--color-bg)/0.94),transparent)] p-4">
                        <p className="line-clamp-1 text-base font-semibold">{image.title}</p>
                        <p className="mt-1 line-clamp-2 text-sm leading-6 text-[hsl(var(--color-muted))]">{image.prompt}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
*/}
            <section id="pricing" className="scroll-mt-24 pt-8 sm:pt-10">
              <div className="grid gap-5 2xl:grid-cols-[1.05fr_0.95fr]">
                <div className="space-y-3">
                  <p className="rangmanch-section-eyebrow">Plans</p>
                  <h2 className="text-[2rem] font-extrabold tracking-tight sm:text-4xl">Move from testing to production without changing your workflow.</h2>
                  <p className="max-w-2xl text-sm leading-7 text-[hsl(var(--color-muted))] sm:text-base">
                    Start free, then scale into creator and client workflows with transparent credit-based creation for images, videos, and templates.
                  </p>
                  <p className="max-w-2xl text-xs leading-6 text-[hsl(var(--color-muted))] sm:text-sm">
                    Credits help you create test visuals, reels, template outputs, and premium generations without locking you into one rigid workflow.
                  </p>
                  <div className="flex flex-wrap gap-3 pt-2">
                    <Link href="/pricing" className="inline-flex w-full items-center justify-center rounded-full bg-[hsl(var(--color-text))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-bg))] sm:w-auto">
                      View pricing
                    </Link>
                    <Link href="/signup" className="inline-flex w-full items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.52)] px-5 py-2.5 text-sm font-medium sm:w-auto">
                      Start free
                    </Link>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {[
                    ['Free', '40 credits / month', 'Get 40 free credits every month for image, voice, and first renders.'],
                    ['Starter', '200 credits', 'Good for repeat creator workflows and short-form output.'],
                    ['Creator', '550 credits', 'Built for serious publishing and balanced premium usage.'],
                  ].map(([name, credits, blurb]) => (
                    <div
                      key={name}
                      className="rounded-[24px] border border-[hsl(var(--color-border)/0.44)] bg-[hsl(var(--color-surface-glass)/0.24)] p-4 backdrop-blur-md sm:rounded-[26px]"
                    >
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="mt-4 text-2xl font-extrabold tracking-tight">{credits}</p>
                      <p className="mt-3 text-sm leading-6 text-[hsl(var(--color-muted))]">{blurb}</p>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="pt-10">
              <LandingFooter />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
