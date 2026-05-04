import { PublicInspirationFeed } from '@/components/community/PublicInspirationFeed';
import { ImageStudioClient } from '@/components/images/ImageStudioClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function ImagesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    return (
      <PublicInspirationFeed
        scope="image"
        eyebrow="Public images"
        title="Browse public inspiration images from RangManch"
        description="See the styles, prompts, and quality creators are already publishing on the platform. No account is needed to explore."
        ctaHref="/signup"
        ctaLabel="Create your own images"
      />
    );
  }

  const params = await searchParams;
  return <ImageStudioClient userId={userId} initialProjectId={params.projectId} />;
}
