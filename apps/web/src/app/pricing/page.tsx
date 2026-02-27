import { InfoPage } from '@/components/marketing/InfoPage';

export default function PricingPage() {
  return (
    <InfoPage
      title="Pricing"
      subtitle="Simple plans designed for creators, growth teams, and agencies. Upgrade as your video volume scales."
      bullets={[
        'Starter: core generation workflow for individual creators.',
        'Pro: advanced templates and higher monthly render volume.',
        'Business: team operations, higher limits, and priority support.',
        'Enterprise: custom security, support, and deployment workflows.',
      ]}
    />
  );
}
