import { InfoPage } from '@/components/marketing/InfoPage';

export default function PlatformPage() {
  return (
    <InfoPage
      title="Platform"
      subtitle="A unified AI video platform with templates, multilingual voices, captions, and fast rendering pipelines."
      bullets={[
        'Template + AI b-roll hybrid workflow for reliability and scale.',
        'Indian language-first voice and narration experience.',
        'Project-based collaboration and reusable creative settings.',
        'Async render jobs with progress tracking and final delivery URLs.',
      ]}
    />
  );
}
