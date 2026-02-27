import { EditorMockup } from '@/components/landing/EditorMockup';
import { FaqSection } from '@/components/landing/FaqSection';
import { FinalCta } from '@/components/landing/FinalCta';
import { FeatureBento } from '@/components/landing/FeatureBento';
import { GeneratedShowcase } from '@/components/landing/GeneratedShowcase';
import { HeroSection } from '@/components/landing/HeroSection';
import { LandingFooter } from '@/components/landing/LandingFooter';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import { TrustStrip } from '@/components/landing/TrustStrip';
import { UseCasesSection } from '@/components/landing/UseCasesSection';
import { WorkflowSection } from '@/components/landing/WorkflowSection';

export default function LandingPage() {
  return (
    <div className="space-y-8 py-6 sm:space-y-10 sm:py-10">
      <HeroSection />
      <TrustStrip />
      <EditorMockup />
      <WorkflowSection />
      <GeneratedShowcase />
      <FeatureBento />
      <UseCasesSection />
      <TestimonialsSection />
      <FaqSection />
      <FinalCta />
      <LandingFooter />
    </div>
  );
}
