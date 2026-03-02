import Link from "next/link";
import { ArrowRight, CheckCircle2, Globe2, Sparkles, Subtitles, Zap, Shield, Layers3, Workflow } from "lucide-react";

function SectionHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      {eyebrow ? (
        <div className="mb-3 inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/80">
          {eyebrow}
        </div>
      ) : null}
      <h1 className="text-balance text-3xl font-semibold tracking-tight text-white sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-4 text-pretty text-base leading-7 text-white/70 sm:text-lg">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
  points,
}: {
  icon: any;
  title: string;
  desc: string;
  points?: string[];
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 shadow-sm backdrop-blur">
      <div className="absolute -right-20 -top-20 h-44 w-44 rounded-full bg-white/10 blur-2xl transition-opacity group-hover:opacity-80" />
      <div className="relative">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/30">
          <Icon className="h-5 w-5 text-white/85" />
        </div>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-white/70">{desc}</p>
        {points?.length ? (
          <ul className="mt-4 space-y-2">
            {points.map((p) => (
              <li key={p} className="flex gap-2 text-sm text-white/70">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-white/70" />
                <span>{p}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-4">
      <div className="text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-white/60">{label}</div>
    </div>
  );
}

export default function PlatformPage() {
  return (
    <main className="relative">
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-black to-black" />
        <div className="absolute left-1/2 top-[-140px] h-[340px] w-[680px] -translate-x-1/2 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-[-180px] left-[-120px] h-[360px] w-[360px] rounded-full bg-white/5 blur-3xl" />
        <div className="absolute right-[-140px] top-[35%] h-[420px] w-[420px] rounded-full bg-white/5 blur-3xl" />
      </div>

      {/* Hero */}
      <section className="px-4 pt-16 sm:pt-20">
        <div className="mx-auto max-w-6xl">
          <SectionHeader
            eyebrow="Platform"
            title="A unified AI video platform built for speed, consistency, and scale"
            subtitle="Create videos with templates + AI b-roll, multilingual narration (India-first), captions, and reliable async rendering—without wrestling 5 different tools."
          />

          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
            <StatPill label="Pipeline" value="Template + AI b-roll" />
            <StatPill label="Languages" value="India-first voices" />
            <StatPill label="Rendering" value="Async + tracked" />
          </div>

          <div className="mx-auto mt-10 flex max-w-3xl flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/create"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black shadow-sm transition hover:bg-white/90 sm:w-auto"
            >
              Start creating <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/templates"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
            >
              Browse templates
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="px-4 py-14 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Everything you need to go from script to shareable video
            </h2>
            <p className="mt-3 text-base leading-7 text-white/70">
              A “standard SaaS platform page” should answer: what it does, how it works, and why it’s better.
              Here’s that—tailored to your stack and product.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <FeatureCard
              icon={Layers3}
              title="Template-first reliability"
              desc="Start with proven structures—then enhance with AI b-roll so output stays consistent at scale."
              points={[
                "Brand-safe layouts + reusable styles",
                "Fallbacks when AI assets fail",
                "Fast iteration across formats",
              ]}
            />
            <FeatureCard
              icon={Globe2}
              title="India language-first voices"
              desc="Multilingual narration designed for Indian audiences—Hindi + regional language path baked in."
              points={[
                "Voice selection + persona mapping",
                "Script-to-voice with caching",
                "Consistent tone across series",
              ]}
            />
            <FeatureCard
              icon={Subtitles}
              title="Captions that actually help retention"
              desc="Burned-in or sidecar captions, designed for mobile-first consumption."
              points={[
                "Auto-captions aligned to voice",
                "Readable styling + safe margins",
                "Export-ready formats",
              ]}
            />
            <FeatureCard
              icon={Workflow}
              title="Project-based creation"
              desc="Organize videos as projects with reusable settings, assets, and creative defaults."
              points={[
                "Assets, music, SFX, fonts",
                "Scene library & reusability",
                "Collaboration-friendly structure",
              ]}
            />
            <FeatureCard
              icon={Zap}
              title="Async renders with tracking"
              desc="No waiting on the UI. Queue jobs, track progress, and deliver final URLs reliably."
              points={[
                "Render status polling + completion",
                "Download/share delivery links",
                "Retry-safe job handling",
              ]}
            />
            <FeatureCard
              icon={Shield}
              title="User-scoped data & safety"
              desc="Ownership-based document paths and locked Firestore rules—ready for multi-tenant SaaS."
              points={[
                "users/{uid}/… data model",
                "Rules tied to auth.uid",
                "Clean migration path",
              ]}
            />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-4 pb-14 sm:pb-16">
        <div className="mx-auto max-w-6xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-xl font-semibold text-white">How it works</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">
                Designed like the best creator tools: guided steps, minimal clutter, and a clear “generate → track → deliver”
                loop.
              </p>

              <ol className="mt-6 space-y-4">
                {[
                  {
                    t: "Pick a template or start from script",
                    d: "Choose a structure that fits your content type—then paste your script.",
                  },
                  {
                    t: "Choose voice + language",
                    d: "Select a voice persona and generate narration with consistent style.",
                  },
                  {
                    t: "Customize assets",
                    d: "Add b-roll, images, background music, SFX, and caption preferences.",
                  },
                  {
                    t: "Generate",
                    d: "Render runs async. You get progress tracking and a final delivery URL.",
                  },
                ].map((s, idx) => (
                  <li key={s.t} className="flex gap-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-black/30 text-sm font-semibold text-white/85">
                      {idx + 1}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">{s.t}</div>
                      <div className="mt-1 text-sm text-white/70">{s.d}</div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-7">
              <h3 className="text-xl font-semibold text-white">Built for creators & teams</h3>
              <p className="mt-2 text-sm leading-6 text-white/70">
                The “platform” is not just features—it’s the workflow that stays consistent when you produce 10→100→1000 videos.
              </p>

              <div className="mt-6 space-y-3">
                {[
                  "Reusable creative settings per project (fonts, caption style, music defaults).",
                  "Scene library for quick assembly and remixing.",
                  "Safe delivery URLs and render job history.",
                  "Designed for mobile-first viewing (captions, spacing, clarity).",
                ].map((p) => (
                  <div
                    key={p}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 text-white/75" />
                    <p className="text-sm text-white/70">{p}</p>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/pricing"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 sm:w-auto"
                >
                  See pricing
                </Link>
                <Link
                  href="/create"
                  className="inline-flex w-full items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 sm:w-auto"
                >
                  Create a video <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="px-4 pb-20">
        <div className="mx-auto max-w-6xl">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-8 sm:p-10">
            <div className="absolute -right-28 -top-28 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
            <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white sm:text-2xl">
                  Ready to build your first video pipeline?
                </h3>
                <p className="mt-2 text-sm text-white/70">
                  Start with a template, add voice + captions, and ship with async renders and delivery URLs.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/create"
                  className="inline-flex items-center justify-center rounded-xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
                >
                  Start creating <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
                <Link
                  href="/docs"
                  className="inline-flex items-center justify-center rounded-xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                >
                  View docs
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}