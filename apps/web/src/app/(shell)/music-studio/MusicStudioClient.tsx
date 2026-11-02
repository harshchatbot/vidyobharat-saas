
'use client';

import {
  ChangeEvent,
  DragEvent,
  useEffect,
  useRef,
  useState,
} from 'react';
import Script from 'next/script';
import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from 'framer-motion';
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Download,
  Headphones,
  Lightbulb,
  Mic2,
  Music2,
  SlidersHorizontal,
  Sparkles,
  Upload,
  WandSparkles,
  Waves,
  X,
} from 'lucide-react';

import { API_URL } from '@/lib/env';
import styles from './music-studio.module.css';

type Mode = 'separate' | 'single' | 'karaoke';
type TrackType = 'vocal' | 'instrument';

type Job = {
  id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  stage: string;
  error?: string | null;
  measurements?: {
    integrated_lufs: number;
    true_peak_dbtp: number;
  };
  downloads?: Record<string, string>;
};

type Settings = {
  clarity: number;
  compression: number;
  reverb: number;
  delay: number;
  vocal_balance: number;
  sync_offset_ms: number;
  sidechain: boolean;
  de_esser: number;
  vocal_warmth: number;
  instrumental_width: number;
  noise_reduction: number;
};

const MAX_BYTES = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  'wav',
  'aif',
  'aiff',
  'mp3',
  'm4a',
]);

const TURNSTILE_SITE_KEY =
  process.env.NEXT_PUBLIC_MUSIC_STUDIO_TURNSTILE_SITE_KEY;

const DEFAULT_SETTINGS: Settings = {
  clarity: 0.55,
  compression: 0.35,
  reverb: 0.18,
  delay: 0,
  vocal_balance: 0,
  sync_offset_ms: 0,
  sidechain: false,
  de_esser: 0.25,
  vocal_warmth: 0.2,
  instrumental_width: 0.5,
  noise_reduction: 0,
};

const PRESETS = [
  {
    id: 'acoustic',
    name: 'Acoustic',
    emoji: '🎸',
    description: 'Warm & natural',
  },
  {
    id: 'sufi',
    name: 'Sufi / Ghazal',
    emoji: '🎙️',
    description: 'Soulful & rich',
  },
  {
    id: 'clean_studio',
    name: 'Clean Studio',
    emoji: '🎧',
    description: 'Crisp & polished',
  },
];

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: string,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          'expired-callback': () => void;
        },
      ) => void;
    };
  }
}

function validateFile(file: File | null): string | null {
  if (!file) return null;

  if (file.size === 0) {
    return 'The selected recording is empty.';
  }

  if (file.size > MAX_BYTES) {
    return 'Each recording must be 25 MB or smaller.';
  }

  const extension = file.name
    .split('.')
    .pop()
    ?.toLowerCase();

  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) {
    return 'Choose WAV, AIFF, MP3 or M4A audio.';
  }

  return null;
}

