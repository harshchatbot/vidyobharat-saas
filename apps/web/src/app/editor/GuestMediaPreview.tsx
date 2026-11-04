'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiUrl } from '@/lib/env';
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

function ImagePreview({ mediaId, filename, objectFit }: { mediaId: string; filename: string; objectFit: string }) {
  const { url, error, retry } = useGuestMediaUrl(mediaId);
  if (error) return <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"><p className="text-sm font-semibold text-red-300">Preview unavailable</p><p className="text-xs text-slate-200">{error}</p><button type="button" onClick={retry} className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white">Retry preview</button></div>;
  if (!url) return <p className="text-sm text-white/60">Loading preview...</p>;
  return <img src={url} alt={filename} className={`h-full w-full bg-black ${objectFit}`} />;
}

function VideoPreview({ mediaId, isPlaying, localTime, muted, volume, objectFit }: Omit<Props, 'contentType' | 'filename' | 'cropMode'> & { objectFit: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const url = `${getApiUrl().replace(/\/$/, '')}/api/editor/media/${encodeURIComponent(mediaId)}/content`;

  useEffect(() => {
    setFailed(false);
  }, [mediaId, attempt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;
    const sync = () => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(video.currentTime - localTime) > 0.3) {
        try { video.currentTime = Math.max(0, Math.min(localTime, Number.isFinite(video.duration) ? video.duration : localTime)); } catch { /* wait for metadata */ }
      }
    };
    sync();
    video.muted = muted;
    video.volume = volume;
    if (isPlaying) void video.play().catch(() => undefined);
    else video.pause();
    video.addEventListener('loadedmetadata', sync);
    return () => video.removeEventListener('loadedmetadata', sync);
  }, [failed, isPlaying, localTime, muted, volume, attempt]);

  if (failed) return <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"><p className="text-sm font-semibold text-red-300">Video preview could not load</p><button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }} className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white">Retry preview</button></div>;
  return <video key={`${mediaId}:${attempt}`} ref={videoRef} src={url} onError={() => setFailed(true)} playsInline preload="metadata" className={`h-full w-full bg-black ${objectFit}`} />;
}

export function GuestMediaPreview(props: Props) {
  const objectFit = props.cropMode === 'cover' ? 'object-cover' : 'object-contain';
  if (props.contentType.startsWith('video/')) return <VideoPreview mediaId={props.mediaId} isPlaying={props.isPlaying} localTime={props.localTime} muted={props.muted} volume={props.volume} objectFit={objectFit} />;
  if (props.contentType.startsWith('image/')) return <ImagePreview mediaId={props.mediaId} filename={props.filename} objectFit={objectFit} />;
  return <p className="text-sm text-white/60">Preview not supported</p>;
}
