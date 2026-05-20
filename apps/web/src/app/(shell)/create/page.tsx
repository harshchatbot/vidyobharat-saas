import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { UnifiedCreateStudioClient } from '@/components/create/UnifiedCreateStudioClient';
import { OnboardingChecklist } from '@/components/ui/OnboardingChecklist';
import { PlanExpiryBanner } from '@/components/ui/PlanExpiryBanner';
import { VoicePreviewTrigger } from './VoicePreviewTrigger';
import { getUserIdFromCookie } from '@/lib/session';

export default async function CreatePage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return (
    <div>
      <Suspense fallback={null}>
        <OnboardingChecklist />
      </Suspense>
      <Suspense fallback={null}>
        <PlanExpiryBanner />
      </Suspense>
      <Suspense fallback={null}>
        <VoicePreviewTrigger />
      </Suspense>
      <UnifiedCreateStudioClient
        userId={userId}
        initialDefaultAspectRatio={null}
      />
    </div>
  );
}
