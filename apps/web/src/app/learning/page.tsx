import { InfoPage } from '@/components/marketing/InfoPage';

export default function LearningPage() {
  return (
    <InfoPage
      title="Learning"
      subtitle="Guides and practical workflows to help your team consistently produce high-performing AI-assisted videos."
      bullets={[
        'Script writing templates for different campaign goals.',
        'Voice, pacing, and caption best practices.',
        'Creative testing ideas for hooks and CTAs.',
        'Operational playbooks for teams and agencies.',
      ]}
    />
  );
}
