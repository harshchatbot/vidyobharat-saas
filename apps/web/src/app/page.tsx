import { EditorMockup } from '@/components/landing/EditorMockup';
import { FeatureBento } from '@/components/landing/FeatureBento';
import { HeroSection } from '@/components/landing/HeroSection';
import { LandingFooter } from '@/components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <div className="space-y-8 py-6 sm:space-y-10 sm:py-10">
      <HeroSection />
      <EditorMockup />
      <FeatureBento />
      <LandingFooter />
    </div>
  );
}
