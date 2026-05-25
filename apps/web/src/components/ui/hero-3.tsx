'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';

import { LandingVideo } from '@/components/landing/LandingVideo';
import { cn } from '@/lib/utils';

export interface AnimatedMarqueeHeroMediaItem {
  type: 'image' | 'video';
  src: string;
  alt: string;
  poster?: string;
}

interface AnimatedMarqueeHeroProps {
  tagline?: string;
  title?: React.ReactNode;
  description?: string;
  ctaText?: string;
  images: string[];
  mediaItems?: AnimatedMarqueeHeroMediaItem[];
  className?: string;
  onCtaClick?: () => void;
  ctaHref?: string;
}

const ActionButton = ({
  children,
  onClick,
  href,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
}) => (
  <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} className="mt-8">
    {href ? (
      <Link
        href={href}
        className="inline-flex rounded-full px-8 py-3 font-semibold shadow-[var(--shadow-float)] transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-accent-amber)/0.45)]"
        style={{ background: 'hsl(var(--color-accent-amber))', color: '#0A0A0F' }}
      >
        {children}
      </Link>
    ) : (
      <button
        type="button"
        onClick={onClick}
        className="rounded-full px-8 py-3 font-semibold shadow-[var(--shadow-float)] transition-colors hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-accent-amber)/0.45)]"
        style={{ background: 'hsl(var(--color-accent-amber))', color: '#0A0A0F' }}
      >
        {children}
      </button>
    )}
  </motion.div>
);

export const AnimatedMarqueeHero: React.FC<AnimatedMarqueeHeroProps> = ({
  tagline,
  title,
  description,
  ctaText,
  images,
  mediaItems,
  className,
  onCtaClick,
  ctaHref,
}) => {
  const fadeInAnimationVariants = {
    hidden: { opacity: 0, y: 10 },
    show: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 100, damping: 20 },
    },
  };

  const normalizedMediaItems: AnimatedMarqueeHeroMediaItem[] =
    mediaItems && mediaItems.length > 0
      ? mediaItems
      : images.map((src, index) => ({
          type: 'image',
          src,
          alt: `Showcase image ${index + 1}`,
        }));
  const duplicatedMediaItems = [...normalizedMediaItems, ...normalizedMediaItems];

  // Determine if text content is present
  const hasTextContent = !!(tagline || title || description || ctaText);

  return (
    <section
      className={cn(
        'relative flex w-full flex-col items-center justify-start overflow-hidden bg-bg px-4 text-center',
        hasTextContent ? 'pb-[280px] sm:pb-[320px] pt-14 sm:pt-16 md:pt-20' : 'pb-0 pt-0',
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,hsl(var(--color-accent-amber)/0.14),transparent_28%),linear-gradient(180deg,hsl(var(--color-bg-soft)/0.52),transparent_30%,hsl(var(--color-bg)))]" />

      {tagline || title || description || ctaText ? (
        <div className="z-10 flex flex-col items-center">
          {tagline && (
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeInAnimationVariants}
              className="mb-4 inline-block rounded-full border border-border bg-[hsl(var(--color-surface-glass)/0.5)] px-4 py-1.5 text-sm font-medium text-[hsl(var(--color-text-secondary))] backdrop-blur-sm"
            >
              {tagline}
            </motion.div>
          )}

          {title && (
            <motion.h1
              initial="hidden"
              animate="show"
              variants={{
                hidden: {},
                show: {
                  transition: {
                    staggerChildren: 0.1,
                  },
                },
              }}
              className="max-w-5xl text-balance text-5xl font-black tracking-[-0.045em] text-[hsl(var(--color-text))] md:text-7xl"
              style={{
                textShadow: '0 10px 34px hsl(var(--color-accent-amber) / 0.12)',
              }}
            >
              {typeof title === 'string'
                ? title.split(' ').map((word, index) => (
                    <motion.span key={index} variants={fadeInAnimationVariants} className="inline-block">
                      {word}&nbsp;
                    </motion.span>
                  ))
                : title}
            </motion.h1>
          )}

          {description && (
            <motion.p
              initial="hidden"
              animate="show"
              variants={fadeInAnimationVariants}
              transition={{ delay: 0.5 }}
              className="mt-6 max-w-xl text-lg text-[hsl(var(--color-text-secondary))] dark:text-[hsl(var(--color-text-secondary))]"
            >
              {description}
            </motion.p>
          )}

          {ctaText && (
            <motion.div
              initial="hidden"
              animate="show"
              variants={fadeInAnimationVariants}
              transition={{ delay: 0.6 }}
            >
              <ActionButton onClick={onCtaClick} href={ctaHref}>
                {ctaText}
              </ActionButton>
            </motion.div>
          )}
        </div>
      ) : null}

      <div className={cn(
        'w-full [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]',
        hasTextContent
          ? 'absolute bottom-0 left-0 h-1/3 md:h-2/5'
          : 'relative h-64 sm:h-80 mt-8'
      )}>
        <motion.div
          className="flex gap-4"
          animate={{
            x: ['-100%', '0%'],
            transition: {
              ease: 'linear',
              duration: 40,
              repeat: Infinity,
            },
          }}
        >
          {duplicatedMediaItems.map((item, index) => (
            <div
              key={`${item.src}-${index}`}
              className="relative h-48 flex-shrink-0 aspect-[3/4] md:h-64"
              style={{
                rotate: `${index % 2 === 0 ? -2 : 5}deg`,
              }}
            >
              {item.type === 'video' ? (
                <LandingVideo
                  src={item.src}
                  poster={item.poster}
                  className="h-full w-full rounded-2xl object-cover shadow-md"
                />
              ) : (
                <img
                  src={item.src}
                  alt={item.alt}
                  className="h-full w-full rounded-2xl object-cover shadow-md"
                />
              )}
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};
