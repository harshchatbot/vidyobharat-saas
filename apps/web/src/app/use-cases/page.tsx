import { InfoPage } from '@/components/marketing/InfoPage';

export default function UseCasesPage() {
  return (
    <InfoPage
      title="Use Cases"
      subtitle="Create ad creatives, education explainers, startup launch videos, and agency client deliverables from one script-to-video flow."
      bullets={[
        'Paid ads and social-first growth content.',
        'Edtech lessons and training videos in local languages.',
        'Product launches and SaaS feature announcement clips.',
        'Agency multi-client video production operations.',
      ]}
    />
  );
}
