'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/env';

type CachedMedia = { promise: Promise<string>; url?: string };
const mediaUrlCache = new Map<string, CachedMedia>();

export function invalidateGuestMediaUrl(mediaId: string) {
  const cached = mediaUrlCache.get(mediaId);
  if (cached?.url) URL.revokeObjectURL(cached.url);
  mediaUrlCache.delete(mediaId);
}

function cachedGuestMediaUrl(mediaId: string): Promise<string> {
  const cached = mediaUrlCache.get(mediaId);
  if (cached?.url) return Promise.resolve(cached.url);
  if (cached) return cached.promise;
  const entry: CachedMedia = {
    promise: fetch(`${getApiUrl()}/api/editor/media/${encodeURIComponent(mediaId)}/content`, { credentials: 'include', cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error(`Media request failed (${response.status})`); return response.blob(); })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        entry.url = url;
        return url;
      })
      .catch((error) => {
        mediaUrlCache.delete(mediaId);
        throw error;
      }),
  };
  mediaUrlCache.set(mediaId, entry);
  return entry.promise;
}

export function useGuestMediaUrl(mediaId?: string) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({ url: null, error: false });
  useEffect(() => {
    let active = true;
    setState({ url: null, error: false });
    if (!mediaId) return () => { active = false; };
    void cachedGuestMediaUrl(mediaId)
      .then((url) => { if (active) setState({ url, error: false }); })
      .catch(() => { if (active) setState({ url: null, error: true }); });
    return () => { active = false; };
  }, [mediaId]);
  return state;
}
