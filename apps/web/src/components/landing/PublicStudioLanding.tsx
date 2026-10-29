'use client';

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { ArrowDown, ArrowRight, Check, ChevronRight, Film, ImagePlus, Menu, Music2, Play, Scissors, Sparkles, WandSparkles } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
// The upload widget manages browser files and guest sessions; isolate its hydration.
const GuestUpload = dynamic(() => import('./GuestUpload').then((mod) => mod.GuestUpload), { ssr: false });
import styles from './PublicStudioLanding.module.css';

import type { CSSProperties } from 'react';

type Occasion = { label: string; hindi: string; video: string; accent: string; caption: string };

// Place your own short, muted 9:16 MP4 previews in apps/web/public/videos/occasions/.
// These are local paths, not remote video URLs.
const occasions: Occasion[] = [
  { label: 'Festival', hindi: 'त्योहार', video: '/videos/samples/explain-gravity-simply.mp4', accent: '#efaa56', caption: 'Every celebration deserves a story.' },
  { label: 'Wedding', hindi: 'शादी', video: '/videos/samples/anime_lofi_reel.mp4', accent: '#e4a6b3', caption: 'The moments you never want to forget.' },
  { label: 'Birthday', hindi: 'जन्मदिन', video: '/videos/samples/hindi-festival-9x16.mp4', accent: '#b8a1ff', caption: 'Make their day unforgettable.' },
  { label: 'Memories', hindi: 'यादें', video: '/videos/samples/tamil-education-9x16.mp4', accent: '#94cfc5', caption: 'A little magic for the everyday.' },
];

/** Pause off-screen previews and honor reduced-motion preferences. */
function VideoPreview({ src, className, label, eager = false }: {
  src: string;
  className?: string;
  label?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = false;
    const syncPlayback = () => {
      if (visible && !reducedMotion.matches) {
        void video.play().catch(() => { /* Autoplay may be blocked by browser settings. */ });
      } else {
        video.pause();
      }
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      syncPlayback();
    }, { threshold: 0.1 });
    observer.observe(video);
    reducedMotion.addEventListener('change', syncPlayback);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener('change', syncPlayback);
      video.pause();
    };
  }, [src]);

  return <video
    ref={ref}
    className={className}
    src={src}
    muted
    loop
    playsInline
    preload={eager ? 'metadata' : 'none'}
    aria-label={label}
    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
  />;
}

const story = [
  { number: '01', title: 'Start with your moments.', description: 'Choose the photos and clips already on your phone. No complicated setup.', icon: ImagePlus },
  { number: '02', title: 'Make it yours.', description: 'Arrange your story, adjust the timing and shape every transition.', icon: Scissors },
  { number: '03', title: 'Let it play.', description: 'Preview your reel and export an MP4 ready to share.', icon: Play },
];

function Header() {
  return <header className={styles.header}>
    <div className={styles.navInner}>
      <a href="/" className={styles.brand} aria-label="RangManch AI home"><BrandLogo variant="mark" size="md" /><span>RangManch<span className={styles.brandAi}>AI</span></span></a>
      <nav className={styles.desktopNav} aria-label="Primary navigation"><a href="#how-it-works">How it works</a><a href="#inspiration">Inspiration</a><a href="#future">What's next</a></nav>
      <div className={styles.navActions}><a className={styles.navCta} href="/editor">Open editor <ArrowRight size={16} aria-hidden="true" /></a>
        <details className={styles.mobileMenu}><summary aria-label="Open navigation"><Menu size={22} /></summary><nav aria-label="Mobile navigation"><a href="#how-it-works">How it works</a><a href="#inspiration">Inspiration</a><a href="#future">What's next</a></nav></details>
      </div>
    </div>
  </header>;
}

function MiniTimeline({ animated = false }: { animated?: boolean }) {
  return <div className={`${styles.miniTimeline} ${animated ? styles.timelineAnimated : ''}`} aria-label="Illustrative video timeline">
    <div className={styles.timelineHeading}><span><Film size={13} /> YOUR STORY</span><span>00:20</span></div>
    <div className={styles.timelineClips}><div /><div /><div /><div /><div /><span className={styles.timelinePlayhead} /></div>
    <div className={styles.timelineMusic}><Music2 size={12} /> soundtrack <span>♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪ ♪</span></div>
  </div>;
}

