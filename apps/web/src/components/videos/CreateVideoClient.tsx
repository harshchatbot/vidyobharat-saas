'use client';

import { CreateVideoPage } from '@/components/videos/create/CreateVideoPage';
import type { VideoLaneKey } from '@/components/videos/create/videoLanes';

export function CreateVideoClient({
  userId,
  templateKey,
  initialScript,
  initialTitle,
  initialProjectId,
  initialLane,
  initialModelKey,
  initialAspectRatio,
  initialResolution,
  initialDurationSeconds,
  initialCaptionsEnabled,
  initialNarrationEnabled,
  embedded = false,
}: {
  userId: string;
  templateKey?: string;
  initialScript?: string;
  initialTitle?: string;
  initialProjectId?: string;
  initialLane?: VideoLaneKey;
  initialModelKey?: string;
  initialAspectRatio?: '9:16' | '16:9' | '1:1';
  initialResolution?: '720p' | '1080p';
  initialDurationSeconds?: string;
  initialCaptionsEnabled?: boolean;
  initialNarrationEnabled?: boolean;
  embedded?: boolean;
}) {
  return (
    <CreateVideoPage
      userId={userId}
      templateKey={templateKey}
      initialScript={initialScript}
      initialTitle={initialTitle}
      initialProjectId={initialProjectId}
      initialLane={initialLane}
      initialModelKey={initialModelKey}
      initialAspectRatio={initialAspectRatio}
      initialResolution={initialResolution}
      initialDurationSeconds={initialDurationSeconds}
      initialCaptionsEnabled={initialCaptionsEnabled}
      initialNarrationEnabled={initialNarrationEnabled}
      embedded={embedded}
    />
  );
}