function StudioHero() {
  const reducedMotion = useReducedMotion();

  return (
    <section className={styles.hero} aria-labelledby="music-hero-title">
      <motion.div
        className={styles.heroContent}
        initial={reducedMotion ? false : { opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
      >
        <span className={styles.heroBadge}>
          <Sparkles size={17} />
          THE CREATIVE SOUND LAB
        </span>

        <h1 id="music-hero-title" className={styles.heroTitle}>
          Your voice.
          <br />
          Your vibe.
          <br />
          <em>Studio magic!</em>
        </h1>

        <p className={styles.heroDescription}>
          You bring the voice. You bring the music.
          RangManch brings them together with an easy
          studio-style mix and master.
        </p>

        <a href="#music-workspace" className={styles.heroCta}>
          Make my mix!
          <ArrowDown size={19} />
        </a>

        <p className={styles.heroNote}>
          Separate vocal + instrumental tracks required
        </p>
      </motion.div>

      <div className={styles.heroVisual}>
        <div className={styles.heroImageCard}>
          <div className={styles.heroImageTop}>
            <Music2 size={17} />
            RANGMANCH RECORDING CLUB
          </div>

          <img
            src="/images/music-studio-hero.png"
            alt="Recording studio with microphone and mixing console"
          />

          <div className={styles.heroImageBottom}>
            YOUR SOUND. YOUR STYLE.
          </div>
        </div>

        <span className={styles.heroSticker}>
          MAKE
          <br />
          SOME
          <br />
          NOISE!
        </span>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      number: '01',
      icon: Mic2,
      title: 'Drop your vocals',
      description: 'Upload your recorded singing or voice.',
    },
    {
      number: '02',
      icon: Music2,
      title: 'Bring the music',
      description: 'Add a separate guitar or backing track.',
    },
    {
      number: '03',
      icon: WandSparkles,
      title: 'Make some magic',
      description: 'Pick a vibe, process and download!',
    },
  ];

  return (
    <section className={styles.steps} aria-label="How it works">
      {steps.map(({ number, icon: Icon, title, description }) => (
        <div key={number} className={styles.step}>
          <span className={styles.stepNumber}>{number}</span>
          <Icon size={24} className={styles.stepIcon} />

          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
        </div>
      ))}
    </section>
  );
}

export function MusicStudioClient() {
  const [mode, setMode] = useState<Mode>('separate');
  const [vocal, setVocal] = useState<File | null>(null);
  const [instrument, setInstrument] = useState<File | null>(null);
  const [preset, setPreset] = useState('acoustic');
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const turnstileRendered = useRef(false);
  const reducedMotion = useReducedMotion();

  const inputError =
    validateFile(vocal) || validateFile(instrument);

  const isBusy =
    job?.stage === 'uploading' ||
    job?.status === 'queued' ||
    job?.status === 'processing';

  const canProduce =
    mode === 'separate' &&
    Boolean(vocal && instrument) &&
    !inputError &&
    !isBusy &&
    (!TURNSTILE_SITE_KEY || Boolean(turnstileToken));

  function update<K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function initializeTurnstile() {
    if (
      !TURNSTILE_SITE_KEY ||
      !window.turnstile ||
      turnstileRendered.current
    ) {
      return;
    }

    turnstileRendered.current = true;

    window.turnstile.render('#music-studio-turnstile', {
      sitekey: TURNSTILE_SITE_KEY,
      callback: setTurnstileToken,
      'expired-callback': () => setTurnstileToken(null),
    });
  }

  useEffect(() => {
    initializeTurnstile();
    // Mount-only initialization; Script onLoad also handles late loading.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (
      !job?.id ||
      !['queued', 'processing'].includes(job.status)
    ) {
      return;
    }

    let requestInFlight = false;

    const timer = window.setInterval(async () => {
      if (requestInFlight) return;
      requestInFlight = true;

      try {
        const response = await fetch(
          `${API_URL}/api/music-studio/jobs/${job.id}`,
          { credentials: 'include' },
        );

        if (!response.ok) {
          throw new Error(
            `Could not check progress (${response.status}).`,
          );
        }

        const next = (await response.json()) as Job;
        setJob(next);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : 'Could not retrieve job progress.',
        );
      } finally {
        requestInFlight = false;
      }
    }, 1500);

    return () => window.clearInterval(timer);
  }, [job?.id, job?.status]);

  useEffect(() => {
    if (!isBusy || !startedAt) {
      setElapsed(0);
      return;
    }

    const timer = window.setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isBusy, startedAt]);

  function setTrack(which: TrackType, file: File | null) {
    if (which === 'vocal') {
      setVocal(file);
    } else {
      setInstrument(file);
    }

    setJob(null);
    setStartedAt(null);
    setError(validateFile(file));
  }

  function handlePick(which: TrackType) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setTrack(which, event.target.files?.[0] ?? null);
    };
  }

  async function produce() {
    if (!vocal || !instrument || !canProduce) return;

    setError(null);
    setStartedAt(Date.now());
    setJob({
      id: '',
      status: 'queued',
      stage: 'uploading',
    });

    try {
      const body = new FormData();

      body.set('vocal', vocal);
      body.set('instrument', instrument);
      body.set('settings', JSON.stringify({ preset, ...settings }));

      if (turnstileToken) {
        body.set('turnstile_token', turnstileToken);
      }

      const response = await fetch(
        `${API_URL}/api/music-studio/jobs`,
        {
          method: 'POST',
          body,
          credentials: 'include',
        },
      );

      const result = (await response.json()) as
        | Job
        | {
          detail?: string | { message?: string };
        };

      if (!response.ok) {
        let message = 'Could not start your mix.';

        if ('detail' in result) {
          if (typeof result.detail === 'string') {
            message = result.detail;
          } else if (result.detail?.message) {
            message = result.detail.message;
          }
        }

        throw new Error(message);
      }

      setJob(result as Job);
    } catch (cause) {
      setJob(null);
      setError(
        cause instanceof Error
          ? cause.message
          : 'Could not start your mix.',
      );
    }
  }

  const stageTitle =
    job?.status === 'completed'
      ? 'Your track is ready!'
      : job?.status === 'failed'
        ? 'Something went wrong'
        : job?.stage === 'uploading'
          ? 'Uploading your tracks'
          : job?.stage === 'validating_recordings'
            ? 'Checking your recordings'
            : job?.stage === 'processing_mix_master_export'
              ? 'Mixing the magic'
              : 'Ready when you are!';

  const stageMessage =
    job?.status === 'completed'
      ? 'Give it a listen, then grab your master.'
      : job?.status === 'failed'
        ? job.error || 'Please try again with different recordings.'
        : job?.stage === 'uploading'
          ? 'Your files are on their way…'
          : isBusy
            ? 'Balancing vocals, mixing and mastering…'
            : 'Two tracks, one great sound. Let’s do this.';

  function downloadUrl(value?: string) {
    return value ? `${API_URL}${value}` : undefined;
  }

  return (
    <main className={styles.page}>
      {TURNSTILE_SITE_KEY && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={initializeTurnstile}
        />
      )}

      <div className={styles.container}>
        <StudioHero />
        <HowItWorks />

        <div
          id="music-workspace"
          className={styles.workspaceHeading}
        >
          <span className={styles.eyebrow}>
            <Sparkles size={17} />
            THE CREATIVE DESK
          </span>

          <h2>
            Let’s make
            <em> something amazing.</em>
          </h2>

          <p>
            Choose your recordings, pick a vibe and hit Produce.
            Your studio session starts here.
          </p>
        </div>

        <div className={styles.workspace}>
          <div className={styles.workspaceMain}>
            <section className={`${styles.panel} ${styles.uploadPanel}`}>
              <div className={styles.panelHeading}>
                <span className={styles.panelNumber}>01</span>

                <div>
                  <h2>Bring your tracks!</h2>
                  <p>Good music starts with your recordings.</p>
                </div>

                <Upload size={24} />
              </div>

              <div className={styles.modeSelector} role="group" aria-label="Audio mode">
                <button
                  type="button"
                  aria-pressed={mode === 'separate'}
                  className={
                    mode === 'separate'
                      ? styles.modeActive
                      : styles.modeInactive
                  }
                  onClick={() => setMode('separate')}
                  disabled={isBusy}
                >
                  Two separate tracks
                </button>

                <button
                  type="button"
                  aria-pressed={mode === 'single'}
                  className={
                    mode === 'single'
                      ? styles.modeActive
                      : styles.modeInactive
                  }
                  onClick={() => setMode('single')}
                  disabled={isBusy}
                >
                  One recording
                </button>

                <button
                  type="button"
                  aria-pressed={mode === 'karaoke'}
                  className={
                    mode === 'karaoke'
                      ? styles.modeActive
                      : styles.modeInactive
                  }
                  onClick={() => setMode('karaoke')}
                  disabled={isBusy}
                >
                  🎤 Create Karaoke
                </button>
              </div>

              {mode === 'single' ? (
                <div className={styles.warning}>
                  <strong>🎙️ One Recording — Coming Soon</strong>
                  <p>
                    Upload vocals only, or vocals and instruments together.
                    Rangmanch will intelligently enhance your recording.
                  </p>
                </div>
              ) : mode === 'karaoke' ? (
                <div className={styles.warning}>
                  <strong>🎤 AI Karaoke — Coming Soon</strong>
                  <p>
                    Upload a song, remove the original vocals, and
                    adjust the pitch and tempo for your performance.
                  </p>
                </div>
              ) : (
                <div className={styles.uploadGrid}>
                  <UploadSlot
                    title="YOUR VOCALS"
                    description="Your singing or voice recording"
                    file={vocal}
                    kind="vocal"
                    onChange={handlePick('vocal')}
                    onFile={(file) => setTrack('vocal', file)}
                    disabled={isBusy}
                  />

                  <UploadSlot
                    title="YOUR MUSIC"
                    description="Guitar, piano or backing track"
                    file={instrument}
                    kind="instrument"
                    onChange={handlePick('instrument')}
                    onFile={(file) => setTrack('instrument', file)}
                    disabled={isBusy}
                  />
                </div>
              )}

              <p className={styles.helpText}>
                WAV, AIFF, MP3 or M4A · Up to 25 MB each ·
                Maximum 2 minutes per track. Start both recordings
                at the same timeline position for best results.
              </p>

              {inputError && (
                <p role="alert" className={styles.error}>
                  {inputError}
                </p>
              )}
            </section>

            <section className={`${styles.panel} ${styles.presetPanel}`}>
              <div className={styles.panelHeading}>
                <span className={styles.panelNumber}>02</span>

                <div>
                  <h2>Pick your vibe!</h2>
                  <p>What kind of sound are we making today?</p>
                </div>

                <Music2 size={25} />
              </div>

              <div className={styles.presetGrid}>
                {PRESETS.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    disabled={isBusy}
                    aria-pressed={preset === item.id}
                    onClick={() => setPreset(item.id)}
                    className={
                      preset === item.id
                        ? styles.presetActive
                        : styles.presetInactive
                    }
                  >
                    <span className={styles.presetEmoji}>
                      {item.emoji}
                    </span>

                    <strong>{item.name}</strong>
                    <small>{item.description}</small>

                    {preset === item.id && (
                      <CheckCircle2
                        size={19}
                        className={styles.presetCheck}
                      />
                    )}
                  </button>
                ))}
              </div>
            </section>

            <section className={`${styles.panel} ${styles.mixerPanel}`}>
              <div className={styles.panelHeading}>
                <span className={styles.panelNumber}>03</span>

                <div>
                  <h2>Make it yours.</h2>
                  <p>A little more polish? You’re in control.</p>
                </div>

                <SlidersHorizontal size={25} />
              </div>

              <div className={styles.sliderGrid}>
                <Slider
                  label="Vocal clarity"
                  value={settings.clarity}
                  disabled={isBusy}
                  onChange={(value) => update('clarity', value)}
                />

                <Slider
                  label="Compression"
                  value={settings.compression}
                  disabled={isBusy}
                  onChange={(value) => update('compression', value)}
                />

                <Slider
                  label="Room reverb"
                  value={settings.reverb}
                  disabled={isBusy}
                  onChange={(value) => update('reverb', value)}
                />

                <Slider
                  label="Delay"
                  value={settings.delay}
                  disabled={isBusy}
                  onChange={(value) => update('delay', value)}
                />

                <Slider
                  label="Vocal balance"
                  value={(settings.vocal_balance + 1) / 2}
                  disabled={isBusy}
                  onChange={(value) =>
                    update('vocal_balance', value * 2 - 1)
                  }
                />
              </div>

              <button
                type="button"
                className={styles.advancedToggle}
                onClick={() => setAdvanced((previous) => !previous)}
                aria-expanded={advanced}
                disabled={isBusy}
              >
                <SlidersHorizontal size={16} />

                {advanced
                  ? 'Hide advanced settings'
                  : 'Show advanced settings'}

                {advanced ? (
                  <ChevronUp size={17} />
                ) : (
                  <ChevronDown size={17} />
                )}
              </button>

              {advanced && (
                <div className={styles.advancedPanel}>
                  <label className={styles.numberLabel}>
                    Manual sync offset (ms)
                    <input
                      type="number"
                      min={-10000}
                      max={10000}
                      value={settings.sync_offset_ms}
                      disabled={isBusy}
                      className={styles.numberInput}
                      onChange={(event) =>
                        update(
                          'sync_offset_ms',
                          Number(event.target.value),
                        )
                      }
                    />
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={settings.sidechain}
                      disabled={isBusy}
                      onChange={(event) =>
                        update('sidechain', event.target.checked)
                      }
                    />
                    Gentle vocal ducking
                  </label>

                  <Slider
                    label="De-esser"
                    value={settings.de_esser}
                    disabled={isBusy}
                    onChange={(value) => update('de_esser', value)}
                  />

                  <Slider
                    label="Vocal warmth"
                    value={settings.vocal_warmth}
                    disabled={isBusy}
                    onChange={(value) => update('vocal_warmth', value)}
                  />

                  <Slider
                    label="Instrumental width"
                    value={settings.instrumental_width}
                    disabled={isBusy}
                    onChange={(value) =>
                      update('instrumental_width', value)
                    }
                  />

                  <Slider
                    label="Gentle noise reduction"
                    value={settings.noise_reduction}
                    disabled={isBusy}
                    onChange={(value) =>
                      update('noise_reduction', value)
                    }
                  />
                </div>
              )}
            </section>
          </div>

          <aside className={styles.productionDesk}>
            <div className={styles.productionCard}>
              <div className={styles.productionTop}>
                <span>
                  <Headphones size={20} />
                  YOUR PRODUCTION DESK
                </span>
                <span className={styles.productionStar}>✳</span>
              </div>

              <div className={styles.productionBody}>
                <div className={styles.productionIcon}>
                  {job?.status === 'completed' ? (
                    <CheckCircle2 size={39} />
                  ) : (
                    <Waves size={39} />
                  )}
                </div>

                <h2>{stageTitle}</h2>

                <p
                  aria-live="polite"
                  className={styles.status}
                >
                  {stageMessage}
                  {isBusy ? ` · ${elapsed}s elapsed` : ''}
                </p>

                {isBusy && (
                  <div
                    className={styles.progressTrack}
                    aria-label="Processing audio"
                  >
                    <span />
                  </div>
                )}

                {TURNSTILE_SITE_KEY && (
                  <div
                    id="music-studio-turnstile"
                    className={styles.turnstile}
                  />
                )}

                {error && (
                  <p role="alert" className={styles.error}>
                    {error}
                  </p>
                )}

                <button
                  type="button"
                  className={styles.produceButton}
                  disabled={!canProduce}
                  onClick={produce}
                >
                  {isBusy ? (
                    <Waves size={21} />
                  ) : (
                    <Sparkles size={21} />
                  )}

                  {isBusy
                    ? 'WORKING ON YOUR MIX…'
                    : 'MAKE MY MIX!'}
                  <ArrowRight size={20} />
                </button>

                <p className={styles.productionHint}>
                  Choose your files and preset, then let
                  RangManch do its thing.
                </p>

                <AnimatePresence mode="wait">
                  {job?.status === 'completed' && (
                    <motion.div
                      key="completed"
                      initial={
                        reducedMotion
                          ? false
                          : { opacity: 0, y: 12 }
                      }
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={styles.output}
                    >
                      <h3>
                        <CheckCircle2 size={21} />
                        YOUR TRACK IS READY!
                      </h3>

                      <p>
                        Listen to your masterpiece and
                        download your mix.
                      </p>

                      <audio
                        controls
                        crossOrigin="use-credentials"
                        className={styles.audioPreview}
                        src={downloadUrl(job.downloads?.wav)}
                      />

                      {job.measurements && (
                        <p className={styles.measurements}>
                          {job.measurements.integrated_lufs.toFixed(1)}{' '}
                          LUFS ·{' '}
                          {job.measurements.true_peak_dbtp.toFixed(1)}{' '}
                          dBTP
                        </p>
                      )}

                      <div className={styles.downloadGrid}>
                        {(['wav', 'mp3'] as const).map((kind) => (
                          <a
                            key={kind}
                            href={
                              downloadUrl(job.downloads?.[kind]) ||
                              '#'
                            }
                            className={styles.downloadButton}
                          >
                            <Download size={17} />
                            {kind.toUpperCase()}
                          </a>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className={styles.tipCard}>
              <Lightbulb size={24} />
              <div>
                <h3>STUDIO TIP!</h3>
                <p>
                  Record in a quiet room, avoid
                  clipping, and keep both tracks
                  aligned for a cleaner mix.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

function UploadSlot({
  title,
  description,
  file,
  kind,
  onChange,
  onFile,
  disabled,
}: {
  title: string;
  description: string;
  file: File | null;
  kind: TrackType;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFile: (file: File | null) => void;
  disabled: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);

    if (disabled) return;

    onFile(event.dataTransfer.files?.[0] ?? null);
  }

  return (
    <div
      className={`${styles.uploadSlot} ${file ? styles.uploadSelected : ''
        } ${dragging ? styles.uploadDragging : ''}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <button
        type="button"
        disabled={disabled}
        className={styles.uploadSelect}
        onClick={() => ref.current?.click()}
      >
        <span className={styles.uploadIcon}>
          {kind === 'vocal' ? (
            <Mic2 size={32} />
          ) : (
            <Music2 size={32} />
          )}
        </span>

        <strong>{title}</strong>
        <span className={styles.uploadDescription}>
          {description}
        </span>

        <span className={styles.uploadFilename}>
          {file?.name || 'Drop a file or click to browse'}
        </span>

        <span className={styles.uploadBrowse}>
          {file ? (
            <>
              <Check size={16} />
              Change file
            </>
          ) : (
            <>
              <Upload size={16} />
              Choose file
            </>
          )}
        </span>
      </button>

      {file && !disabled && (
        <button
          type="button"
          className={styles.removeButton}
          onClick={() => {
            if (ref.current) ref.current.value = '';
            onFile(null);
          }}
        >
          <X size={15} />
          Remove
        </button>
      )}

      <input
        ref={ref}
        type="file"
        className="sr-only"
        disabled={disabled}
        accept=".wav,.aif,.aiff,.mp3,.m4a,audio/wav,audio/aiff,audio/mpeg,audio/mp4"
        onChange={onChange}
      />
    </div>
  );
}

function Slider({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}) {
  return (
    <label className={styles.sliderLabel}>
      <span>
        <strong>{label}</strong>
        <span>{Math.round(value * 100)}%</span>
      </span>

      <input
        className={styles.slider}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        disabled={disabled}
        onChange={(event) =>
          onChange(Number(event.target.value))
        }
      />
    </label>
  );
}
