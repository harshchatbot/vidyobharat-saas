'use client';

import { AudioLines, Image as ImageIcon, Video } from 'lucide-react';
import { useGuestMediaUrl } from './useGuestMediaUrl';

type Props = {
  mediaId: string;
  contentType: string;
  alt: string;
  className?: string;
};

export function GuestMediaThumbnail({ mediaId, contentType, alt, className = '' }: Props) {
  const { url } = useGuestMediaUrl(mediaId);
  const fallback = `grid place-items-center bg-white/5 text-slate-500 ${className}`;
  if (!url) {
    if (contentType.startsWith('audio/')) return <span className={fallback}><AudioLines className="h-4 w-4" /></span>;
    if (contentType.startsWith('video/')) return <span className={fallback}><Video className="h-4 w-4" /></span>;
    return <span className={fallback}><ImageIcon className="h-4 w-4" /></span>;
  }
  if (contentType.startsWith('video/')) return <video src={url} muted playsInline preload="metadata" aria-label={alt} className={`bg-black object-cover ${className}`} />;
  if (contentType.startsWith('image/')) return <img src={url} alt={alt} className={`bg-black object-cover ${className}`} />;
  return <span className={fallback}><AudioLines className="h-4 w-4" /></span>;
}
