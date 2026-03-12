'use client';

import { CreateVideoPage } from '@/components/videos/create/CreateVideoPage';

export function CreateVideoClient({
  userId,
  templateKey,
  initialScript,
  initialTitle,
  initialProjectId,
}: {
  userId: string;
  templateKey?: string;
  initialScript?: string;
  initialTitle?: string;
  initialProjectId?: string;
}) {
  return (
    <CreateVideoPage
      userId={userId}
      templateKey={templateKey}
      initialScript={initialScript}
      initialTitle={initialTitle}
      initialProjectId={initialProjectId}
    />
  );
}
