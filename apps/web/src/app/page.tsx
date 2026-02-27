import { redirect } from 'next/navigation';

import { ComplianceStrip } from '@/components/landing/ComplianceStrip';
import { FeatureBento } from '@/components/landing/FeatureBento';
import { HeroSection } from '@/components/landing/HeroSection';
import { IndiaTrustBadge } from '@/components/landing/IndiaTrustBadge';
import { InteractiveFeatureShowcase } from '@/components/landing/InteractiveFeatureShowcase';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { TrustStrip } from '@/components/landing/TrustStrip';
import { TranslatorSection } from '@/components/landing/TranslatorSection';
import { getUserIdFromCookie } from '@/lib/session';

export default async function LandingPage() {
  const userId = await getUserIdFromCookie();
  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="py-6 sm:py-10">
      <HeroSection />
      <TrustStrip />
      <InteractiveFeatureShowcase />
      <TranslatorSection />
      <FeatureBento />
      <ComplianceStrip />
      <div className="pb-10 pt-2">
        <IndiaTrustBadge />
      </div>
      <LandingFooter />
    </div>
  );
}
