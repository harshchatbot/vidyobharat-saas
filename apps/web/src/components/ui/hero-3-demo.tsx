'use client';

import { useRouter } from 'next/navigation';

import { AnimatedMarqueeHero } from '@/components/ui/hero-3';

const demoImages = [
  'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1515169067868-5387ec356754?auto=format&fit=crop&w=900&q=80',
];

export default function AnimatedHeroDemo() {
  const router = useRouter();

  return (
    <AnimatedMarqueeHero
      tagline="Join over 100,00 happy creators"
      title={
        <>
          Engage Audiences
          <br />
          with Stunning Videos
        </>
      }
      description="Boost your brand with high-impact short videos, creator ads, and social-first launches built for fast campaigns."
      ctaText="Get Started"
      images={demoImages}
      onCtaClick={() => router.push('/signup')}
    />
  );
}
