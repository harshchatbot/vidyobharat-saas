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
    <section className={cn('relative w-full max-w-[1180px] mx-auto py-16 px-4', className)}>
      {testimonials.slice(0, imagePositions.length).map((testimonial, index) => (
        <motion.div
          key={index}
          className={cn('absolute rounded-xl shadow-xl overflow-hidden', imagePositions[index].className)}
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
            className="w-full h-full object-cover"
            animate={floatingAnimation()}
          />
        </motion.div>
      ))}

      <div className="relative z-10 flex flex-col items-center text-center py-20">
        {badgeText && (
          <div className="mb-4 inline-block rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-widest"
            style={{
              background: 'hsl(var(--color-primary) / 0.12)',
              color: 'hsl(var(--color-primary))',
              border: '1px solid hsl(var(--color-primary) / 0.3)',
            }}>
            {badgeText}
          </div>
        )}
        <h2 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 max-w-2xl"
          style={{
            background: 'linear-gradient(135deg, hsl(var(--color-primary)) 0%, hsl(var(--color-accent-pink)) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
          {title}
        </h2>
        <p className="max-w-md text-base mb-8" style={{ color: 'hsl(var(--color-text-secondary))' }}>
          {description}
        </p>
        <a href={ctaHref}
          className="glow-button inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold">
          {ctaText}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </section>
  );
};
