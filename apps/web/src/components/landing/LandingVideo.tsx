'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';

type Props = {
  src: string;
  className?: string;
  poster?: string;
};

export function LandingVideo({ src, className, poster }: Props) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [needsTap, setNeedsTap] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const tryPlay = async () => {
      try {
        await node.play();
        setNeedsTap(false);
      } catch {
        setNeedsTap(true);
      }
    };
    void tryPlay();
  }, [src]);

  return (
    <div className="relative">
      <video
        ref={ref}
        className={className}
        src={src}
        poster={poster}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
        controls={needsTap}
      />
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
          className="absolute inset-0 inline-flex items-center justify-center rounded-[inherit] bg-[hsl(var(--color-bg)/0.36)] backdrop-blur-[2px]"
          aria-label="Play video preview"
        >
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-text))]">
            <Play className="h-5 w-5" />
          </span>
        </button>
      ) : null}
    </div>
  );
}

