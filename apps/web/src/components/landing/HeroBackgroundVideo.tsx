'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

export function HeroBackgroundVideo({
  src,
  poster,
  className = '',
}: {
  src: string;
  poster?: string;
  className?: string;
}) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const start = async () => {
      try {
        await node.play();
        setNeedsTap(false);
      } catch {
        setNeedsTap(true);
      }
    };
    void start();
  }, [src]);

  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`.trim()}>
      <video
        ref={ref}
        src={src}
        poster={poster}
        muted
        autoPlay
        loop
        playsInline
        preload="metadata"
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.28),hsl(var(--color-bg)/0.72)_58%,hsl(var(--color-bg)/0.94))]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_24%_22%,hsl(var(--color-hero-glow)/0.22),transparent_24%),radial-gradient(circle_at_76%_28%,hsl(var(--color-accent)/0.12),transparent_22%)]" />
      {needsTap ? (
        <button
          type="button"
          onClick={async () => {
            if (!ref.current) return;
            try {
              await ref.current.play();
              setNeedsTap(false);
            } catch {
              setNeedsTap(true);
            }
          }}
          className="absolute inset-0 flex items-center justify-center bg-[hsl(var(--color-bg)/0.22)] backdrop-blur-[2px]"
          aria-label="Play landing background video"
        >
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface-glass-strong)/0.74)] text-[hsl(var(--color-text))]">
            <Play className="h-5 w-5" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