function Hero() {
  const [active, setActive] = useState(0);
  const [hindi, setHindi] = useState(false);
  const occasion = occasions[active];
  return <section className={styles.hero} aria-labelledby="hero-title" style={{ '--occasion-accent': occasion.accent } as CSSProperties}>
    <div className={styles.heroAmbient} aria-hidden="true" />
    <div className={styles.heroInner}>
      <div className={styles.heroCopy}>
        <div className={styles.heroTopline}><span className={styles.pulse} /> FREE ONLINE VIDEO EDITOR <span className={styles.toplineRule} /></div>

        <h1 id="hero-title">{hindi ? <>अपनी फ़ोटो और क्लिप्स से<br /><em>बनाएं शानदार रील।</em></> : <>Create stunning videos<br /><em>with AI — free.</em></>}</h1>

        <p className={styles.heroDescription}>{hindi ? 'अपनी फ़ोटो से सुंदर इंस्टाग्राम रील बनाएं — म्यूज़िक, टेक्स्ट और ट्रांज़िशन के साथ। सीधे ब्राउज़र में।' : 'Turn your photos into beautiful Instagram Reels with AI-powered editing, music, transitions, and text. No editing skills required.'}</p>
        <div className={styles.languageSwitch} aria-label="Headline language"><button type="button" aria-pressed={!hindi} onClick={() => setHindi(false)}>English</button><span>/</span><button type="button" aria-pressed={hindi} onClick={() => setHindi(true)}>हिंदी</button></div>
        <a className={styles.primaryCta} href="/editor">Start Editing for Free <ArrowRight size={19} aria-hidden="true" /></a>
        <p className={styles.heroNote}><Check size={14} /> Browser-based · Free to start</p>
        <span className={styles.soonChip}><Sparkles size={13} aria-hidden="true" /> Local AI Copilot + Auto Edit</span>
      </div>
      <div className={styles.heroVisual} aria-label={`${occasion.label} themed reel inspiration`}>
        <div className={styles.orbitOne} aria-hidden="true" /><div className={styles.orbitTwo} aria-hidden="true" />
        <div className={styles.floatingPhotoLeft} aria-hidden="true"><VideoPreview src={occasions[2].video} /></div>
        <div className={styles.floatingPhotoRight} aria-hidden="true"><VideoPreview src={occasions[1].video} /></div>
        <div className={styles.reelDevice}>
          <VideoPreview key={occasion.video} src={occasion.video} label={`${occasion.label} reel preview`} eager />
          <div className={styles.reelShade} /><div className={styles.reelLabel}><span>RANGMANCH ORIGINALS</span><strong>{occasion.caption}</strong></div>
          <div className={styles.reelControls}><Play size={15} fill="currentColor" /> <span>PREVIEW CONCEPT</span><span>9:16</span></div>
        </div>
        <div className={styles.floatingTimeline}><MiniTimeline /></div>
      </div>
    </div>
    <div className={styles.occasionBar}><span>MAKE IT FOR</span><div className={styles.occasionChoices}>{occasions.map((item, index) => <button key={item.label} type="button" aria-pressed={index === active} onClick={() => setActive(index)}>{item.label}<span>{item.hindi}</span></button>)}</div><a href="#how-it-works" aria-label="Discover how it works"><ArrowDown size={20} /></a></div>
  </section>;
}

function StartSection() {
  return <section id="start" className={styles.startSection} aria-labelledby="start-title"><div className={styles.startGlow} aria-hidden="true" /><div className={styles.startInner}><p className={styles.kicker}>YOUR STORY STARTS HERE</p><h2 id="start-title">Bring your moments.<br /><em>We'll make room for magic.</em></h2><p>Drop your photos and videos below to start editing in the browser.</p><GuestUpload /></div></section>;
}

