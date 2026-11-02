"use client";

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from "react";

import { motion, useReducedMotion } from "framer-motion";
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
} from "lucide-react";

import { decodeFile, renderBrowserMix } from "@/lib/music-studio/browserProduction";
import { separateBrowserAudio, type BrowserStems } from "@/lib/music-studio/browserSeparation";
import styles from "./music-studio.module.css";

type Mode = "separate" | "single" | "karaoke";
type TrackType = "vocal" | "instrument";

type Job = {
  id: string;
  status: "queued" | "processing" | "completed" | "failed";
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
  stereo_space: "natural" | "wide" | "cinematic";
};

const MAX_BYTES = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set(["wav", "aif", "aiff", "mp3", "m4a"]);

// Explicit opt-in until pretrained model weight rights and mobile performance are verified.
const BROWSER_SEPARATION_ENABLED = process.env.NEXT_PUBLIC_BROWSER_SEPARATION_ENABLED === "true";


const PRESET_SETTINGS: Record<string, Settings> = {
  acoustic: {
    stereo_space: "natural",
    clarity: 0.55,
    compression: 0.35,
    reverb: 0.2,
    delay: 0,
    vocal_balance: 0,
    sync_offset_ms: 0,
    sidechain: false,
    de_esser: 0.25,
    vocal_warmth: 0.25,
    instrumental_width: 0.5,
    noise_reduction: 0,
  },

  sufi: {
    stereo_space: "wide",
    clarity: 0.5,
    compression: 0.25,
    reverb: 0.35,
    delay: 0.08,
    vocal_balance: 0,
    sync_offset_ms: 0,
    sidechain: false,
    de_esser: 0.2,
    vocal_warmth: 0.4,
    instrumental_width: 0.55,
    noise_reduction: 0,
  },

  clean_studio: {
    stereo_space: "natural",
    clarity: 0.65,
    compression: 0.45,
    reverb: 0.12,
    delay: 0,
    vocal_balance: 0,
    sync_offset_ms: 0,
    sidechain: false,
    de_esser: 0.35,
    vocal_warmth: 0.15,
    instrumental_width: 0.45,
    noise_reduction: 0,
  },
};

const PRESETS = [
  {
    id: "acoustic",
    name: "Acoustic",
    emoji: "🎸",
    description: "Warm & natural",
  },
  {
    id: "sufi",
    name: "Sufi / Ghazal",
    emoji: "🎙️",
    description: "Soulful & rich",
  },
  {
    id: "clean_studio",
    name: "Clean Studio",
    emoji: "🎧",
    description: "Crisp & polished",
  },
];

