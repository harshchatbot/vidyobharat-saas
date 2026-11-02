
'use client';

import {
  useEffect,
  useRef,
  useState,
} from 'react';
import dynamic from 'next/dynamic';
import {
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  Check,
  ChevronRight,
  Film,
  Headphones,
  Heart,
  ImagePlus,
  Menu,
  MessageSquareHeart,
  Mic2,
  Music2,
  Play,
  Scissors,
  Sparkles,
  WandSparkles,
} from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import styles from './PublicStudioLanding.module.css';

const GuestUpload = dynamic(
  () =>
    import('./GuestUpload').then(
      (module) => module.GuestUpload,
    ),
  { ssr: false },
);

const MUSIC_URL = '/music-studio';
const EDITOR_URL = '/editor';

type Occasion = {
  label: string;
  hindi: string;
  video: string;
  color: string;
  caption: string;
};

const occasions: Occasion[] = [
  {
    label: 'Festival',
    hindi: 'त्योहार',
    video:
      '/videos/samples/explain-gravity-simply.mp4',
    color: '#ffd86a',
    caption: 'Make every celebration memorable.',
  },
  {
    label: 'Wedding',
    hindi: 'शादी',
    video:
      '/videos/samples/anime_lofi_reel.mp4',
    color: '#f5b0c9',
    caption: 'Turn beautiful moments into stories.',
  },
  {
    label: 'Birthday',
    hindi: 'जन्मदिन',
    video:
      '/videos/samples/hindi-festival-9x16.mp4',
    color: '#c7b5ff',
    caption: 'Make their special day unforgettable.',
  },
  {
    label: 'Memories',
    hindi: 'यादें',
    video:
      '/videos/samples/tamil-education-9x16.mp4',
    color: '#a9e3ce',
    caption: 'Give everyday memories a little magic.',
  },
];

function VideoPreview({
  src,
  label,
  className,
  eager = false,
}: {
  src: string;
  label?: string;
  className?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const media = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    );

    let visible = false;

    const synchronize = () => {
      if (visible && !media.matches) {
        void video.play().catch(() => {});
      } else {
        video.pause();
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        synchronize();
      },
      { threshold: 0.1 },
    );

    observer.observe(video);

    media.addEventListener(
      'change',
      synchronize,
    );

    return () => {
      observer.disconnect();
      media.removeEventListener(
        'change',
        synchronize,
      );
      video.pause();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      src={src}
      className={className}
      aria-label={label}
      muted
      loop
      playsInline
      preload={eager ? 'metadata' : 'none'}
    />
  );
}

function Reveal({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reducedMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={
        reducedMotion
          ? false
          : { opacity: 0, y: 22 }
      }
      whileInView={{
        opacity: 1,
        y: 0,
      }}
      viewport={{
        once: true,
        amount: 0.12,
      }}
      transition={{
        duration: 0.5,
        ease: 'easeOut',
      }}
    >
      {children}
    </motion.div>
  );
}

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.navInner}>
        <a
          href="/"
          className={styles.brand}
          aria-label="RangManch AI homepage"
        >
          <BrandLogo
            variant="mark"
            size="md"
          />

          <span>
            RangManch
            <span className={styles.brandAi}>
              AI
            </span>
          </span>
        </a>

        <nav
          className={styles.desktopNav}
          aria-label="Primary navigation"
        >
          <a href="#products">Explore tools</a>
          <a href={MUSIC_URL}>Music Studio</a>
          <a href="#how-it-works">How it works</a>
          <a href="#feedback">Feedback</a>
        </nav>

        <div className={styles.navActions}>
          <a
            href={EDITOR_URL}
            className={styles.navCta}
          >
            Start creating
            <ArrowRight size={17} />
          </a>

          <details className={styles.mobileMenu}>
            <summary aria-label="Open navigation">
              <Menu size={24} />
            </summary>

            <nav aria-label="Mobile navigation">
              <a href="#products">Explore tools</a>
              <a href={EDITOR_URL}>
                AI Video Editor
              </a>
              <a href={MUSIC_URL}>
                AI Music Studio
              </a>
              <a href="#how-it-works">
                How it works
              </a>
              <a href="#feedback">Feedback</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const reducedMotion = useReducedMotion();

  return (
    <section
      className={styles.hero}
      aria-labelledby="hero-title"
    >
      <div className={styles.heroInner}>
        <motion.div
          className={styles.heroCopy}
          initial={
            reducedMotion
              ? false
              : { opacity: 0, y: 25 }
          }
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            duration: 0.55,
            ease: 'easeOut',
          }}
        >
          <p className={styles.heroTopline}>
            <Sparkles size={17} />
            THE CREATIVE PLAYGROUND
          </p>

          <h1 id="hero-title">
            Your creativity.
            <br />
            <em>Our little bit</em>
            <br />
            <em>of magic.</em>
          </h1>

          <p className={styles.heroDescription}>
            Make beautiful reels from your
            photos and videos. Turn your
            raw vocal recordings into
            polished music. Create more,
            without the complicated software.
          </p>

          <div className={styles.heroActions}>
            <a
              href="#products"
              className={styles.primaryCta}
            >
              Explore our tools
              <ArrowRight size={20} />
            </a>

            <a
              href={MUSIC_URL}
              className={styles.secondaryCta}
            >
              <Music2 size={18} />
              Try Music Studio
            </a>
          </div>

          <p className={styles.heroNote}>
            <Check size={16} />
            Browser-based tools for
            everyday creators.
          </p>
        </motion.div>

        <div
          className={styles.heroVisual}
          aria-label="RangManch creative tools"
        >
          <div
            className={styles.heroDecorStar}
            aria-hidden="true"
          >
            ✳
          </div>

          <div className={styles.heroVideoCard}>
            <div className={styles.heroCardTop}>
              <Film size={16} />
              VIDEO MAGIC
            </div>

            <div className={styles.heroVideoFrame}>
              <VideoPreview
                src={occasions[1].video}
                label="Sample RangManch reel"
                eager
              />
            </div>

            <span className={styles.heroVideoLabel}>
              Your moments, remixed.
            </span>
          </div>

          <div className={styles.heroMusicCard}>
            <div className={styles.heroCardTop}>
              <Music2 size={17} />
              STUDIO MAGIC
            </div>

            <img
              src="/images/music-studio-hero.png"
              alt="Music recording studio"
              loading="eager"
            />

            <strong>
              Your voice deserves a studio.
            </strong>
          </div>

          <div className={styles.heroSticker}>
            MADE TO
            <br />
            CREATE!
          </div>
        </div>
      </div>

      <a
        href="#products"
        className={styles.heroScroll}
      >
        PICK YOUR CREATIVE TOOL
        <ArrowDown size={18} />
      </a>
    </section>
  );
}

