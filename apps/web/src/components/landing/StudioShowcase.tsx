'use client';

import type { ReactNode } from 'react';
import { Clapperboard, Megaphone, Sparkles, UserRound } from 'lucide-react';
import { motion } from 'framer-motion';

import { MediaTile } from '@/components/landing/MediaTile';

const showcaseItems: Array<{
  eyebrow: string;
  title: string;
  description: string;
  mediaSrc?: string;
  imageSrc?: string;
  badge: string;
  icon: ReactNode;
  meta: string;
}> = [
  {
    eyebrow: 'Daily reels',
    title: 'Fast short-form publishing',
    description: 'Practical daily output for Instagram reels, repeat posting, and budget-safe publishing.',
    mediaSrc: '/videos/samples/tamil-education-9x16.mp4',
    badge: 'Daily',
    icon: <Clapperboard className="h-4 w-4" />,
    meta: 'Affordable • frequent posting',
  },
  {
    eyebrow: 'Creator Pro',
    title: 'Balanced creator-grade quality',
    description: 'Better motion, stronger polish, and more flexibility for coaches, brands, and serious creators.',
    mediaSrc: '/videos/samples/english-startup-16x9.mp4',
    badge: 'Recommended',
    icon: <Sparkles className="h-4 w-4" />,
    meta: 'Balanced • best for most users',
  },
  {
    eyebrow: 'Premium / Cinema',
    title: 'Campaign visuals and hero films',
    description: 'Use premium routing for launch assets, cinematic product stories, and flagship ad output.',
    mediaSrc: '/videos/samples/hindi-festival-9x16.mp4',
    badge: 'Premium',
    icon: <Megaphone className="h-4 w-4" />,
    meta: 'Highest quality • ads and launches',
  },
  {
    eyebrow: 'AI influencer',
    title: 'Consistent persona storytelling',
    description: 'Lock a character identity, reuse visual memory, and build repeatable creator-led content.',
    imageSrc: '/brand/logo-light.png',
    badge: 'Persona',
    icon: <UserRound className="h-4 w-4" />,
    meta: 'Lock identity • scene variation',
  },
];

export function StudioShowcase() {
  return (
    <section className="space-y-6 py-8">
      <div className="max-w-3xl">
        <p className="rangmanch-section-eyebrow">Use cases</p>
        <h2 className="mt-1 rangmanch-section-title">Choose the kind of video workflow you want to launch</h2>
        <p className="mt-2 text-sm leading-6 text-muted sm:text-base">
          RangManch AI is structured for everyday reels, polished creator output, premium hero videos, persona-led content,
          and product-first ad storytelling.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {showcaseItems.map((item, index) => (
          <motion.div
            key={item.title}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-40px' }}
            transition={{ duration: 0.4, delay: Math.min(index * 0.06, 0.24), ease: 'easeOut' }}
          >
            <MediaTile
              title={item.title}
              description={item.description}
              mediaSrc={item.mediaSrc}
              imageSrc={item.imageSrc}
              eyebrow={item.eyebrow}
              badge={item.badge}
              icon={item.icon}
              meta={item.meta}
              href="/signup"
              className="min-h-full"
            />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