function HowItWorks() {
  return <section id="how-it-works" className={styles.storySection} aria-labelledby="story-title"><div className={styles.storyInner}>
    <div className={styles.storySticky}><p className={styles.kicker}>THE CREATIVE JOURNEY</p><h2 id="story-title">From camera roll<br />to <em>“play it again.”</em></h2><div className={styles.storyPreview}><div className={styles.storyPreviewPhoto}><VideoPreview src="/videos/samples/english-startup-16x9.mp4" label="Example reel being arranged in a video timeline" /><span>YOUR MOMENTS, IN MOTION</span></div><MiniTimeline animated /></div></div>
    <motion.div className={styles.storySteps} initial={{ opacity: 0, y: 22 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.12 }} transition={{ duration: 0.65, ease: "easeOut" }}>{story.map(({ number, title, description, icon: Icon }) => <div className={styles.storyStep} key={number}><span className={styles.stepNumber}>{number} <Icon size={22} aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p></div>)}</motion.div>
  </div></section>;
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
      aria-labelledby="inspiration-title"
    >
      <div className={styles.inspirationIntro}>
        <div>
          <p className={styles.kicker}>A LITTLE INSPIRATION</p>
          <h2 id="inspiration-title">
            Every moment has
            <br />
            <em>a different mood.</em>
          </h2>
        </div>
        <p>
          Birthday wishes, festive memories, wedding moments or simply
          a beautiful day. Your footage, your story.
        </p>
      </div>

      <motion.div
        className={styles.reelStrip}
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.1 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
      >
        {occasions.map((item, index) => (
          <a
            href="/editor"
            className={styles.inspirationReel}
            key={item.label}
          >
            <VideoPreview
              src={inspirationVideos[index]}
              label={`${item.label} video inspiration`}
            />

            <span className={styles.inspirationOverlay} />
            <span className={styles.inspirationNumber}>
              0{index + 1} / 04
            </span>
            <span className={styles.inspirationCaption}>
              {item.label}
              <small>{item.hindi}</small>
            </span>
            <span className={styles.inspirationArrow}>
              <ArrowRight size={19} />
            </span>
          </a>
        ))}
      </motion.div>

      <p className={styles.inspirationFootnote}>
        Video inspiration · Preview reels, not prebuilt templates
      </p>
    </section>
  );
}

function ComingSoon() {
  const [example, setExample] = useState(0);
  const prompts = [
    { request: 'Make it 20 seconds with music', response: 'Duration set to 00:20 · Soundtrack added', duration: '00:20' },
    { request: 'Add a soft fade at the end', response: 'Fade-out transition added', duration: '00:20' },
    { request: 'Make it feel more cinematic', response: 'Suggested pacing and color adjustments', duration: '00:20' },
  ];
  return <section id="future" className={styles.future} aria-labelledby="future-title"><div className={styles.futureInner}><div className={styles.futureCopy}><span className={styles.soonPill}><Sparkles size={14} /> AVAILABLE NOW</span><h2 id="future-title">Describe it.<br />Preview it.<br /><em>Make it yours.</em></h2><p>Use the local AI Copilot or Auto Edit to turn uploaded photos into an editable reel. Review every change before applying it.</p><a href="/editor" className={styles.futureLink}>Open the editor <ArrowRight size={18} /></a></div><motion.div className={styles.chatStage} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.7, ease: "easeOut" }} aria-label="Preview of browser AI editing"><div className={styles.chatTop}><span><WandSparkles size={17} /> RANGMANCH COPILOT</span><small>LOCAL BROWSER AI</small></div><div className={styles.chatPrompt}><span>You</span><p>“{prompts[example].request}”</p></div><div className={styles.chatReply}><span><Sparkles size={14} /> RangManch</span><p><Check size={15} /> {prompts[example].response}</p></div><MiniTimeline animated /><div className={styles.promptOptions}>{prompts.map((prompt, i) => <button type="button" aria-pressed={example === i} key={prompt.request} onClick={() => setExample(i)}>{i + 1}</button>)}</div></motion.div></div></section>;
}

function FinalCTA() {
  return <section className={styles.finalCta}><p className={styles.kicker}>READY WHEN YOU ARE</p><h2>Don't just save the moment.<br /><em>Tell the story.</em></h2><a href="/editor">Start creating <ArrowRight size={20} /></a><p>Made for moments big and small.</p></section>;
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <a className={styles.footerBrand} href="/">
          <BrandLogo variant="mark" size="sm" priority="footer" />
          <span>RangManch AI</span>
        </a>

        <span>Make something worth remembering.</span>

        <nav aria-label="Footer navigation">
          <a href="#how-it-works">How it works</a>
          <a href="/editor">Editor</a>
        </nav>

        <div className={styles.footerCredits}>
          Made with <span aria-label="love">♥</span> by{' '}
          <a
            href="https://techfilabs.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            TechFi Labs
          </a>
          {' · '}
          Explore{' '}
          <a
            href="https://thetechnologyfiction.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            The Technology Fiction
          </a>
        </div>

        <span className={styles.footerCopyright} suppressHydrationWarning>
          © {new Date().getFullYear()} RangManch AI
        </span>
      </div>
    </footer>
  );
}

export function PublicStudioLanding() {
  return <main className={styles.page}><Header /><Hero /><StartSection /><HowItWorks /><Inspiration /><ComingSoon /><FinalCTA /><Footer /><a className={styles.mobileSticky} href="/editor">Make my reel <ChevronRight size={19} /></a></main>;
}
