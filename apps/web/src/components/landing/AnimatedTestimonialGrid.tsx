'use client'
import * as React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Testimonial {
  imgSrc: string;
  alt: string;
}

interface AnimatedTestimonialGridProps {
  testimonials: Testimonial[];
  badgeText?: string;
  title: React.ReactNode;
  description: React.ReactNode;
  ctaText: string;
  ctaHref: string;
  className?: string;
}

const imagePositions = [
  { top: '5%', left: '15%', className: 'hidden lg:block w-24 h-24' },
  { top: '15%', left: '35%', className: 'hidden md:block w-20 h-20' },
  { top: '5%', left: '55%', className: 'hidden md:block w-16 h-16' },
  { top: '10%', right: '15%', className: 'hidden lg:block w-28 h-28' },
  { top: '25%', right: '5%', className: 'hidden md:block w-20 h-20' },
  { top: '45%', right: '10%', className: 'hidden lg:block w-24 h-24' },
  { top: '50%', left: '5%', className: 'hidden md:block w-28 h-28' },
  { bottom: '5%', left: '20%', className: 'hidden lg:block w-20 h-20' },
  { bottom: '15%', left: '45%', className: 'hidden md:block w-16 h-16' },
  { bottom: '10%', right: '30%', className: 'hidden md:block w-24 h-24' },
  { bottom: '2%', right: '15%', className: 'hidden lg:block w-20 h-20' },
  { top: '10%', left: '5%', className: 'block md:hidden w-16 h-16' },
  { top: '5%', right: '10%', className: 'block md:hidden w-20 h-20' },
  { bottom: '5%', left: '10%', className: 'block md:hidden w-20 h-20' },
  { bottom: '10%', right: '5%', className: 'block md:hidden w-16 h-16' },
];

const floatingAnimation = () => ({
  y: [0, Math.random() * -15 - 5, 0],
  transition: {
    duration: Math.random() * 4 + 5,
    repeat: Infinity,
    repeatType: 'reverse' as const,
    ease: 'easeInOut',
  },
});

export const AnimatedTestimonialGrid = ({
  testimonials,
  badgeText = 'Testimonials',
  title,
  description,
  ctaText,
  ctaHref,
  className,
}: AnimatedTestimonialGridProps) => {
  return (
    <section className={cn('relative mx-auto w-full max-w-[1180px] px-4 py-12 sm:py-16', className)}>
      <div
        className="relative isolate overflow-hidden rounded-[30px] border px-5 py-7 shadow-[0_30px_120px_hsl(var(--color-text)/0.12)] backdrop-blur-2xl sm:rounded-[42px] sm:px-8 sm:py-10 lg:grid lg:min-h-[470px] lg:grid-cols-[0.86fr_1.14fr] lg:items-center lg:gap-10"
        style={{
          borderColor: 'var(--landing-glass-border, hsl(var(--color-border) / 0.48))',
          background: 'var(--landing-glass-panel-bg, linear-gradient(135deg, hsl(var(--color-surface) / 0.72), hsl(var(--color-elevated) / 0.58)))',
        }}
      >
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-[hsl(var(--color-accent-amber)/0.5)] to-transparent" />
        <div className="relative z-10 max-w-xl text-left">
        {badgeText && (
          <div className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
            style={{
              background: 'hsl(var(--color-accent-amber) / 0.12)',
              color: 'hsl(var(--color-accent-amber))',
              border: '1px solid hsl(var(--color-accent-amber) / 0.3)',
            }}>
            {badgeText}
          </div>
        )}
        <h2 className="mb-4 max-w-2xl text-[2rem] font-extrabold leading-[1.05] tracking-tight sm:text-4xl md:text-5xl"
          style={{
            color: 'var(--landing-title, hsl(var(--color-text)))',
            textShadow: '0 16px 44px hsl(var(--color-accent-amber) / 0.12)',
          }}>
          {title}
        </h2>
        <p className="mb-8 max-w-md text-sm leading-7 sm:text-base" style={{ color: 'var(--landing-muted, hsl(var(--color-text-secondary)))' }}>
          {description}
        </p>
        <a href={ctaHref}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition hover:opacity-95"
          style={{
            background: 'hsl(var(--color-accent-amber))',
            color: '#0A0A0F',
            boxShadow: '0 18px 60px hsl(var(--color-accent-amber) / 0.24)',
          }}>
          {ctaText}
          <ArrowRight className="h-4 w-4" />
        </a>
        </div>
        <div className="relative mt-9 min-h-[250px] overflow-hidden rounded-[26px] sm:min-h-[270px] sm:rounded-[34px] lg:mt-0 lg:min-h-[390px]">
          <div className="absolute inset-0 rounded-[34px] border" style={{ borderColor: 'hsl(var(--color-border) / 0.26)', background: 'linear-gradient(135deg, hsl(var(--color-bg) / 0.24), hsl(var(--color-surface) / 0.22))' }} />
          <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl" style={{ background: 'hsl(var(--color-accent-amber) / 0.16)' }} />
        {testimonials.slice(0, imagePositions.length).map((testimonial, index) => (
          <motion.div
            key={index}
            className={cn('absolute overflow-hidden rounded-xl shadow-xl', imagePositions[index].className)}
            style={{
              top: imagePositions[index].top,
              left: imagePositions[index].left,
              right: imagePositions[index].right,
              bottom: imagePositions[index].bottom,
              border: '1px solid hsl(var(--glass-border))',
              backdropFilter: 'blur(var(--glass-blur))',
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 20, delay: index * 0.05 }}
            whileHover={{ scale: 1.08, zIndex: 20 }}
          >
            <motion.img
              src={testimonial.imgSrc}
              alt={testimonial.alt}
              className="h-full w-full object-cover"
              animate={floatingAnimation()}
            />
          </motion.div>
        ))}
        </div>
      </div>
    </section>
  );
};
