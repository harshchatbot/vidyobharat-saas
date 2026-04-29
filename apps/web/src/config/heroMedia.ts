export type HeroMediaItem = {
    type: 'image' | 'video';
    src: string;
    poster?: string;
    alt: string;
  };
  
  export const heroMedia: HeroMediaItem[] = [
    {
      type: 'video' as const,
      src: '/hero/ugc_avtaar_product_ad.mp4',
      poster: '/hero/ugc_avtaar_product_ad.mp4',
      alt: 'RangManch AI avatar product ad sample',
    },
    {
      type: 'video' as const,
      src: '/hero/advertisement.mp4',
      alt: 'RangManch product ads video',
    },
    {
      type: 'video' as const,
      src: '/hero/ugc_ad_preview.mp4',
      poster: '/hero/cr-launch.png',
      alt: 'RangManch UGC ad preview sample',
    },
    {
      type: 'video' as const,
      src: '/hero/opening-shot-techfi-labs-logo-animation-narrator-welcome-to-techfi-labs-y.mp4',
      alt: 'RangManch TechFi Labs video sample ',
    },
    {
      type: 'video' as const,
      src: '/hero/hindi-festival-9x16.mp4',
      poster: '/hero/hindi-festival-9x16.mp4',
      alt: 'RangManch Hindi vertical video sample',
    },
    {
      type: 'image' as const,
      src: '/hero/creator-launch.png',
      alt: 'RangManch influencer ai image',
    },
    {
      type: 'video' as const,
      src: '/hero/creator111.mp4',
      poster: '/hero/creator111.mp4',
      alt: 'RangManch ai ad education video sample',
    },
    {
      type: 'video' as const,
      src: '/hero/lip-sync.mp4',
      alt: 'RangManch influencer persona preview',
    },
    {
        type: 'video' as const,
        src: '/hero/opening-shot-vibrant-local-market-sellers-showcasing-their-products-with-enth (1).mp4',
        alt: 'RangManch influencer persona preview',
      },
  ];