function ProductSection() {
  return (
    <section
      id="products"
      className={styles.productsSection}
      aria-labelledby="products-title"
    >
      <Reveal className={styles.sectionIntro}>
        <p className={styles.kicker}>
          TWO TOOLS. ENDLESS IDEAS.
        </p>

        <h2 id="products-title">
          So, what are we
          <br />
          <em>making today?</em>
        </h2>

        <p>
          Whether you create videos or
          sing your heart out, RangManch
          gives your ideas a place to shine.
        </p>
      </Reveal>

      <div className={styles.productsGrid}>
        <Reveal className={styles.videoProduct}>
          <div className={styles.productCardTop}>
            <span>01 / VIDEO</span>
            <Film size={26} />
          </div>

          <div className={styles.productIllustration}>
            <div className={styles.productVideoPreview}>
              <VideoPreview
                src={occasions[0].video}
                label="AI video editor preview"
              />
            </div>

            <div className={styles.productSticker}>
              AUTO
              <br />
              EDIT!
            </div>
          </div>

          <div className={styles.productCopy}>
            <h3>
              Make reels.
              <br />
              Make memories.
            </h3>

            <p>
              Upload your favorite photos
              and videos, create an editable
              reel, and make it yours with
              AI-assisted tools.
            </p>

            <a
              href={EDITOR_URL}
              className={styles.productButton}
            >
              Make my reel!
              <ArrowRight size={19} />
            </a>
          </div>
        </Reveal>

        <Reveal className={styles.musicProduct}>
          <div className={styles.productCardTop}>
            <span>02 / MUSIC</span>
            <Music2 size={27} />
          </div>

          <div className={styles.productIllustration}>
            <div className={styles.productMusicPreview}>
              <img
                src="/images/music-studio-hero.png"
                alt="Microphone and music production desk"
                loading="lazy"
              />
            </div>

            <div className={styles.productSticker}>
              STUDIO
              <br />
              VIBES!
            </div>
          </div>

          <div className={styles.productCopy}>
            <h3>
              Sing it.
              <br />
              Make it shine.
            </h3>

            <p>
              Upload separate vocals and
              instrumental tracks, choose
              a studio preset, and create
              a polished mix and master.
            </p>

            <a
              href={MUSIC_URL}
              className={styles.productButton}
            >
              Make my mix!
              <ArrowRight size={19} />
            </a>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function MusicFeature() {
  return (
    <section
      id="music-studio"
      className={styles.musicFeature}
    >
      <Reveal className={styles.musicFeatureInner}>
        <div className={styles.musicFeatureCopy}>
          <p className={styles.kicker}>
            <Mic2 size={17} />
            INTRODUCING AI MUSIC STUDIO
          </p>

          <h2>
            Bedroom singer?
            <br />
            <em>Big studio energy.</em>
          </h2>

          <p className={styles.musicFeatureDescription}>
            You bring the performance.
            RangManch helps with the mix.
            From acoustic covers to
            soulful ghazals, create
            studio-style audio without
            getting lost in audio software.
          </p>

          <div className={styles.musicFeatureSteps}>
            <span>
              <Mic2 size={17} />
              Upload vocals
            </span>

            <span>
              <Music2 size={17} />
              Add music
            </span>

            <span>
              <Headphones size={17} />
              Mix and master
            </span>
          </div>

          <a
            href={MUSIC_URL}
            className={styles.musicFeatureCta}
          >
            Let's make some music!
            <ArrowRight size={19} />
          </a>

          <p className={styles.musicFeatureNote}>
            Acoustic · Sufi / Ghazal · Clean Studio
          </p>
        </div>

        <div className={styles.musicFeatureVisual}>
          <img
            src="/images/music-studio-hero.png"
            alt="Recording studio with microphone and mixing console"
            loading="lazy"
          />

          <div className={styles.musicFeatureImageLabel}>
            <Headphones size={17} />
            YOUR SOUND. YOUR STYLE.
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function StartSection() {
  return (
    <section
      id="start"
      className={styles.startSection}
    >
      <div className={styles.startInner}>
        <p className={styles.kicker}>
          READY TO MAKE A REEL?
        </p>

        <h2>
          Your photos.
          <br />
          <em>Your story.</em>
        </h2>

        <p>
          Drop your photos and videos
          below to start creating.
        </p>

        <GuestUpload />
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: '01',
      icon: ImagePlus,
      title: 'Bring your moments.',
      description:
        'Choose the photos and clips already on your phone.',
    },
    {
      number: '02',
      icon: Scissors,
      title: 'Make it your own.',
      description:
        'Arrange your story, adjust timing, and use Auto Edit or AI Copilot.',
    },
    {
      number: '03',
      icon: Play,
      title: 'Share the magic.',
      description:
        'Preview your creation and export an MP4 ready to share.',
    },
  ];

  return (
    <section
      id="how-it-works"
      className={styles.storySection}
    >
      <Reveal className={styles.storyIntro}>
        <p className={styles.kicker}>
          THE CREATIVE JOURNEY
        </p>

        <h2>
          Three little steps.
          <br />
          <em>One big smile.</em>
        </h2>
      </Reveal>

      <div className={styles.storyGrid}>
        {steps.map(
          ({
            number,
            icon: Icon,
            title,
            description,
          }) => (
            <Reveal
              key={number}
              className={styles.storyCard}
            >
              <div className={styles.storyCardTop}>
                <span>{number}</span>
                <Icon size={31} />
              </div>

              <h3>{title}</h3>
              <p>{description}</p>
            </Reveal>
          ),
        )}
      </div>
    </section>
  );
}

function Inspiration() {
  const inspirationVideos = [
    '/videos/samples/inspiration/panda_dancing.mp4',
    '/videos/samples/inspiration/tamil-education-9x16.mp4',
    '/videos/samples/inspiration/ugc_ad_preview.mp4',
    '/videos/samples/inspiration/ugc_avtaar_product_ad.mp4',
  ];

  return (
    <section
      id="inspiration"
      className={styles.inspiration}
    >
      <Reveal className={styles.inspirationIntro}>
        <div>
          <p className={styles.kicker}>
            A LITTLE INSPIRATION
          </p>

          <h2>
            Every moment
            <br />
            <em>has a story.</em>
          </h2>
        </div>

        <p>
          Birthdays, celebrations,
          memories, and everything
          in between.
        </p>
      </Reveal>

      <div className={styles.reelStrip}>
        {occasions.map((item, index) => (
          <a
            href={EDITOR_URL}
            key={item.label}
            className={styles.inspirationReel}
            style={{
              backgroundColor: item.color,
            }}
          >
            <VideoPreview
              src={inspirationVideos[index]}
              label={`${item.label} inspiration`}
            />

            <span
              className={styles.inspirationOverlay}
            />

            <span
              className={styles.inspirationNumber}
            >
              0{index + 1} / 04
            </span>

            <span
              className={styles.inspirationCaption}
            >
              {item.label}
              <small>{item.hindi}</small>
            </span>

            <span
              className={styles.inspirationArrow}
            >
              <ArrowRight size={19} />
            </span>
          </a>
        ))}
      </div>

      <p className={styles.inspirationFootnote}>
        Preview reels for inspiration.
      </p>
    </section>
  );
}

function CopilotSection() {
  const [example, setExample] = useState(0);

  const prompts = [
    {
      request: 'Make it 20 seconds with music',
      response:
        'Duration set to 00:20 · Soundtrack added',
    },
    {
      request: 'Add a soft fade at the end',
      response: 'Fade-out transition added',
    },
    {
      request: 'Make it feel more cinematic',
      response:
        'Suggested pacing and color adjustments',
    },
  ];

  return (
    <section
      id="future"
      className={styles.future}
    >
      <Reveal className={styles.futureInner}>
        <div className={styles.futureCopy}>
          <p className={styles.kicker}>
            <WandSparkles size={18} />
            MEET AI COPILOT
          </p>

          <h2>
            Say it.
            <br />
            <em>See it happen.</em>
          </h2>

          <p>
            Need a shorter reel?
            Want different pacing?
            Tell RangManch what you'd
            like to change, preview
            the result, and stay
            in control.
          </p>

          <a
            href={EDITOR_URL}
            className={styles.futureLink}
          >
            Meet your creative copilot
            <ArrowRight size={19} />
          </a>
        </div>

        <div className={styles.chatStage}>
          <div className={styles.chatTop}>
            <span>
              <Sparkles size={18} />
              RANGMANCH COPILOT
            </span>

            <small>AI-ASSISTED EDITING</small>
          </div>

          <div className={styles.chatPrompt}>
            <span>YOU</span>
            <p>
              “{prompts[example].request}”
            </p>
          </div>

          <div className={styles.chatReply}>
            <span>
              <Sparkles size={15} />
              RANGMANCH
            </span>

            <p>
              <Check size={17} />
              {prompts[example].response}
            </p>
          </div>

          <div className={styles.promptOptions}>
            {prompts.map((prompt, index) => (
              <button
                key={prompt.request}
                type="button"
                aria-label={`Show example ${index + 1}`}
                aria-pressed={example === index}
                onClick={() => setExample(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function FeedbackSection() {
  return (
    <section
      id="feedback"
      className={styles.feedbackFeature}
    >
      <Reveal
        className={styles.feedbackFeatureInner}
      >
        <div className={styles.feedbackIcon}>
          <MessageSquareHeart size={38} />
        </div>

        <div>
          <p className={styles.kicker}>
            YOUR IDEAS MATTER
          </p>

          <h2>
            Got an idea?
            <br />
            <em>We're all ears!</em>
          </h2>

          <p>
            Want a new feature?
            Found something we could
            improve? Help shape the
            next version of RangManch.
          </p>
        </div>

        <div className={styles.feedbackComingSoon}>
          Feedback form coming soon
        </div>
      </Reveal>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className={styles.finalCta}>
      <p className={styles.kicker}>
        THE STAGE IS YOURS
      </p>

      <h2>
        Stop imagining.
        <br />
        <em>Start creating!</em>
      </h2>

      <div className={styles.finalActions}>
        <a href={EDITOR_URL}>
          Make a reel
          <Film size={19} />
        </a>

        <a href={MUSIC_URL}>
          Make some music
          <Music2 size={19} />
        </a>
      </div>

      <p>
        Made for the creators
        in all of us.
      </p>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <a
          href="/"
          className={styles.footerBrand}
        >
          <BrandLogo
            variant="mark"
            size="sm"
            priority="footer"
          />
          <span>RangManch AI</span>
        </a>

        <span>
          Made for creators,
          dreamers, and storytellers.
        </span>

        <nav aria-label="Footer navigation">
          <a href={EDITOR_URL}>
            Video Editor
          </a>

          <a href={MUSIC_URL}>
            Music Studio
          </a>

          <a href="#feedback">
            Feedback
          </a>
        </nav>

        <div className={styles.footerCredits}>
          Made with{' '}
          <Heart
            size={12}
            fill="currentColor"
            aria-label="love"
          />
          {' '}by{' '}
          <a
            href="https://techfilabs.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            TechFi Labs
          </a>
        </div>

        <span
          className={styles.footerCopyright}
          suppressHydrationWarning
        >
          © {new Date().getFullYear()} RangManch AI
        </span>
      </div>
    </footer>
  );
}

export function PublicStudioLanding() {
  return (
    <main className={styles.page}>
      <Header />
      <Hero />
      <ProductSection />
      <MusicFeature />
      <StartSection />
      <HowItWorks />
      <Inspiration />
      <CopilotSection />
      <FeedbackSection />
      <FinalCTA />
      <Footer />

      <a
        href="#products"
        className={styles.mobileSticky}
      >
        Explore creative tools
        <ChevronRight size={19} />
      </a>
    </main>
  );
}
