'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/env';

export function useGuestMediaUrl(mediaId?: string) {
  const [state, setState] = useState<{ url: string | null; error: boolean }>({ url: null, error: false });
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setState({ url: null, error: false });
    if (!mediaId) return () => { active = false; };
    void fetch(`${getApiUrl()}/api/editor/media/${encodeURIComponent(mediaId)}/content`, { credentials: 'include', cache: 'no-store' })
      .then((response) => { if (!response.ok) throw new Error(`Media request failed (${response.status})`); return response.blob(); })
      .then((blob) => { if (!active) return; objectUrl = URL.createObjectURL(blob); setState({ url: objectUrl, error: false }); })
      .catch(() => { if (active) setState({ url: null, error: true }); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [mediaId]);
  return state;
}
