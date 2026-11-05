'use client';

import { useState } from 'react';
import { AudioLines, CircleAlert, Image as ImageIcon, LoaderCircle, Video } from 'lucide-react';
import { invalidateGuestMediaUrl, useGuestMediaUrl } from './useGuestMediaUrl';

type Props = {
  mediaId: string;
  contentType: string;
  alt: string;
  className?: string;
  availability?: 'available' | 'unavailable' | 'unknown';
};

export function GuestMediaThumbnail({ mediaId, contentType, alt, className = '', availability = 'available' }: Props) {
  const { url, error } = useGuestMediaUrl(availability === 'unavailable' ? undefined : mediaId);
  const [decodeFailed, setDecodeFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const fallback = `grid place-items-center bg-white/5 text-slate-500 ${className}`;
  if (availability === 'unavailable' || error || decodeFailed) {
    return <span className={`${fallback} gap-1 text-center text-[9px] leading-tight text-amber-300`} title="Media unavailable"><CircleAlert className="h-4 w-4" /><span>Unavailable</span></span>;
  }
  if (!url) {
    if (contentType.startsWith('audio/')) return <span className={fallback}><AudioLines className="h-4 w-4" /></span>;
    if (contentType.startsWith('video/')) return <span className={fallback} role="status" aria-label="Loading video thumbnail"><LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" /></span>;
    return <span className={fallback}><ImageIcon className="h-4 w-4" /></span>;
  }
  const markDecodeFailure = () => { invalidateGuestMediaUrl(mediaId); setDecodeFailed(true); };
  if (contentType.startsWith('video/')) return <span className={`relative block overflow-hidden ${className}`}><video src={url} muted playsInline preload="metadata" onLoadedData={() => setReady(true)} onError={markDecodeFailure} aria-label={alt} className="h-full w-full bg-black object-cover" />{!ready && <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/50" role="status" aria-label="Loading video thumbnail"><LoaderCircle className="h-4 w-4 animate-spin text-white motion-reduce:animate-none" /></span>}</span>;
  if (contentType.startsWith('image/')) return <img src={url} alt={alt} onError={markDecodeFailure} className={`bg-black object-cover ${className}`} />;
  return <span className={fallback}><AudioLines className="h-4 w-4" /></span>;
}
