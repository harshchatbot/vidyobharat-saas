'use client';

import { useEffect, useRef, useState } from 'react';
import { getApiUrl } from '@/lib/env';
import { LoaderCircle } from 'lucide-react';
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
  onMediaTime?: (time: number) => void;
  onBufferingChange?: (buffering: boolean) => void;
};

function ImagePreview({ mediaId, filename, objectFit }: { mediaId: string; filename: string; objectFit: string }) {
  const { url, error, retry } = useGuestMediaUrl(mediaId);
  if (error) return <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"><p className="text-sm font-semibold text-red-300">Preview unavailable</p><p className="text-xs text-slate-200">{error}</p><button type="button" onClick={retry} className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white">Retry preview</button></div>;
  if (!url) return <p className="text-sm text-white/60">Loading preview...</p>;
  return <img src={url} alt={filename} className={`h-full w-full bg-black ${objectFit}`} />;
}

function VideoPreview({ mediaId, isPlaying, localTime, muted, volume, objectFit, onMediaTime, onBufferingChange }: Omit<Props, 'contentType' | 'filename' | 'cropMode'> & { objectFit: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const desiredTimeRef = useRef(localTime);
  desiredTimeRef.current = localTime;
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [buffering, setBuffering] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const loadingTimeoutRef = useRef<number | null>(null);
  const url = `${getApiUrl().replace(/\/$/, '')}/api/editor/media/${encodeURIComponent(mediaId)}/content`;

  useEffect(() => {
    setFailed(false);
    setBuffering(true);
    setLoadingTimedOut(false);
    onBufferingChange?.(true);
    if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
    loadingTimeoutRef.current = window.setTimeout(() => { setLoadingTimedOut(true); loadingTimeoutRef.current = null; }, 30000);
    return () => {
      if (loadingTimeoutRef.current) window.clearTimeout(loadingTimeoutRef.current);
      loadingTimeoutRef.current = null;
      onBufferingChange?.(false);
    };
  }, [mediaId, attempt]);

  // Playback is driven by the media element's clock. Seeking on every React
  // timeline tick forces the decoder to discard frames and can freeze previews.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;
    video.muted = muted;
    video.volume = volume;
  }, [failed, muted, volume, attempt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed) return;
    if (isPlaying) {
      // Seek once at playback start, not on every timeline tick.
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA && Math.abs(video.currentTime - desiredTimeRef.current) > 0.15) {
        video.currentTime = desiredTimeRef.current;
      }
      if (video.paused) void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [failed, isPlaying, attempt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || failed || isPlaying) return;
    const sync = () => {
      if (video.readyState < HTMLMediaElement.HAVE_METADATA) return;
      const target = Math.max(0, Math.min(localTime, Number.isFinite(video.duration) ? video.duration : localTime));
      if (Math.abs(video.currentTime - target) > 0.05) {
        try { video.currentTime = target; } catch { /* metadata still loading */ }
      }
    };
    sync();
    video.addEventListener('loadedmetadata', sync);
    return () => video.removeEventListener('loadedmetadata', sync);
  }, [failed, isPlaying, localTime, attempt]);

  if (failed) return <div role="alert" className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center"><p className="text-sm font-semibold text-red-300">Video preview could not load</p><button type="button" onClick={() => { setFailed(false); setAttempt((n) => n + 1); }} className="rounded-md border border-white/30 bg-white/10 px-3 py-2 text-xs font-semibold text-white">Retry preview</button></div>;
  const showLoading = () => { setBuffering(true); onBufferingChange?.(true); };
  const showReady = () => {
    if (loadingTimeoutRef.current) { window.clearTimeout(loadingTimeoutRef.current); loadingTimeoutRef.current = null; }
    setBuffering(false); setLoadingTimedOut(false); onBufferingChange?.(false);
  };
  return <div className="relative h-full w-full bg-black">
    <video key={`${mediaId}:${attempt}`} ref={videoRef} src={url} onError={() => { setFailed(true); onBufferingChange?.(false); }} onTimeUpdate={(event) => onMediaTime?.(event.currentTarget.currentTime)} onLoadStart={showLoading} onSeeking={showLoading} onWaiting={showLoading} onStalled={showLoading} onPlaying={showReady} onCanPlay={showReady} onSeeked={showReady} playsInline preload="metadata" className={`h-full w-full bg-black ${objectFit}`} />
    {buffering && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/35" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-2 rounded-lg bg-black/65 px-4 py-3 text-white"><LoaderCircle className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden="true" /><span className="text-xs">{loadingTimedOut ? 'Preview is taking longer than expected' : 'Preparing preview…'}</span></div>
    </div>}
  </div>;
}

export function GuestMediaPreview(props: Props) {
  const objectFit = props.cropMode === 'cover' ? 'object-cover' : 'object-contain';
  if (props.contentType.startsWith('video/')) return <VideoPreview mediaId={props.mediaId} isPlaying={props.isPlaying} localTime={props.localTime} muted={props.muted} volume={props.volume} objectFit={objectFit} onMediaTime={props.onMediaTime} onBufferingChange={props.onBufferingChange} />;
  if (props.contentType.startsWith('image/')) return <ImagePreview mediaId={props.mediaId} filename={props.filename} objectFit={objectFit} />;
  return <p className="text-sm text-white/60">Preview not supported</p>;
}
