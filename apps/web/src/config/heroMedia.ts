export type HeroMediaItem = {
  type: 'image' | 'video';
  src: string;
  poster?: string;
  alt: string;
};

export const heroMedia: HeroMediaItem[] = [
  {
    type: 'video',
    src: '/hero/ugc_avtaar_product_ad.mp4',
    poster: '/hero/ugc_avtaar_product_ad.mp4',
    alt: 'AI avatar product ad generated inside RangManch',
  },
  {
    type: 'video',
    src: '/hero/ugc_ad_preview.mp4',
    poster: '/hero/ugc_ad_preview.mp4',
    alt: 'Short UGC ad preview from RangManch',
  },
  {
    type: 'video',
    src: '/hero/hindi-festival-9x16.mp4',
    poster: '/hero/hindi-festival-9x16.mp4',
    alt: 'Vertical Hindi creator video made in RangManch',
  },
  {
    type: 'image',
    src: '/hero/an-ultra-realistic-cinematic-8k-portrait-of-battle-worn-sun-wukong-with-glowing-amber-eyes-intricate-facial-hair-scarred-fur-ornate-weathered-armor-with-gold-and-jade-holding-a-glowing-ruyi-jingu-bang-atop-a-foggy-mountain-at-dawn-illuminat.png',
    alt: 'Anime-style character reference for guided lofi reels',
  },
  {
    type: 'image',
    src: '/hero/creator-launch.png',
    alt: 'Creator launch visual generated in RangManch',
  },
  {
    type: 'video',
    src: '/hero/creator111.mp4',
    poster: '/hero/creator111.mp4',
    alt: 'AI-generated creator ad sample',
  },
  {
    type: 'video',
    src: '/hero/lip-sync.mp4',
    alt: 'Avatar lip-sync sample from RangManch',
  },
];
