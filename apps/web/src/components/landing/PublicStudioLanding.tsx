import { ArrowRight, Download, Film, ImagePlus, Menu, MoveHorizontal, Play, Scissors, Upload } from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { MarketingButtonLink } from '@/components/ui/marketing/MarketingButtonLink';
import { SectionHeading } from '@/components/ui/marketing/SectionHeading';
import { GuestUpload } from './GuestUpload';
import styles from './PublicStudioLanding.module.css';

const steps = [
  { number: '01', title: 'Upload', description: 'Bring the photos and video clips already on your phone or computer.', icon: Upload },
  { number: '02', title: 'Arrange', description: 'Put every moment in order, trim the timing, and shape a vertical story.', icon: MoveHorizontal },
  { number: '03', title: 'Export', description: 'Render a polished MP4 that is ready to preview, download, and share.', icon: Download },
];

function Header() {
  return (
    <header className={styles.header}>
      <div className={styles.navShell}>
        <BrandLogo variant="mark" size="md" />
        <span className={styles.wordmark}>RangManch AI</span>
        <nav className={styles.desktopNav} aria-label="Primary navigation">
          <a href="#showcase">Explore</a>
          <a href="/editor">Create</a>
        </nav>
        <div className={styles.navActions}>
          <a className={styles.signIn} href="/login">Sign In</a>
          <MarketingButtonLink href="/editor" size="compact">Create free <ArrowRight aria-hidden="true" /></MarketingButtonLink>
          <details className={styles.mobileMenu}>
            <summary aria-label="Open navigation"><Menu aria-hidden="true" /></summary>
            <nav aria-label="Mobile navigation">
              <a href="#showcase">Explore</a>
              <a href="/editor">Create</a>
              <a href="/login">Sign In</a>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}

function EditorTimeline() {
  return (
    <div className={styles.timeline} aria-label="A sample reel editing timeline">
      <div className={styles.timelineToolbar}>
        <span><Scissors aria-hidden="true" /> Trim</span>
        <span className={styles.duration}>00:12</span>
      </div>
      <div className={styles.timelineTrack}>
        <span className={styles.playhead} />
        <span className={styles.clipPhoto}><ImagePlus aria-hidden="true" /></span>
        <span className={styles.clipVideo}><Film aria-hidden="true" /></span>
        <span className={styles.clipPhoto}><ImagePlus aria-hidden="true" /></span>
      </div>
    </div>
  );
}


function Hero() {
  return (
    <section className={styles.guestHero} aria-labelledby="hero-title">
      <div className={styles.guestHeroInner}>
        <p className={styles.eyebrow}>Your online video studio</p>

        <h1 id="hero-title">
          Your moments. Beautifully edited.
        </h1>

        <p className={styles.guestHeroDescription}>
          Upload your photos and videos, create your story,
          and export a beautiful reel.
        </p>

        <GuestUpload />

        <p className={styles.guestHeroNote}>
          No account required to get started.
        </p>
      </div>
    </section>
  );
}


function HowItWorks() {
  return (
    <section id="how-it-works" className={styles.stepsSection} aria-labelledby="steps-title">
      <div className={styles.sectionInner}>
        <SectionHeading id="steps-title" eyebrow="How it works" title="From camera roll to finished reel." description="Three clear steps, with your own media at the center of the process." />
        <ol className={styles.steps}>
          {steps.map(({ number, title, description, icon: Icon }) => (
            <li key={number}>
              <div className={styles.stepTop}><Icon aria-hidden="true" /><span>{number}</span></div>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Showcase() {
  return (
    <section id="showcase" className={styles.showcase} aria-labelledby="showcase-title">
      <div className={styles.showcaseInner}>
        <div className={styles.showcaseCopy}>
          <p className={styles.showcaseEyebrow}>Made for the moments worth keeping</p>
          <h2 id="showcase-title">See the whole story before you export.</h2>
          <p>Preview a vertical composition, check each clip in sequence, and keep the final cut focused on your footage.</p>
          <div className={styles.featureLine}>
            <span><Scissors aria-hidden="true" /> Precise trims</span>
            <span><Film aria-hidden="true" /> Browser-ready MP4</span>
          </div>
        </div>
        <div className={styles.previewStage}>
          <div className={styles.previewFrame}>
            <video src="/hero/hindi-festival-9x16.mp4" muted loop autoPlay playsInline preload="metadata" aria-label="Example vertical reel preview" />
            <span className={styles.previewTime}>00:12</span>
          </div>
          <div className={styles.previewRail} aria-hidden="true">
            <span>Story</span>
            <div><b /><b /><b /><b /></div>
            <small>4 moments</small>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerInner}>
        <div className={styles.footerBrand}><BrandLogo variant="mark" size="sm" priority="footer" /><span>RangManch AI</span></div>
        <p>Create a story from the moments you already have.</p>
        <nav aria-label="Footer navigation"><a href="#how-it-works">How it works</a><a href="/login">Sign in</a></nav>
      </div>
    </footer>
  );
}

export function PublicStudioLanding() {
  return <main className={styles.page}><Header /><Hero /><HowItWorks /><Showcase /><Footer /></main>;
}
