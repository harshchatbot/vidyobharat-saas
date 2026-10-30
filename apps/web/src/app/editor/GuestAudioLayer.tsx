'use client';

import { useEffect, useRef } from 'react';
import type { AudioTimelineItem } from './timeline/types';
import { useGuestMediaUrl } from './useGuestMediaUrl';
import { isCatalogMediaId, catalogPlaybackUrl, type AudioLibraryEntry } from './audioLibrary';

export function GuestAudioLayer({ item, playbackTime, isPlaying, catalogEntry }: { item: AudioTimelineItem; playbackTime: number; isPlaying: boolean; catalogEntry?: AudioLibraryEntry }) {
  const { url: uploadedUrl } = useGuestMediaUrl(isCatalogMediaId(item.mediaId) ? undefined : item.mediaId);
  const url = catalogEntry ? catalogPlaybackUrl(catalogEntry) : uploadedUrl;
  const ref = useRef<HTMLAudioElement>(null);
  const active = playbackTime >= item.startTime && playbackTime < item.startTime + item.duration;
  useEffect(() => {
    const audio = ref.current;
    if (!audio || !url) return;
    const expected = item.sourceStart + Math.max(0, playbackTime - item.startTime);
    if (Math.abs(audio.currentTime - expected) > 0.25) audio.currentTime = expected;
    audio.muted = item.muted;
    audio.volume = item.volume;
    if (isPlaying && active) void audio.play().catch(() => undefined);
    else audio.pause();
  }, [active, isPlaying, item.muted, item.sourceStart, item.startTime, item.volume, playbackTime, url]);
  return url ? <audio ref={ref} src={url} preload="auto" /> : null;
}
