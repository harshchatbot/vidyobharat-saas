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
  const { url, error } = useGuestMediaUrl(mediaId);
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

  if (error) return <p className="text-sm text-red-300">Preview unavailable</p>;
  if (!url) return <p className="text-sm text-white/60">Loading preview...</p>;
  const objectFit = cropMode === 'cover' ? 'object-cover' : 'object-contain';
  if (contentType.startsWith('video/')) return <video ref={videoRef} src={url} playsInline preload="auto" className={`h-full w-full bg-black ${objectFit}`} />;
  if (contentType.startsWith('image/')) return <img src={url} alt={filename} className={`h-full w-full bg-black ${objectFit}`} />;
  return <p className="text-sm text-white/60">Preview not supported</p>;
}
