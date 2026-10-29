'use client';

import { useState } from 'react';
import { AudioLines, CircleAlert, Image as ImageIcon, Video } from 'lucide-react';
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
  const fallback = `grid place-items-center bg-white/5 text-slate-500 ${className}`;
  if (availability === 'unavailable' || error || decodeFailed) {
    return <span className={`${fallback} gap-1 text-center text-[9px] leading-tight text-amber-300`} title="Media unavailable"><CircleAlert className="h-4 w-4" /><span>Unavailable</span></span>;
  }
  if (!url) {
    if (contentType.startsWith('audio/')) return <span className={fallback}><AudioLines className="h-4 w-4" /></span>;
    if (contentType.startsWith('video/')) return <span className={fallback}><Video className="h-4 w-4" /></span>;
    return <span className={fallback}><ImageIcon className="h-4 w-4" /></span>;
  }
  const markDecodeFailure = () => { invalidateGuestMediaUrl(mediaId); setDecodeFailed(true); };
  if (contentType.startsWith('video/')) return <video src={url} muted playsInline preload="metadata" onError={markDecodeFailure} aria-label={alt} className={`bg-black object-cover ${className}`} />;
  if (contentType.startsWith('image/')) return <img src={url} alt={alt} onError={markDecodeFailure} className={`bg-black object-cover ${className}`} />;
  return <span className={fallback}><AudioLines className="h-4 w-4" /></span>;
}
