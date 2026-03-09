import { redirect } from 'next/navigation';

import { PublicStudioLanding } from '@/components/landing/PublicStudioLanding';
import { API_URL } from '@/lib/env';
import { getUserIdFromCookie } from '@/lib/session';

type LandingInspirationVideo = {
  id: string;
  creator_name: string;
  model_key: string;
  provider_name: string;
  title: string;
  prompt: string;
  video_url: string;
  thumbnail_url: string;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  created_at: string;
  tags: string[];
  like_count: number;
};

type LandingInspirationImage = {
  id: string;
  creator_name: string;
  model_key: string;
  title: string;
  prompt: string;
  image_url: string;
  aspect_ratio: string;
  resolution: string;
  created_at: string;
  reference_urls: string[];
  tags: string[];
  like_count: number;
};

async function fetchPublicInspiration() {
  const [videoRes, imageRes] = await Promise.all([
    fetch(`${API_URL}/public/videos/inspiration`, { cache: 'no-store' }).catch(() => null),
    fetch(`${API_URL}/public/images/inspiration`, { cache: 'no-store' }).catch(() => null),
  ]);

  let videos: LandingInspirationVideo[] = [];
  let images: LandingInspirationImage[] = [];

  if (videoRes?.ok) {
    try {
      videos = (await videoRes.json()) as LandingInspirationVideo[];
    } catch {
      videos = [];
    }
  }
  if (imageRes?.ok) {
    try {
      images = (await imageRes.json()) as LandingInspirationImage[];
    } catch {
      images = [];
    }
  }

  return { videos, images };
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const forcePublicLanding = resolvedSearchParams?.public === '1';
  const userId = await getUserIdFromCookie();
  if (userId && !forcePublicLanding) {
    redirect('/dashboard');
  }
  const { videos, images } = await fetchPublicInspiration();

  return (
    <PublicStudioLanding videos={videos} images={images} />
  );
}
