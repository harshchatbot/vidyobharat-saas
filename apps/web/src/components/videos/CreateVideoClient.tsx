'use client';

import { CreateVideoPage } from '@/components/videos/create/CreateVideoPage';

export function CreateVideoClient({
  userId,
  templateKey,
  initialScript,
  initialTitle,
}: {
  userId: string;
  templateKey?: string;
  initialScript?: string;
  initialTitle?: string;
}) {
  return (
    <CreateVideoPage
      userId={userId}
      templateKey={templateKey}
      initialScript={initialScript}
      initialTitle={initialTitle}
    />
  );
}
