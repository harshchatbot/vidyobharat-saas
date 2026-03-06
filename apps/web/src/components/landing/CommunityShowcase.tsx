import Link from 'next/link';

type InspirationVideo = {
  id: string;
  creator_name: string;
  model_key: string;
  provider_name: string;
  title: string;
  prompt: string;
  video_url: string;
  thumbnail_url: string;
  aspect_ratio: string;
  resolution: string;
  duration_seconds: number;
  created_at: string;
  tags: string[];
  like_count: number;
};

type InspirationImage = {
  id: string;
  creator_name: string;
  model_key: string;
  title: string;
  prompt: string;
  image_url: string;
  aspect_ratio: string;
  resolution: string;
  created_at: string;
  tags: string[];
  like_count: number;
};

type Props = {
  videos: InspirationVideo[];
  images: InspirationImage[];
};

export function CommunityShowcase({ videos, images }: Props) {
  const hasAny = videos.length > 0 || images.length > 0;

  return (
    <section className="space-y-5 py-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-muted))]">Community</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">
            Real videos and visuals created on RangManch AI
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
            Browse approved public creations from creators already shipping content with the platform.
          </p>
        </div>
        <Link
          href="/signup"
          className="hidden rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-2 text-sm font-semibold text-[hsl(var(--color-text))] sm:inline-flex"
        >
          Start creating
        </Link>
      </div>

      {!hasAny ? (
        <div className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-5 py-8 text-sm text-[hsl(var(--color-muted))]">
          Community creations are loading. Check back in a moment.
        </div>
      ) : null}

      {videos.length > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {videos.slice(0, 6).map((video) => (
            <article
              key={video.id}
              className="group overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-soft"
            >
              <div className="relative aspect-[9/16] w-full bg-[hsl(var(--color-bg))]">
                <video
                  src={video.video_url}
                  poster={video.thumbnail_url || undefined}
                  className="h-full w-full object-cover"
                  muted
                  autoPlay
                  loop
                  playsInline
                  preload="metadata"
                />
                <div className="absolute left-2 top-2 rounded-full bg-[hsl(var(--color-bg)/0.82)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur">
                  {video.model_key}
                </div>
                <div className="absolute right-2 top-2 rounded-full bg-[hsl(var(--color-bg)/0.82)] px-2 py-1 text-[10px] font-semibold text-[hsl(var(--color-text))] backdrop-blur">
                  {video.duration_seconds}s
                </div>
              </div>
              <div className="space-y-1 px-3 py-3">
                <p className="line-clamp-1 text-sm font-semibold text-[hsl(var(--color-text))]">{video.title}</p>
                <p className="line-clamp-2 text-xs text-[hsl(var(--color-muted))]">{video.prompt}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {images.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {images.slice(0, 12).map((image) => (
            <article
              key={image.id}
              className="group overflow-hidden rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]"
            >
              <div className="aspect-square w-full overflow-hidden">
                <img
                  src={image.image_url}
                  alt={image.title}
                  className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  loading="lazy"
                />
              </div>
              <div className="px-2 py-2">
                <p className="line-clamp-1 text-xs font-semibold text-[hsl(var(--color-text))]">{image.title}</p>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
