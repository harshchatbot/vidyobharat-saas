import { InfoPage } from '@/components/marketing/InfoPage';

export default function CompanyPage() {
  return (
    <InfoPage
      title="Company"
      subtitle="VidyoBharat is building India-first AI video infrastructure that blends reliability, speed, and local language storytelling."
      bullets={[
        'Mission: help teams create better videos in less time.',
        'Approach: product-led development with practical workflows.',
        'Focus: multilingual accessibility and conversion outcomes.',
        'Roadmap: deeper auth, storage, and enterprise governance.',
      ]}
    />
  );
}
