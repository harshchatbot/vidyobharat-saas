import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Clapperboard, ImageIcon, PlaySquare, Sparkles, Wand2 } from 'lucide-react';

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
                          Create cinematic AI videos from text, images, and character workflows.
                        </h1>
                        <p className="max-w-2xl text-sm leading-6 text-[hsl(var(--color-muted))] sm:text-[15px] sm:leading-7 lg:text-base">
                          RangManch AI brings together text-to-video, image animation, AI influencer workflows, and short-form publishing inside one visual-first studio.
                        </p>
                      </div>
                      <HeroPromptBar />
                    </div>
                  </div>
                </div>
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
                    Start with the free studio, then move into creator-grade packs when you need more renders, more voice, and premium output.
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