function validateFile(file: File | null): string | null {
  if (!file) return null;

  if (file.size === 0) {
    return "The selected recording is empty.";
  }

  if (file.size > MAX_BYTES) {
    return "Each recording must be 25 MB or smaller.";
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (!extension || !SUPPORTED_EXTENSIONS.has(extension)) {
    return "Choose WAV, AIFF, MP3 or M4A audio.";
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
        transition={{ duration: 0.5, ease: "easeOut" }}
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
          You bring the voice. You bring the music. RangManch brings them
          together with an easy studio-style mix and master.
        </p>

        <a href="#music-workspace" className={styles.heroCta}>
          Make my mix!
          <ArrowDown size={19} />
        </a>

        <p className={styles.heroNote}>
          Upload one recording or bring your own separate tracks
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

          <div className={styles.heroImageBottom}>YOUR SOUND. YOUR STYLE.</div>
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
      number: "01",
      icon: Mic2,
      title: "Drop your vocals",
      description: "Upload your recorded singing or voice.",
    },
    {
      number: "02",
      icon: Music2,
      title: "Bring the music",
      description: "Add a separate guitar or backing track.",
    },
    {
      number: "03",
      icon: WandSparkles,
      title: "Make some magic",
      description: "Pick a vibe, process and download!",
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
  const [mode, setMode] = useState<Mode>("single");
  const [vocal, setVocal] = useState<File | null>(null);
  const [instrument, setInstrument] = useState<File | null>(null);
  const [singleRecording, setSingleRecording] = useState<File | null>(null);
  const [recordingKind, setRecordingKind] = useState<"mixed" | "vocals_only" | "instrument_only">("mixed");
  const [preset, setPreset] = useState("acoustic");
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState<Settings>(PRESET_SETTINGS.acoustic);

  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  function clearOutput() {
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    outputUrlRef.current = null;
    setOutputUrl(null);
  }
  const [error, setError] = useState<string | null>(null);



  const [browserBusy, setBrowserBusy] = useState(false);
  const [browserProgress, setBrowserProgress] = useState("");
  const [browserStems, setBrowserStems] = useState<BrowserStems | null>(null);
  const browserStemsRef = useRef<BrowserStems | null>(null);
  const clearBrowserStems = () => {
    const previous = browserStemsRef.current;
    if (previous) {
      URL.revokeObjectURL(previous.vocals);
      URL.revokeObjectURL(previous.instrumental);
    }
    browserStemsRef.current = null;
    setBrowserStems(null);
  };
  useEffect(() => () => {
    const previous = browserStemsRef.current;
    if (previous) {
      URL.revokeObjectURL(previous.vocals);
      URL.revokeObjectURL(previous.instrumental);
    }
  }, []);


  const reducedMotion = useReducedMotion();

  const requiresBrowserAI = mode === "karaoke" || (mode === "single" && recordingKind === "mixed");
  const inputError = mode === "separate" ? (validateFile(vocal) || validateFile(instrument)) : validateFile(singleRecording);

  const isBusy = browserBusy;

  const canProduce =
    (mode === "separate" ? Boolean(vocal && instrument) : Boolean(singleRecording)) &&
    !inputError &&
    !isBusy &&
    (!requiresBrowserAI || BROWSER_SEPARATION_ENABLED);

  function update<K extends keyof Settings>(key: K, value: Settings[K]) {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  }

  function setTrack(which: TrackType, file: File | null) {
    clearBrowserStems();
    clearOutput();
    if (which === "vocal") {
      setVocal(file);
    } else {
      setInstrument(file);
    }

    setError(validateFile(file));
  }

  function setSingleFile(file: File | null) {
    clearBrowserStems();
    clearOutput();
    setSingleRecording(file);
    setError(validateFile(file));
  }

  function handlePick(which: TrackType) {
    return (event: ChangeEvent<HTMLInputElement>) => {
      setTrack(which, event.target.files?.[0] ?? null);
    };
  }

  async function produce() {
    if (!canProduce) return;
    clearBrowserStems();
    clearOutput();
    setError(null);
    setBrowserBusy(true);
    try {
      if (mode === "karaoke") {
        if (!singleRecording || !BROWSER_SEPARATION_ENABLED) throw new Error("Browser karaoke is not enabled.");
        const result = await separateBrowserAudio(singleRecording, setBrowserProgress);
        browserStemsRef.current = result;
        setBrowserStems(result);
        setBrowserProgress("Karaoke ready — audio stayed on your device.");
        return;
      }

      let voiceFile: Blob | null = mode === "separate" ? vocal : null;
      let musicFile: Blob | null = mode === "separate" ? instrument : null;
      if (mode === "single") {
        if (!singleRecording) throw new Error("Select a recording.");
        if (recordingKind === "mixed") {
          if (!BROWSER_SEPARATION_ENABLED) throw new Error("Browser separation is not enabled.");
          const stems = await separateBrowserAudio(singleRecording, setBrowserProgress);
          browserStemsRef.current = stems;
          setBrowserStems(stems);
          voiceFile = await fetch(stems.vocals).then((res) => res.blob());
          musicFile = await fetch(stems.instrumental).then((res) => res.blob());
        } else if (recordingKind === "vocals_only") {
          voiceFile = singleRecording;
        } else {
          musicFile = singleRecording;
        }
      }
      setBrowserProgress("Enhancing and mastering locally…");
      const [voice, music] = await Promise.all([
        voiceFile ? decodeFile(voiceFile) : Promise.resolve(null),
        musicFile ? decodeFile(musicFile) : Promise.resolve(null),
      ]);
      const mix = await renderBrowserMix(voice, music, settings);
      const resultUrl = URL.createObjectURL(mix);
      outputUrlRef.current = resultUrl;
      setOutputUrl(resultUrl);
      setBrowserProgress("Your WAV master is ready!");
    } catch (cause) {
      clearBrowserStems();
      clearOutput();
      setError(cause instanceof Error ? cause.message : "Audio processing failed.");
    } finally {
      setBrowserBusy(false);
    }
  }

  const ready = mode === "karaoke" ? Boolean(browserStems) : Boolean(outputUrl);
  const stageTitle = browserBusy ? "Working on your device…" :
    ready ? "Your track is ready!" : "Ready when you are!";
  const stageMessage = browserBusy ? browserProgress :
    ready ? "Preview and download your result below." :
    "Choose a mode, add a recording and create your sound.";

  return (
    <main className={styles.page}>


      <div className={styles.container}>
        <StudioHero />
        <HowItWorks />

        <div id="music-workspace" className={styles.workspaceHeading}>
          <span className={styles.eyebrow}>
            <Sparkles size={17} />
            THE CREATIVE DESK
          </span>

          <h2>
            Let’s make
            <em> something amazing.</em>
          </h2>

          <p>
            Choose your recordings, pick a vibe and hit Produce. Your studio
            session starts here.
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

              <div
                className={styles.modeSelector}
                role="group"
                aria-label="Audio mode"
              >
                <button
                  type="button"
                  aria-pressed={mode === "separate"}
                  className={
                    mode === "separate"
                      ? styles.modeActive
                      : styles.modeInactive
                  }
                  onClick={() => { clearBrowserStems(); clearOutput(); setMode("separate"); }}
                  disabled={isBusy}
                >
                  Two separate tracks
                </button>

                <button
                  type="button"
                  aria-pressed={mode === "single"}
                  className={
                    mode === "single" ? styles.modeActive : styles.modeInactive
                  }
                  onClick={() => { clearBrowserStems(); clearOutput(); setMode("single"); }}
                  disabled={isBusy}
                >
                  One recording
                </button>

                <button
                  type="button"
                  aria-pressed={mode === "karaoke"}
                  className={
                    mode === "karaoke" ? styles.modeActive : styles.modeInactive
                  }
                  onClick={() => { clearBrowserStems(); clearOutput(); setMode("karaoke"); }}
                  disabled={isBusy}
                >
                  🎤 Create Karaoke
                </button>
              </div>

              {mode === "single" || mode === "karaoke" ? (
                <div className={styles.uploadGrid}>
                  <UploadSlot
                    title={mode === "karaoke" ? "UPLOAD YOUR SONG" : "YOUR RECORDING"}
                    description={mode === "karaoke" ? "Upload a song to extract its instrumental" : "Voice, voice with guitar/keyboard, or instrumental"}
                    file={singleRecording}
                    kind={mode === "karaoke" ? "instrument" : "vocal"}
                    onChange={(event) => setSingleFile(event.target.files?.[0] ?? null)}
                    onFile={setSingleFile}
                    disabled={isBusy}
                  />
                  {mode === "single" && (
                    <label className={styles.numberLabel}>
                      What's in your recording?
                      <select
                        className={styles.numberInput}
                        value={recordingKind}
                        disabled={isBusy}
                        onChange={(event) => { clearBrowserStems(); clearOutput(); setRecordingKind(event.target.value as typeof recordingKind); }}
                      >
                        <option value="mixed">Singing + instrument (AI separation)</option>
                        <option value="vocals_only">Vocals only</option>
                        <option value="instrument_only">Instrumental only</option>
                      </select>
                    </label>
                  )}
                  {mode === "karaoke" && <p>Audio processing stays in your browser. Download a WAV instrumental; residual backing vocals may remain.</p>}
                  {requiresBrowserAI && !BROWSER_SEPARATION_ENABLED && (
                    <p className={styles.warning} role="status">
                      Browser separation preview is not enabled yet. We'll activate it after model license and mobile testing.
                    </p>
                  )}
                </div>
              ) : (
                <div className={styles.uploadGrid}>
                  <UploadSlot
                    title="YOUR VOCALS"
                    description="Your singing or voice recording"
                    file={vocal}
                    kind="vocal"
                    onChange={handlePick("vocal")}
                    onFile={(file) => setTrack("vocal", file)}
                    disabled={isBusy}
                  />

                  <UploadSlot
                    title="YOUR MUSIC"
                    description="Guitar, piano or backing track"
                    file={instrument}
                    kind="instrument"
                    onChange={handlePick("instrument")}
                    onFile={(file) => setTrack("instrument", file)}
                    disabled={isBusy}
                  />
                </div>
              )}

              <p className={styles.helpText}>
                WAV, AIFF, MP3 or M4A · Up to 25 MB each · Maximum 2 minutes per
                track. {mode === "separate" ? "Start both recordings at the same timeline position for best results." : "Upload a recording up to 2 minutes."}
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
                    onClick={() => {
                      setPreset(item.id);
                      setSettings({ ...PRESET_SETTINGS[item.id] });
                    }}
                    className={
                      preset === item.id
                        ? styles.presetActive
                        : styles.presetInactive
                    }
                  >
                    <span className={styles.presetEmoji}>{item.emoji}</span>

                    <strong>{item.name}</strong>
                    <small>{item.description}</small>

                    {preset === item.id && (
                      <CheckCircle2 size={19} className={styles.presetCheck} />
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

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  marginBottom: 12,
                }}
              >
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => {
                    setSettings({ ...PRESET_SETTINGS[preset] });
                  }}
                >
                  ↺ Reset to Preset
                </button>
              </div>
              <div className={styles.sliderGrid}>
                <Slider
                  label="Vocal clarity"
                  value={settings.clarity}
                  disabled={isBusy}
                  onChange={(value) => update("clarity", value)}
                />

                <Slider
                  label="Compression"
                  value={settings.compression}
                  disabled={isBusy}
                  onChange={(value) => update("compression", value)}
                />

                <Slider
                  label="Room reverb"
                  value={settings.reverb}
                  disabled={isBusy}
                  onChange={(value) => update("reverb", value)}
                />

                <Slider
                  label="Delay"
                  value={settings.delay}
                  disabled={isBusy}
                  onChange={(value) => update("delay", value)}
                />

                <Slider
                  label="Vocal balance"
                  value={(settings.vocal_balance + 1) / 2}
                  disabled={isBusy}
                  onChange={(value) => update("vocal_balance", value * 2 - 1)}
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

                {advanced ? "Hide advanced settings" : "Show advanced settings"}

                {advanced ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </button>

              {advanced && (
                <div className={styles.advancedPanel}>
                  <label className={styles.numberLabel}>
                    Instrument sync offset (milliseconds, positive only)
                    <input
                      type="number"
                      min={0}
                      max={500}
                      value={Math.max(0, settings.sync_offset_ms)}
                      disabled={isBusy}
                      className={styles.numberInput}
                      onChange={(event) => update("sync_offset_ms", Math.max(0, Number(event.target.value)))}
                    />
                  </label>
                  <Slider
                    label="Vocal warmth"
                    value={settings.vocal_warmth}
                    disabled={isBusy}
                    onChange={(value) => update("vocal_warmth", value)}
                  />
                  <p>Browser preview: advanced de-essing, noise reduction, stereo expansion and LUFS mastering are not yet included.</p>
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
                  {ready ? (
                    <CheckCircle2 size={39} />
                  ) : (
                    <Waves size={39} />
                  )}
                </div>

                <h2>{stageTitle}</h2>

                <p aria-live="polite" className={styles.status}>
                  {stageMessage}

                </p>

                {isBusy && (
                  <div
                    className={styles.progressTrack}
                    aria-label="Processing audio"
                  >
                    <span />
                  </div>
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
                  {isBusy ? <Waves size={21} /> : <Sparkles size={21} />}

                  {isBusy ? "PROCESSING…" : mode === "karaoke" ? "CREATE KARAOKE" : "MAKE MY MIX!"}
                  <ArrowRight size={20} />
                </button>

                <p className={styles.productionHint}>
                  Choose your files and preset, then let RangManch do its thing.
                </p>

                {browserStems && mode === "karaoke" && (
                  <div className={styles.output} aria-live="polite">
                    <h3><CheckCircle2 size={20} /> KARAOKE READY!</h3>
                    <audio controls className={styles.audioPreview} src={browserStems.instrumental} />
                    <a
                      className={styles.produceButton}
                      href={browserStems.instrumental}
                      download="rangmanch-karaoke.wav"
                    >
                      <Download size={18} /> Download instrumental WAV
                    </a>
                  </div>
                )}

                {outputUrl && mode !== "karaoke" && (
                  <div className={styles.output}>
                    <h3><CheckCircle2 size={20} /> MIX READY!</h3>
                    <audio controls className={styles.audioPreview} src={outputUrl} />
                    <a className={styles.produceButton} href={outputUrl} download="rangmanch-master.wav">
                      <Download size={18} /> Download WAV
                    </a>
                    <p>Browser DSP preview: peak-normalized WAV. Full LUFS mastering and MP3 export are not yet available.</p>
                  </div>
                )}

              </div>
            </div>

            <div className={styles.tipCard}>
              <Lightbulb size={24} />
              <div>
                <h3>STUDIO TIP!</h3>
                <p>
                  Record in a quiet room, avoid clipping, and keep both tracks
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
      className={`${styles.uploadSlot} ${
        file ? styles.uploadSelected : ""
      } ${dragging ? styles.uploadDragging : ""}`}
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
          {kind === "vocal" ? <Mic2 size={32} /> : <Music2 size={32} />}
        </span>

        <strong>{title}</strong>
        <span className={styles.uploadDescription}>{description}</span>

        <span className={styles.uploadFilename}>
          {file?.name || "Drop a file or click to browse"}
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
            if (ref.current) ref.current.value = "";
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
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
