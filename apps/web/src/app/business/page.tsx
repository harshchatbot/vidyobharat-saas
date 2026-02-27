import { InfoPage } from '@/components/marketing/InfoPage';

export default function BusinessPage() {
  return (
    <InfoPage
      title="Business"
      subtitle="Ship more video campaigns, product explainers, and regional communication content without increasing production overhead."
      bullets={[
        'Standardized output quality for teams and agencies.',
        'Faster content turnarounds with reusable templates.',
        'Localized storytelling for Indian markets and audiences.',
        'Conversion-focused short and long-format exports.',
      ]}
    />
  );
}
