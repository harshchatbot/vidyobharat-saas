'use client';

import Link from 'next/link';
import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Check,
  Film,
  Heart,
  ImagePlus,
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
import { AnimatedMarqueeHero } from '@/components/ui/hero-3';
import { AnimatedTestimonialGrid } from '@/components/landing/AnimatedTestimonialGrid';
import { LampContainer } from '@/components/ui/lamp';
import { heroMedia } from '@/config/heroMedia';
import { cn } from '@/lib/utils';

const testimonialImages = [
  { imgSrc: 'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=200&h=200&fit=crop', alt: 'Creator 1' },
  { imgSrc: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&h=200&fit=crop', alt: 'Creator 2' },
  { imgSrc: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&h=200&fit=crop', alt: 'Creator 3' },
  { imgSrc: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=200&h=200&fit=crop', alt: 'Creator 4' },
  { imgSrc: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?w=200&h=200&fit=crop', alt: 'Creator 5' },
  { imgSrc: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?w=200&h=200&fit=crop', alt: 'Creator 6' },
  { imgSrc: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&h=200&fit=crop', alt: 'Creator 7' },
  { imgSrc: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&h=200&fit=crop', alt: 'Creator 8' },
  { imgSrc: 'https://images.unsplash.com/photo-1488161628813-04466f872be2?w=200&h=200&fit=crop', alt: 'Creator 9' },
  { imgSrc: 'https://images.unsplash.com/photo-1514315384763-ba401779410f?w=200&h=200&fit=crop', alt: 'Creator 10' },
  { imgSrc: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&h=200&fit=crop', alt: 'Creator 11' },
];

const glassPanelStyle = {
  borderColor: 'var(--landing-glass-border)',
  background: 'var(--landing-glass-panel-bg)',
  backdropFilter: 'blur(22px)',
  boxShadow: 'var(--landing-glass-shadow)',
} as const;

const glassTileStyle = {
  borderColor: 'var(--landing-glass-border)',
  background: 'var(--landing-glass-tile-bg)',
  backdropFilter: 'blur(18px)',
  boxShadow: 'var(--landing-tile-shadow)',
} as const;

function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/create', label: 'Create' },
    { href: '/videos', label: 'Videos' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/learning', label: 'Learn' },
  ];

  return (
    <header
      className="sticky top-3 z-30 py-3"
    >
      <div
        className="mx-auto flex min-h-14 max-w-[1180px] items-center justify-between gap-2 rounded-full border px-2.5 py-2 shadow-[var(--landing-tile-shadow)] backdrop-blur-2xl sm:min-h-16 sm:gap-4 sm:px-4"
        style={{
          borderColor: 'var(--landing-glass-border)',
          background:
            'linear-gradient(135deg, hsl(var(--color-surface) / 0.72), hsl(var(--color-elevated) / 0.48))',
        }}
      >
        <BrandLogo href="/" variant="full" size="md" className="max-w-[130px] min-[420px]:max-w-[160px] sm:max-w-[220px]" />

        <nav
          className="hidden items-center rounded-full border px-2 py-1 text-sm font-semibold lg:flex"
          style={{
            borderColor: 'var(--landing-glass-border)',
            background: 'var(--landing-glass-tile-bg)',
            color: 'var(--landing-title)',
          }}
        >
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-4 py-2 transition hover:bg-[hsl(var(--color-accent-amber)/0.1)] hover:text-[hsl(var(--color-accent-amber))]"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:inline-flex">
            <ToggleTheme />
          </div>
          <Link
            href="/login"
            className="hidden rounded-full px-4 py-2 text-sm font-semibold transition hover:bg-[hsl(var(--color-accent-amber)/0.1)] hover:text-[hsl(var(--color-accent-amber))] sm:inline-flex"
            style={{ color: 'var(--landing-title)' }}
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold sm:gap-2 sm:px-4 sm:py-2.5 sm:text-sm"
            style={{
              background: 'hsl(var(--color-accent-amber))',
              color: '#0A0A0F',
              boxShadow: '0 18px 60px hsl(var(--color-accent-amber) / 0.24)'
            }}
          >
            <span className="hidden min-[390px]:inline">Start free</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((current) => !current)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full lg:hidden"
            style={{
              border: `1px solid var(--landing-glass-border)`,
              background: `var(--landing-glass-tile-bg)`,
              color: 'var(--landing-title)',
              boxShadow: 'var(--shadow-sm)'
            }}
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>
      {mobileMenuOpen && (
        <div className="mx-auto max-w-[1180px] px-3 py-3 lg:hidden">
          <div
            className="overflow-hidden rounded-[26px] border p-3 backdrop-blur-xl"
            style={glassPanelStyle}
          >
            <div
              className="rounded-[20px] border px-4 py-3"
              style={{
                borderColor: `var(--landing-glass-border)`,
                background: `var(--landing-glass-tile-bg)`
              }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>Explore RangManch</p>
              <p className="mt-1 text-sm leading-6" style={{ color: 'var(--landing-muted)' }}>Jump into create, browse galleries, check pricing, or switch your theme.</p>
            </div>
            <div className="mt-3 grid gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="group rounded-[18px] border px-4 py-3.5 text-sm font-medium transition hover:-translate-y-0.5"
                style={{
                  borderColor: `var(--landing-glass-border)`,
                  background: `var(--landing-glass-tile-bg)`,
                  color: 'var(--landing-title)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                <span className="flex items-center justify-between gap-3">
                  <span>{item.label}</span>
                  <ArrowRight className="h-4 w-4 transition" style={{ color: 'var(--landing-muted)' }} />
                </span>
              </Link>
            ))}
            </div>
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-[18px] border px-4 py-3 sm:hidden"
              style={{
                borderColor: `var(--landing-glass-border)`,
                background: `var(--landing-glass-tile-bg)`,
                boxShadow: 'var(--shadow-sm)'
              }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--landing-title)' }}>Theme</p>
                <p className="mt-0.5 text-xs" style={{ color: 'var(--landing-muted)' }}>Switch light or dark mode</p>
              </div>
              <ToggleTheme />
            </div>
            <div className="mt-3 grid gap-2 sm:hidden">
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="rounded-[18px] border px-4 py-3.5 text-center text-sm font-medium"
                style={{
                  borderColor: `var(--landing-glass-border)`,
                  background: `var(--landing-glass-tile-bg)`,
                  color: 'var(--landing-title)',
                  boxShadow: 'var(--shadow-sm)'
                }}
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-[18px] px-4 py-3.5 text-sm font-semibold"
                style={{
                  background: `hsl(var(--color-accent-amber))`,
                  color: '#0A0A0F',
                  boxShadow: '0 18px 60px hsl(var(--color-accent-amber) / 0.22)'
                }}
              >
                Start free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// SECTION 1: HERO
function HeroSection() {
  return (
    <motion.section
      className="relative overflow-hidden py-16 sm:py-24"
      style={{
        background: 'hsl(var(--color-bg))',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      <div style={{
        position: 'absolute', top: '-10%', left: '-5%',
        width: '500px', height: '500px', borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(var(--color-accent-amber) / 0.12) 0%, transparent 70%)',
        filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
        animation: 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      }} />
      <div style={{
        position: 'absolute', top: '20%', right: '-5%',
        width: '400px', height: '400px', borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(var(--color-accent-amber) / 0.08) 0%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none', zIndex: 0,
        animation: 'pulse 5s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.5s'
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', left: '30%',
        width: '300px', height: '300px', borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(var(--color-accent-amber) / 0.06) 0%, transparent 70%)',
        filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0,
        animation: 'pulse 6s cubic-bezier(0.4, 0, 0.6, 1) infinite 1s'
      }} />

      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center space-y-6">
          {/* Badge */}
          <motion.div
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
            style={{
              borderColor: 'hsl(var(--color-accent-amber) / 0.3)',
              background: 'hsl(var(--color-accent-amber) / 0.08)',
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Sparkles className="h-3.5 w-3.5" style={{ color: 'hsl(var(--color-accent-amber))' }} />
            <span className="text-xs font-semibold" style={{ color: 'hsl(var(--color-accent-amber))' }}>
              40 free credits every month
            </span>
          </motion.div>

          <motion.h1
            className="font-heading text-[2.25rem] font-extrabold leading-[1.05] tracking-tight min-[420px]:text-[2.65rem] sm:text-[3.8rem] sm:leading-[1.08]"
            style={{
              color: 'var(--landing-title)',
              textShadow: '0 18px 60px hsl(var(--color-accent-amber) / 0.14)',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            Generate avatar ads, anime reels, and social videos fast.
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            className="mx-auto max-w-2xl text-sm sm:text-lg leading-7"
            style={{ color: 'var(--landing-muted)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            RangManch helps creators, brands, and small teams create quick UGC ads with AI avatars, guided anime lofi reels, and freeform videos without complicated model settings.
          </motion.p>

          {/* CTA Row */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-3 pt-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition hover:opacity-95 sm:px-6 sm:py-3.5 sm:text-base"
              style={{
                background: `linear-gradient(135deg,hsl(var(--color-accent-amber)),hsl(var(--color-accent-amber) / 0.78))`,
                color: '#0A0A0F',
                boxShadow: '0 18px 60px hsl(var(--color-accent-amber) / 0.26)'
              }}
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/create"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition hover:bg-[hsl(var(--color-surface)/0.3)] sm:py-3.5"
              style={{
                borderColor: `hsl(var(--color-border) / 0.3)`,
                background: `hsl(var(--color-surface) / 0.2)`,
                color: `var(--landing-title)`
              }}
            >
              Open studio
            </Link>
          </motion.div>

          {/* Micro social proof */}
          <motion.div
            className="pt-6 flex items-center justify-center gap-6 border-t"
            style={{ borderColor: 'hsl(var(--color-border) / 0.2)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6 }}
          >
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: 'hsl(var(--color-accent-amber))' }}>500+</p>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--landing-muted)' }}>Creators</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: 'hsl(var(--color-accent-amber))' }}>2.8K+</p>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--landing-muted)' }}>Videos</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-black" style={{ color: 'hsl(var(--color-accent-amber))' }}>₹0</p>
              <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--landing-muted)' }}>To start</p>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.section>
  );
}

// SECTION 1.5: ANIMATED MARQUEE HERO GALLERY (gallery only, no duplicate headline)
function AnimatedMarqueeHeroSection() {
  return (
    <section className="w-full overflow-hidden relative z-10">
      <AnimatedMarqueeHero
        images={[]}
        mediaItems={heroMedia}
        className="rounded-none border-0 bg-transparent shadow-none"
      />
    </section>
  );
}

// SECTION 2: TRUST BAR
function TrustBarSection() {
  const stats = [
    { value: '500+', label: 'Creators using RangManch' },
    { value: '2,800+', label: 'Videos generated' },
    { value: '3', label: 'AI Recipes available' },
    { value: '₹0', label: 'To start free' },
  ];

  return (
    <motion.section
      className="py-6 sm:py-8"
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-0 overflow-hidden rounded-[34px] border backdrop-blur-2xl md:grid-cols-4" style={glassPanelStyle}>
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                className="landing-stat-cell group relative flex flex-col items-center gap-2 px-4 py-5 text-center transition-transform duration-300 hover:-translate-y-0.5 sm:px-5 sm:py-6"
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
              >
                <h3
                  className="text-[2rem] sm:text-[2.2rem] font-black tracking-tight"
                  style={{
                    color: 'hsl(var(--color-accent-amber))',
                  }}
                >
                  {stat.value}
                </h3>
                <p className="text-[0.75rem] font-semibold" style={{ color: 'var(--landing-muted)' }}>
                  {stat.label}
                </p>
              </motion.div>
            ))}
        </div>
      </div>
    </motion.section>
  );
}

// SECTION 3: PROBLEM — The reality of traditional UGC production
function ProblemSection() {
  return (
    <section className="relative overflow-hidden rounded-[42px] border p-6 sm:p-8 lg:p-10" style={glassPanelStyle}>
      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--color-accent-amber)/0.5)] to-transparent" />
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>
          The reality
        </p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight sm:text-[3rem] sm:leading-[1.04]" style={{ color: 'var(--landing-title)' }}>
          Creating a UGC ad used to mean...
        </h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[
          { pain: 'Hiring a model', cost: '₹5,000–20,000 per shoot' },
          { pain: 'Booking a studio', cost: '₹3,000–10,000 per day' },
          { pain: 'Finding a video editor', cost: '₹2,000–8,000 per video' },
          { pain: 'Recording voiceover', cost: '₹1,500–5,000 per script' },
          { pain: 'Waiting 2–3 weeks', cost: 'Lost market opportunity' },
          { pain: 'Doing it all again', cost: 'For every new product' },
        ].map(item => (
          <div key={item.pain} className="rounded-[24px] border p-4" style={glassTileStyle}>
            <p className="flex items-center gap-2 font-semibold" style={{ color: 'var(--landing-title)' }}>
              <X className="h-4 w-4" style={{ color: 'hsl(var(--color-accent-amber))' }} />
              {item.pain}
            </p>
            <p className="mt-1 text-sm" style={{ color: 'var(--landing-muted)' }}>{item.cost}</p>
          </div>
        ))}
      </div>
      <p className="mt-8 text-center text-lg font-semibold italic" style={{ color: 'var(--landing-muted)' }}>
        "There had to be a better way."
      </p>
    </section>
  );
}

// SECTION 4: SOLUTION DEMO (5-step flow)
function SolutionDemoSection() {
  const steps = [
    {
      title: 'Upload your product',
      body: 'Add a product photo, angle, and basic campaign details.',
      icon: <UploadCloud className="h-5 w-5" />,
    },
    {
      title: 'Choose an AI avatar',
      body: 'Pick a presenter and quality lane based on your budget.',
      icon: <UserRound className="h-5 w-5" />,
    },
    {
      title: 'Add your message',
      body: 'Write the core benefit, problem solved, or call-to-action.',
      icon: <Sparkles className="h-5 w-5" />,
    },
    {
      title: 'Review and refine',
      body: 'Adjust avatar, pacing, or tone before generating.',
      icon: <Check className="h-5 w-5" />,
    },
    {
      title: 'Download and post',
      body: 'Get publish-ready video in seconds. Post to any platform.',
      icon: <Video className="h-5 w-5" />,
    },
  ];

  return (
    <motion.section
      className="py-12 sm:py-16"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>
            How it works
          </p>
          <h2 className="mt-3 font-heading text-[2.1rem] sm:text-[3rem] font-extrabold tracking-tight leading-[1.04]" style={{ color: 'var(--landing-title)' }}>
            Simple 5-step flow. No complexity.
          </h2>
        </div>

        <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {/* Connecting line (desktop only) */}
          <div className="absolute left-8 right-8 top-12 hidden h-1 lg:block" style={{
            background: 'linear-gradient(90deg, hsl(var(--color-accent-amber) / 0.2), hsl(var(--color-accent-amber) / 0.4), hsl(var(--color-accent-amber) / 0.2))',
            zIndex: 0
          }} />

          {steps.map((step, index) => (
            <motion.div
              key={step.title}
              className="relative z-10 rounded-[28px] border p-5"
              style={glassTileStyle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
            >
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border"
                style={{
                  borderColor: 'hsl(var(--color-accent-amber) / 0.3)',
                  background: 'hsl(var(--color-accent-amber) / 0.08)',
                  color: 'hsl(var(--color-accent-amber))'
                }}
              >
                {step.icon}
              </div>
              <div className="mt-4 text-sm font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--color-accent-amber))' }}>
                Step {index + 1}
              </div>
              <h3 className="mt-2 font-heading text-lg font-extrabold" style={{ color: 'var(--landing-title)' }}>
                {step.title}
              </h3>
              <p className="mt-2 text-xs leading-5" style={{ color: 'var(--landing-muted)' }}>
                {step.body}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

// SECTION 5: DIFFERENTIATORS — Why creators choose RangManchAI
function DifferentiatorsSection() {
  return (
    <section className="relative overflow-hidden rounded-[42px] border p-6 sm:p-8 lg:p-10" style={glassPanelStyle}>
      <div className="pointer-events-none absolute inset-y-10 right-0 w-1/3 bg-[radial-gradient(circle_at_center,hsl(var(--color-accent-amber)/0.12),transparent_62%)]" />
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>
          Why creators choose RangManchAI
        </p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight sm:text-[3rem] sm:leading-[1.04]" style={{ color: 'var(--landing-title)' }}>
          Three things nobody else offers
        </h2>
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        {[
          {
            icon: <UserRound className="h-7 w-7" />,
            badge: 'Industry first in India',
            title: 'Your own AI avatar',
            subtitle: 'Upload your photos → become the face of your brand',
            desc: 'No generic stock avatars. Upload 1–4 photos of yourself or your model. RangManchAI creates a custom avatar that looks like YOU — consistent across every ad you create.',
          },
          {
            icon: <Video className="h-7 w-7" />,
            badge: 'Regional language support',
            title: '12 Indian languages',
            subtitle: 'Hindi · Bengali · Marathi · Punjabi · Tamil + 7 more',
            desc: 'Your customers in Bengal speak Bengali. Your customers in Punjab speak Punjabi. Reach them in their language with natural, accent-aware voiceover — not a robotic translation.',
          },
          {
            icon: <Sparkles className="h-7 w-7" />,
            badge: 'Category intelligence',
            title: 'Product-aware AI',
            subtitle: 'Saree gets a twirl. Serum gets an application shot.',
            desc: 'Our AI understands your product category. Skincare ads show the avatar applying the product. Ethnic wear shows a full-body reveal with fabric movement. Food ads use sensory storytelling.',
          },
        ].map((card) => (
          <div key={card.title} className="relative rounded-[30px] border p-6" style={glassTileStyle}>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1" style={{ borderColor: 'hsl(var(--color-accent-amber) / 0.28)', background: 'hsl(var(--color-accent-amber) / 0.1)' }}>
              <span className="text-[10px] font-bold uppercase tracking-[0.1em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>
                {card.badge}
              </span>
            </div>
            <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-2xl border" style={{ borderColor: 'hsl(var(--color-accent-amber) / 0.25)', background: 'hsl(var(--color-accent-amber) / 0.1)', color: 'hsl(var(--color-accent-amber))' }}>
              {card.icon}
            </div>
            <h3 className="font-heading text-xl font-extrabold mb-2" style={{ color: 'var(--landing-title)' }}>{card.title}</h3>
            <p className="text-sm font-semibold mb-3" style={{ color: 'hsl(var(--color-accent-amber))' }}>{card.subtitle}</p>
            <p className="text-sm leading-7" style={{ color: 'var(--landing-muted)' }}>{card.desc}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// SECTION 6: CATEGORY SHOWCASE (6 product types)
function CategoryShowcaseSection() {
  const categories = [
    { title: 'AI Avatar Ads', desc: 'Quick UGC product ads', icon: <UserRound className="h-6 w-6" /> },
    { title: 'Anime Reels', desc: 'Guided anime lofi motion', icon: <Film className="h-6 w-6" /> },
    { title: 'Social Content', desc: 'Vertical platform-ready', icon: <Video className="h-6 w-6" /> },
    { title: 'Educational Videos', desc: 'Explainer and tutorial format', icon: <Layers3 className="h-6 w-6" /> },
    { title: 'Brand Stories', desc: 'Long-form narrative ads', icon: <Sparkles className="h-6 w-6" /> },
    { title: 'Freeform Creation', desc: 'Full custom control', icon: <ImagePlus className="h-6 w-6" /> },
  ];

  return (
    <motion.section
      className="py-12 sm:py-16"
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="mx-auto max-w-[1180px] px-4 sm:px-6 lg:px-8">
        <div className="mb-10 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>
            What you can create
          </p>
          <h2 className="mt-3 font-heading text-[2.1rem] sm:text-[3rem] font-extrabold tracking-tight leading-[1.04]" style={{ color: 'var(--landing-title)' }}>
            Six product types. One studio.
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat, idx) => (
            <motion.div
              key={cat.title}
              className="group rounded-[28px] border p-6 text-center transition-all hover:-translate-y-1 hover:border-[hsl(var(--color-accent-amber)/0.4)]"
              style={glassTileStyle}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.08 }}
            >
              <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl border" style={{ borderColor: 'hsl(var(--color-accent-amber) / 0.25)', background: 'hsl(var(--color-accent-amber) / 0.1)', color: 'hsl(var(--color-accent-amber))' }}>
                {cat.icon}
              </div>
              <h3 className="font-heading text-lg font-extrabold" style={{ color: 'var(--landing-title)' }}>
                {cat.title}
              </h3>
              <p className="mt-2 text-xs font-semibold" style={{ color: 'var(--landing-muted)' }}>
                {cat.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.section>
  );
}

// SECTION 6.5: RECIPE SHOWCASE (with video previews)
function RecipeShowcaseSection() {
  const recipes = [
    {
      src: '/hero/ugc_avtaar_product_ad.mp4',
      category: 'Avatar Product',
      title: 'Quick UGC ads with AI avatars',
      description: 'Upload product, pick avatar, generate ad.',
      highlights: ['Fast setup', 'Brand-ready output'],
      overlay: 'Product + avatar -> UGC ad',
    },
    {
      src: '/videos/samples/anime_lofi_reel.mp4',
      category: 'Anime Lofi Reel',
      title: 'Beautiful anime reels without prompt complexity',
      description: 'Choose character, vibe, and motion in minutes.',
      highlights: ['Guided inputs', 'Anime-first styling'],
      overlay: 'Character + vibe -> anime reel',
    },
    {
      src: '/videos/samples/panda_dancing.mp4',
      category: 'Make Anything Dance',
      title: 'Turn any character into a viral reel',
      description: 'Map one dance reference to any character.',
      highlights: ['Reference-led motion', 'Vertical-ready export'],
      overlay: 'Character + dance -> viral reel',
    }
  ];

  return (
    <motion.section
      className="relative overflow-hidden rounded-[42px] border p-5 sm:p-7 lg:p-8"
      style={glassPanelStyle}
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div className="max-w-3xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: `hsl(var(--color-accent-amber))` }}>Guided recipes</p>
        <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight sm:text-[3rem] sm:leading-[1.04]"
          style={{
            color: 'var(--landing-title)',
          }}>
          Three fast ways to see RangManch working for you.
        </h2>
      </div>

      <div className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--color-accent-amber)/0.55)] to-transparent" />
      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {recipes.map((recipe, index) => (
          <motion.article
            key={recipe.title}
            className="glass-card flex h-full flex-col overflow-hidden rounded-[30px]"
            style={{
              background: 'linear-gradient(180deg, hsl(230 10% 15% / 0.96) 0%, hsl(230 12% 9% / 0.94) 100%)',
              borderColor: 'hsl(var(--color-accent-amber) / 0.18)',
              boxShadow: '0 24px 80px hsl(var(--color-text) / 0.1)',
              backdropFilter: 'blur(18px)',
            }}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: index * 0.15 }}
          >
            <div className="flex h-full flex-col">
              <div
                className="relative border-b"
                style={{
                  borderColor: `hsl(var(--color-border) / 0.5)`,
                  background: 'radial-gradient(circle at top, hsl(var(--color-accent-amber) / 0.08), transparent 65%)',
                }}
              >
                <LandingVideo
                  src={recipe.src}
                  poster={recipe.src}
                  className="aspect-[4/5] h-full w-full object-cover"
                />
                {recipe.overlay && (
                  <div
                    className="absolute inset-x-3 bottom-3 rounded-[16px] border px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] backdrop-blur"
                    style={{
                      borderColor: `hsl(var(--color-border) / 0.3)`,
                      background: `rgba(10, 10, 15, 0.82)`,
                      color: '#F8FAFC',
                    }}
                  >
                    {recipe.overlay}
                  </div>
                )}
              </div>
              <div
                className="flex flex-1 flex-col p-5 sm:p-6"
                style={{
                  background: 'linear-gradient(180deg, hsl(230 10% 15% / 0.96) 0%, hsl(230 12% 9% / 0.94) 100%)',
                }}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: `hsl(var(--color-accent-amber))` }}>{recipe.category}</p>
                <h3
                  className="mt-3 font-heading text-[1.55rem] font-extrabold leading-[1.08] tracking-tight sm:text-[1.75rem] lg:min-h-[7.5rem] lg:text-[2rem] lg:leading-[1.06]"
                  style={{ color: '#F8FAFC' }}
                >
                  {recipe.title}
                </h3>
                <p className="mt-3 text-sm leading-6 lg:min-h-[3.25rem]" style={{ color: '#C7CBD6' }}>
                  {recipe.description}
                </p>
                <div className="mt-5 flex flex-wrap gap-2 pt-1">
                  {recipe.highlights.map((feature) => (
                    <span
                      key={feature}
                      className="inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]"
                      style={{
                        borderColor: 'rgba(245, 158, 11, 0.2)',
                        background: 'rgba(245, 158, 11, 0.08)',
                        color: '#F8FAFC',
                      }}
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}

// SECTION 7: LANGUAGE SECTION — 12 Indian languages with natural voices
function LanguageSection() {
  return (
    <section className="relative overflow-hidden rounded-[42px] border p-6 text-center sm:p-8 lg:p-10" style={glassPanelStyle}>
      <div className="pointer-events-none absolute -left-16 top-1/2 h-48 w-48 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'hsl(var(--color-accent-amber) / 0.1)' }} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: 'hsl(var(--color-accent-amber))' }}>
        Speak their language
      </p>
      <h2 className="mt-3 font-heading text-[2.1rem] font-extrabold tracking-tight sm:text-[3rem] sm:leading-[1.04]" style={{ color: 'var(--landing-title)' }}>
        12 Indian languages. Natural voices.
      </h2>
      <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 sm:text-base" style={{ color: 'var(--landing-muted)' }}>
        From Hindi to Tamil, Bengali to Punjabi — reach customers in their mother tongue with voices that sound natural, not robotic.
      </p>
      <div className="mt-8 flex flex-wrap gap-3 justify-center">
        {[
          { lang: 'Hindi', script: 'हिंदी' },
          { lang: 'English (India)', script: 'English' },
          { lang: 'Hinglish', script: 'Hinglish' },
          { lang: 'Bengali', script: 'বাংলা' },
          { lang: 'Marathi', script: 'मराठी' },
          { lang: 'Tamil', script: 'தமிழ்' },
          { lang: 'Telugu', script: 'తెలుగు' },
          { lang: 'Gujarati', script: 'ગુજરાતી' },
          { lang: 'Kannada', script: 'ಕನ್ನಡ' },
          { lang: 'Malayalam', script: 'മലയാളം' },
          { lang: 'Punjabi', script: 'ਪੰਜਾਬੀ' },
          { lang: 'Odia', script: 'ଓଡ଼ିଆ' },
        ].map(l => (
          <div key={l.lang} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 backdrop-blur-xl" style={glassTileStyle}>
            <span className="text-sm font-medium" style={{ color: 'var(--landing-title)' }}>{l.lang}</span>
            <span className="text-xs" style={{ color: 'var(--landing-muted)' }}>{l.script}</span>
          </div>
        ))}
      </div>
      <div className="mt-8">
        <Link href="/signup" className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold" style={{ background: 'hsl(var(--color-accent-amber))', color: '#0A0A0F' }}>
          Preview voices free
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}

// SECTION 8: SOCIAL PROOF (using AnimatedTestimonialGrid)
function SocialProofSection() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <AnimatedTestimonialGrid
        testimonials={testimonialImages}
        badgeText="500+ Creators"
        title="Loved by creators worldwide"
        description="Join creators, agencies, and D2C brands making AI-powered content with RangManchAI"
        ctaText="Start free today"
        ctaHref="/signup"
      />
    </motion.div>
  );
}

// SECTION 9: PRICING ANCHOR
function PricingAnchorSection() {
  const creditExamples = [
    ['Monthly free credits', '40 every month'],
    ['New user activation bonus', '120 one-time credits'],
    ['Affordable 5s avatar ad', '49 credits'],
  ];

  return (
    <motion.section
      className="grid gap-6 rounded-[34px] border p-6 text-[var(--landing-title)] sm:p-8 lg:grid-cols-[0.95fr_1.05fr] lg:p-10"
      style={glassPanelStyle}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: `hsl(var(--color-accent-amber))` }}>Simple credits</p>
        <h2 className="mt-3 font-heading text-[2.1rem] sm:text-[3rem] font-extrabold tracking-tight leading-[1.04]" style={{ color: 'var(--landing-title)' }}>
          Start free, test fast, and scale when content works.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-7 sm:text-base" style={{ color: `var(--landing-muted)` }}>
          Every user gets 40 free credits every month, plus a one-time 120 credit activation bonus. Use across images, videos, reels, and Avatar Product Ads.
        </p>
        <Link
          href="/pricing"
          className="mt-6 inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition hover:bg-[hsl(var(--color-surface)/0.3)]"
          style={{ borderColor: `hsl(var(--color-border) / 0.3)`, background: `hsl(var(--color-surface) / 0.2)` }}
        >
          View plans
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="space-y-3">
        {creditExamples.map(([label, value]) => (
          <motion.div
            key={label}
            className="flex items-center justify-between rounded-2xl border px-4 py-3"
            style={glassTileStyle}
            initial={{ opacity: 0, x: 10 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.3 }}
          >
            <span className="text-sm" style={{ color: `var(--landing-muted)` }}>{label}</span>
            <span className="text-sm font-bold">{value}</span>
          </motion.div>
        ))}
        <p className="px-1 text-xs leading-5" style={{ color: `var(--landing-muted)` }}>Examples are approximate. Actual credits vary by model, duration, audio mode, references, and add-ons.</p>
      </div>
    </motion.section>
  );
}

// SECTION 10: FINAL CTA
function FinalCtaSection() {
  return (
    <motion.section
      className="overflow-hidden rounded-[36px] border"
      style={{ borderColor: `hsl(var(--color-border) / 0.3)` }}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-50px' }}
      transition={{ duration: 0.5 }}
    >
      <LampContainer className="min-h-[31rem] md:min-h-[36rem]">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-5">
          <p className="inline-flex items-center justify-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em]" style={{ color: `hsl(var(--color-accent-amber))` }}>
            <Heart className="h-3.5 w-3.5" />
            Made for Indian creators
          </p>

          <h2 className="mt-4 font-heading text-[2rem] font-extrabold leading-[1.04] tracking-tight sm:text-[3.4rem] sm:leading-[1.02]"
            style={{
              color: 'var(--landing-title)',
            }}>
            Start with a guided recipe, create freely from there.
          </h2>

          <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 sm:text-base" style={{ color: `var(--landing-muted)` }}>
            Build AI avatar ads, anime reels, and freeform videos from one studio. Designed to help you publish faster, not learn jargon.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/signup"
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold transition hover:opacity-95 sm:px-6 sm:py-3.5 sm:text-base"
              style={{
                background: `linear-gradient(135deg,hsl(var(--color-accent-amber)),hsl(var(--color-accent-amber) / 0.78))`,
                color: '#0A0A0F',
                boxShadow: '0 18px 60px hsl(var(--color-accent-amber) / 0.26)'
              }}
            >
              Start free
              <ArrowRight className="h-4 w-4" />
            </Link>

            <Link
              href="/create"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-3 text-sm font-semibold transition hover:bg-[hsl(var(--color-surface)/0.3)] sm:py-3.5"
              style={{
                borderColor: `hsl(var(--color-border) / 0.3)`,
                background: `hsl(var(--color-surface) / 0.2)`,
                color: `var(--landing-title)`
              }}
            >
              Open studio
            </Link>
          </div>
        </div>
      </LampContainer>
    </motion.section>
  );
}

export function PublicStudioLanding() {
  return (
    <div
      className="landing-page mesh-bg relative min-h-screen overflow-hidden text-[var(--landing-title)]"
      style={{
        background: `radial-gradient(circle_at_16%_8%,hsl(var(--color-accent-amber)/0.18),transparent_30%),radial-gradient(circle_at_82%_16%,hsl(var(--color-accent-amber)/0.1),transparent_26%),radial-gradient(circle_at_50%_58%,hsl(var(--color-accent-amber)/0.06),transparent_34%),linear-gradient(180deg,hsl(var(--color-bg-soft)),hsl(var(--color-bg))_34%,hsl(var(--color-bg)))`
      }}
    >
      <div className="pointer-events-none fixed inset-0 z-0 opacity-[0.18]" style={{ backgroundImage: 'linear-gradient(hsl(var(--color-text) / 0.08) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--color-text) / 0.08) 1px, transparent 1px)', backgroundSize: '72px 72px' }} />
      {/* HERO + HEADER */}
      <div style={{ position: 'relative', overflow: 'hidden', zIndex: 1 }}>
        <div className="mx-auto w-full max-w-[1180px] px-4 sm:px-6 lg:px-8 relative z-10">
          <Header />
        </div>
        <HeroSection />
      </div>

      {/* ANIMATED MARQUEE GALLERY (after Hero) */}
      <AnimatedMarqueeHeroSection />

      {/* MAIN CONTENT SECTIONS */}
      <div className="mx-auto w-full max-w-[1180px] px-4 pb-10 sm:px-6 lg:px-8 relative z-10">
        <main className="space-y-12 pb-8 sm:space-y-14">
          {/* SECTION 2: Trust Bar */}
          <TrustBarSection />

          {/* SECTION 3: Problem */}
          <ProblemSection />

          {/* SECTION 4: Solution Demo */}
          <SolutionDemoSection />

          {/* SECTION 5: Differentiators */}
          <DifferentiatorsSection />

          {/* SECTION 6: Category Showcase */}
          <CategoryShowcaseSection />

          {/* SECTION 6.5: Recipe Showcase (with video previews) */}
          <RecipeShowcaseSection />

          {/* SECTION 7: Languages */}
          <LanguageSection />

          {/* SECTION 8: Social Proof */}
          <SocialProofSection />

          {/* SECTION 9: Pricing */}
          <PricingAnchorSection />

          {/* SECTION 10: Final CTA */}
          <FinalCtaSection />

          {/* SECTION 11: Footer */}
          <LandingFooter />
        </main>
      </div>

      {/* Add keyframes for pulse animation */}
      <style>{`
        .landing-page {
          --landing-title: #101014;
          --landing-muted: #5f6572;
          --landing-glass-border: rgba(17, 24, 39, 0.11);
          --landing-glass-panel-bg:
            radial-gradient(circle at 14% 0%, rgba(245, 158, 11, 0.13), transparent 34%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.82), rgba(255, 255, 255, 0.54));
          --landing-glass-tile-bg:
            linear-gradient(180deg, rgba(255, 255, 255, 0.74), rgba(255, 255, 255, 0.46));
          --landing-glass-shadow: 0 28px 100px rgba(17, 24, 39, 0.08);
          --landing-tile-shadow: 0 18px 60px rgba(17, 24, 39, 0.08);
        }

        .dark .landing-page {
          --landing-title: #f8fafc;
          --landing-muted: #c7cbd6;
          --landing-glass-border: rgba(255, 255, 255, 0.13);
          --landing-glass-panel-bg:
            radial-gradient(circle at 14% 0%, rgba(245, 158, 11, 0.13), transparent 34%),
            linear-gradient(135deg, rgba(25, 25, 34, 0.68), rgba(12, 12, 17, 0.54));
          --landing-glass-tile-bg:
            linear-gradient(180deg, rgba(29, 29, 39, 0.66), rgba(13, 13, 19, 0.48));
          --landing-glass-shadow: 0 30px 120px rgba(0, 0, 0, 0.34);
          --landing-tile-shadow: 0 20px 76px rgba(0, 0, 0, 0.28);
        }

        .landing-stat-cell {
          border-bottom: 1px solid var(--landing-glass-border);
        }

        .landing-stat-cell:nth-child(odd) {
          border-right: 1px solid var(--landing-glass-border);
        }

        .landing-stat-cell:nth-child(n + 3) {
          border-bottom: 0;
        }

        @media (min-width: 768px) {
          .landing-stat-cell {
            border-bottom: 0;
            border-right: 1px solid var(--landing-glass-border);
          }

          .landing-stat-cell:last-child {
            border-right: 0;
          }
        }

        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  );
}
