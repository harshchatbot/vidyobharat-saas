import { redirect } from 'next/navigation';

import { ComplianceStrip } from '@/components/landing/ComplianceStrip';
import { CommunityShowcase } from '@/components/landing/CommunityShowcase';
import { FeatureBento } from '@/components/landing/FeatureBento';
import { FaqSection } from '@/components/landing/FaqSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { HeroSection } from '@/components/landing/HeroSection';
import { IndiaTrustBadge } from '@/components/landing/IndiaTrustBadge';
import { InteractiveFeatureShowcase } from '@/components/landing/InteractiveFeatureShowcase';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import { TrustStrip } from '@/components/landing/TrustStrip';
import { TranslatorSection } from '@/components/landing/TranslatorSection';
import { WorkflowSection } from '@/components/landing/WorkflowSection';
import { API_URL } from '@/lib/env';
import { getUserIdFromCookie } from '@/lib/session';

type LandingInspirationVideo = {
  id: string;
  creator_name: string;
  model_key: string;
  provider_name: string;
  title: string;
  prompt: string;
  video_url: string;
  thumbnail_url: string;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  created_at: string;
  tags: string[];
  like_count: number;
};

type LandingInspirationImage = {
  id: string;
  creator_name: string;
  model_key: string;
  title: string;
  prompt: string;
  image_url: string;
  aspect_ratio: string;
  resolution: string;
  created_at: string;
  reference_urls: string[];
  tags: string[];
  like_count: number;
};

async function fetchPublicInspiration() {
  const [videoRes, imageRes] = await Promise.all([
    fetch(`${API_URL}/public/videos/inspiration`, { cache: 'no-store' }).catch(() => null),
    fetch(`${API_URL}/public/images/inspiration`, { cache: 'no-store' }).catch(() => null),
  ]);

  let videos: LandingInspirationVideo[] = [];
  let images: LandingInspirationImage[] = [];

  if (videoRes?.ok) {
    try {
      videos = (await videoRes.json()) as LandingInspirationVideo[];
    } catch {
      videos = [];
    }
  }
  if (imageRes?.ok) {
    try {
      images = (await imageRes.json()) as LandingInspirationImage[];
    } catch {
      images = [];
    }
  }

  return { videos, images };
}

export default async function LandingPage() {
  const userId = await getUserIdFromCookie();
  if (userId) {
    redirect('/dashboard');
  }
  const { videos, images } = await fetchPublicInspiration();

  return (
    <div className="py-6 sm:py-10">
      <HeroSection />
      <CommunityShowcase videos={videos} images={images} />
      <TrustStrip />
      <InteractiveFeatureShowcase />
      <TranslatorSection />
      <WorkflowSection />
      <FeatureBento />
      <TestimonialsSection />
      <ComplianceStrip />
      <FaqSection />
      <FinalCta />
      <div className="pb-10 pt-2">
        <IndiaTrustBadge />
      </div>
      <LandingFooter />
    </div>
  );
}
