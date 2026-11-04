'use client';

import { useEffect, useRef } from 'react';
import { useGuestMediaUrl } from './useGuestMediaUrl';

type Props = {
  mediaId: string;
  contentType: string;
  filename: string;
  isPlaying: boolean;
  localTime: number;
  muted: boolean;
  volume: number;
  cropMode: 'cover' | 'contain';
};

export function GuestMediaPreview({ mediaId, contentType, filename, isPlaying, localTime, muted, volume, cropMode }: Props) {
  const { url, error, retry } = useGuestMediaUrl(mediaId);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !url) return;
    if (Math.abs(video.currentTime - localTime) > 0.3) video.currentTime = Math.max(0, localTime);
    video.muted = muted;
    video.volume = volume;
    if (isPlaying) void video.play().catch(() => undefined);
    else video.pause();
  }, [isPlaying, localTime, muted, url, volume]);

  if (error) return <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"><p className="text-sm font-semibold text-red-300">Preview unavailable</p><p className="max-w-sm break-words text-xs text-slate-200">{error}</p><button type="button" onClick={retry} className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white hover:bg-white/20">Retry preview</button><p className="text-xs text-slate-400">If the media has expired or was deleted, upload it again.</p></div>;
  if (!url) return <p className="text-sm text-white/60">Loading preview...</p>;
  const objectFit = cropMode === 'cover' ? 'object-cover' : 'object-contain';
  if (contentType.startsWith('video/')) return <video ref={videoRef} src={url} playsInline preload="auto" className={`h-full w-full bg-black ${objectFit}`} />;
  if (contentType.startsWith('image/')) return <img src={url} alt={filename} className={`h-full w-full bg-black ${objectFit}`} />;
  return <p className="text-sm text-white/60">Preview not supported</p>;
}
