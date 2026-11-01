'use client';

import { ChangeEvent, DragEvent, useEffect, useMemo, useState } from 'react';
import Script from 'next/script';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Download, Music2, SlidersHorizontal, Sparkles, Upload, Waves } from 'lucide-react';
import { API_URL } from '@/lib/env';
import styles from './music-studio.module.css';

type Mode = 'separate' | 'single';
type Job = { id: string; status: 'queued' | 'processing' | 'completed' | 'failed'; stage: string; error?: string | null; measurements?: { integrated_lufs: number; true_peak_dbtp: number }; downloads?: Record<string, string> };
const MAX_BYTES = 100 * 1024 * 1024;
const supported = new Set(['audio/wav', 'audio/x-wav', 'audio/aiff', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a']);
const turnstileSiteKey = process.env.NEXT_PUBLIC_MUSIC_STUDIO_TURNSTILE_SITE_KEY;

declare global { interface Window { turnstile?: { render: (element: string, options: { sitekey: string; callback: (token: string) => void; 'expired-callback': () => void }) => void }; } }

function fileError(file: File | null) {
  if (!file) return null;
  if (file.size > MAX_BYTES) return 'Each file must be 100 MB or smaller.';
  if (file.type && !supported.has(file.type)) return 'Use WAV, AIFF, MP3, or M4A audio.';
  return null;
}

export function MusicStudioClient() {
  const [mode, setMode] = useState<Mode>('separate');
  const [vocal, setVocal] = useState<File | null>(null);
  const [instrument, setInstrument] = useState<File | null>(null);
  const [preset, setPreset] = useState('acoustic');
  const [advanced, setAdvanced] = useState(false);
  const [settings, setSettings] = useState({ clarity: .55, compression: .35, reverb: .18, delay: 0, vocal_balance: 0, sync_offset_ms: 0, sidechain: false, de_esser: .25, vocal_warmth: .2, instrumental_width: .5, noise_reduction: 0 });
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const reducedMotion = useReducedMotion();
  const inputError = fileError(vocal) || fileError(instrument);
  const canProduce = mode === 'separate' && Boolean(vocal && instrument) && !inputError && job?.status !== 'processing';
  const update = (key: keyof typeof settings, value: number | boolean) => setSettings((old) => ({ ...old, [key]: value }));
  const jobDownloadUrl = (value?: string) => value ? `${API_URL}${value}` : undefined;

  useEffect(() => {
    if (!turnstileSiteKey || !window.turnstile) return;
    window.turnstile.render('music-studio-turnstile', { sitekey: turnstileSiteKey, callback: setTurnstileToken, 'expired-callback': () => setTurnstileToken(null) });
  }, []);

  useEffect(() => {
    if (!job || !['queued', 'processing'].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API_URL}/api/music-studio/jobs/${job.id}`, { credentials: 'include' });
        const next = await response.json() as Job;
        if (!response.ok) throw new Error(next.error || 'Could not retrieve job status.');
        setJob(next);
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not retrieve job status.'); }
    }, 1500);
    return () => window.clearInterval(timer);
  }, [job]);

  useEffect(() => {
    if (!job || !['queued', 'processing'].includes(job.status)) { setElapsedSeconds(0); return; }
    const origin = startedAt ?? Date.now();
    if (!startedAt) setStartedAt(origin);
    const timer = window.setInterval(() => setElapsedSeconds(Math.floor((Date.now() - origin) / 1000)), 1000);
    return () => window.clearInterval(timer);
  }, [job, startedAt]);

  async function produce() {
    if (!vocal || !instrument || !canProduce) return;
    setError(null); setStartedAt(Date.now()); setJob({ id: '', status: 'queued', stage: 'uploading' });
    try {
      const body = new FormData(); body.set('vocal', vocal); body.set('instrument', instrument); body.set('settings', JSON.stringify({ preset, ...settings })); if (turnstileToken) body.set('turnstile_token', turnstileToken);
      const response = await fetch(`${API_URL}/api/music-studio/jobs`, { method: 'POST', body, credentials: 'include' });
      const created = await response.json() as Job | { detail?: { message?: string } };
      if (!response.ok) throw new Error('detail' in created ? created.detail?.message || 'Production could not start.' : 'Production could not start.');
      setJob(created as Job);
    } catch (cause) { setJob(null); setError(cause instanceof Error ? cause.message : 'Production could not start.'); }
  }

  const statusCopy = useMemo(() => {
    if (!job) return 'Your source files stay private and are processed only after you click Produce.';
    if (job.status === 'completed') return 'Master complete — verified after export.';
    if (job.status === 'failed') return job.error || 'Production failed. Adjust the source files and retry.';
    return job.stage === 'uploading' ? 'Uploading source tracks…' : 'Validating, mixing and mastering your tracks…';
  }, [job]);
  const setTrack = (which: 'vocal' | 'instrument', selected: File | null) => { if (which === 'vocal') setVocal(selected); else setInstrument(selected); setJob(null); setError(fileError(selected)); };
  const pick = (which: 'vocal' | 'instrument') => (event: ChangeEvent<HTMLInputElement>) => setTrack(which, event.target.files?.[0] ?? null);
  const stageLabel = job?.stage === 'uploading' ? 'Uploading files' : job?.stage === 'validating_recordings' ? 'Validating recordings' : job?.stage === 'processing_mix_master_export' ? 'Processing, mixing and exporting' : job?.status === 'completed' ? 'Completed' : 'Ready to produce';

  return <main className={`${styles.page} mx-auto w-full max-w-6xl px-4 py-7 sm:px-8`}>
    {turnstileSiteKey ? <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={() => { if (window.turnstile) window.turnstile.render('music-studio-turnstile', { sitekey: turnstileSiteKey, callback: setTurnstileToken, 'expired-callback': () => setTurnstileToken(null) }); }} /> : null}
    <section className={styles.hero}><div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><p className={styles.eyebrow}><Waves className="h-4 w-4" /> Rangmanch Production Suite</p><h1 className={styles.heroTitle}>Music Studio</h1><p className={styles.heroDescription}>Shape a vocal and instrumental recording into a natural, polished master — without flattening the performance.</p></div><div className={styles.formatBadge}><span>48 kHz stereo</span><br />Two-pass loudness master</div></div></section>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
      <section className="space-y-6"><div className={styles.card}><h2 className={styles.sectionTitle}>1. Source recordings</h2><div className={styles.modeSelector} role="tablist" aria-label="Audio input mode"><button type="button" role="tab" aria-selected={mode === 'separate'} onClick={() => setMode('separate')} className={mode === 'separate' ? styles.modeActive : styles.modeInactive}>Separate tracks</button><button type="button" role="tab" aria-selected={mode === 'single'} onClick={() => setMode('single')} className={mode === 'single' ? styles.modeActive : styles.modeInactive}>One recording</button></div>{mode === 'single' ? <div className={styles.warning}><strong>Experimental separation is unavailable.</strong><br />To protect fidelity, Music Studio will not pretend a combined recording has been separated. Please upload your vocal and instrumental tracks instead.</div> : <div className="mt-5 grid gap-3 sm:grid-cols-2"><UploadSlot title="Vocal track" file={vocal} onChange={pick('vocal')} onFile={(file) => setTrack('vocal', file)} /><UploadSlot title="Guitar / instrumental" file={instrument} onChange={pick('instrument')} onFile={(file) => setTrack('instrument', file)} /></div>}<p className={styles.helpText}>WAV, AIFF, MP3 or M4A · up to 100 MB per file · tracks share a timeline origin unless you set an offset.</p></div>
      <div className={styles.card}><div className="flex items-center justify-between gap-3"><h2 className={styles.sectionTitle}>2. Studio character</h2><Music2 className={styles.sectionIcon} /></div><div className="mt-4 grid gap-2 sm:grid-cols-3">{[['acoustic', 'Acoustic'], ['sufi', 'Sufi / Ghazal'], ['clean_studio', 'Clean Studio']].map(([id, label]) => <button key={id} type="button" onClick={() => setPreset(id)} className={preset === id ? styles.presetActive : styles.presetInactive}><Sparkles className="mb-2 h-4 w-4" />{label}</button>)}</div><div className="mt-6 grid gap-x-6 gap-y-5 sm:grid-cols-2"><Slider label="Vocal clarity" value={settings.clarity} onChange={(value) => update('clarity', value)} /><Slider label="Compression" value={settings.compression} onChange={(value) => update('compression', value)} /><Slider label="Room reverb" value={settings.reverb} onChange={(value) => update('reverb', value)} /><Slider label="Delay" value={settings.delay} onChange={(value) => update('delay', value)} /><Slider label="Vocal balance" value={(settings.vocal_balance + 1) / 2} onChange={(value) => update('vocal_balance', value * 2 - 1)} /></div><button type="button" onClick={() => setAdvanced(!advanced)} className={styles.advancedToggle}><SlidersHorizontal className="h-4 w-4" />{advanced ? 'Hide' : 'Show'} advanced settings</button>{advanced && <div className={styles.advancedPanel}><label className={styles.numberLabel}>Manual sync offset (ms)<input type="number" min="-10000" max="10000" value={settings.sync_offset_ms} onChange={(event) => update('sync_offset_ms', Number(event.target.value))} className={styles.numberInput} /></label><label className={styles.checkboxLabel}><input type="checkbox" checked={settings.sidechain} onChange={(event) => update('sidechain', event.target.checked)} /> Gentle vocal ducking</label><Slider label="De-esser" value={settings.de_esser} onChange={(value) => update('de_esser', value)} /><Slider label="Vocal warmth" value={settings.vocal_warmth} onChange={(value) => update('vocal_warmth', value)} /><Slider label="Instrumental width" value={settings.instrumental_width} onChange={(value) => update('instrumental_width', value)} /><Slider label="Gentle noise reduction" value={settings.noise_reduction} onChange={(value) => update('noise_reduction', value)} /></div>}</div></section>
      <aside className={`${styles.card} ${styles.productionDesk}`}><p className={styles.eyebrow}>Production desk</p><h2 className="mt-2 text-xl font-semibold text-text">{stageLabel}</h2><p aria-live="polite" className={`${styles.status} ${job?.status === 'completed' ? styles.statusSuccess : job?.status === 'failed' ? styles.statusError : ''}`}>{statusCopy}{job && ['queued', 'processing'].includes(job.status) ? ` · ${elapsedSeconds}s elapsed` : ''}</p>{turnstileSiteKey ? <div id="music-studio-turnstile" className="mt-4" /> : null}{error && <p role="alert" className={styles.error}>{error}</p>}<button type="button" disabled={!canProduce || Boolean(turnstileSiteKey && !turnstileToken)} onClick={produce} className={styles.produceButton}><Sparkles className="h-4 w-4" />{job?.status === 'processing' || job?.stage === 'uploading' ? 'Producing…' : 'Produce My Master'}</button><AnimatePresence mode="wait">{job?.status === 'completed' && <motion.div initial={reducedMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className={styles.output}><audio controls crossOrigin="use-credentials" className={styles.audioPreview} src={jobDownloadUrl(job.downloads?.wav)} /><p className={styles.measurements}>Measured: {job.measurements?.integrated_lufs.toFixed(1)} LUFS · {job.measurements?.true_peak_dbtp.toFixed(1)} dBTP</p><div className="grid grid-cols-2 gap-2">{['wav', 'mp3'].map((kind) => <a key={kind} href={jobDownloadUrl(job.downloads?.[kind])} className={styles.download}><Download className="h-4 w-4" />{kind.toUpperCase()}</a>)}</div></motion.div>}</AnimatePresence></aside>
    </div>
  </main>;
}

function UploadSlot({ title, file, onChange, onFile }: { title: string; file: File | null; onChange: (event: ChangeEvent<HTMLInputElement>) => void; onFile: (file: File | null) => void }) { const drop = (event: DragEvent<HTMLLabelElement>) => { event.preventDefault(); onFile(event.dataTransfer.files?.[0] ?? null); }; return <label onDragOver={(event) => event.preventDefault()} onDrop={drop} className={`${styles.uploadSlot} ${file ? styles.uploadSlotSelected : ''}`}><Upload className="mb-3 h-5 w-5" /><span className={styles.uploadTitle}>{title}</span><span className={styles.uploadFile}>{file?.name || 'Drop audio here or choose a file'}</span>{file ? <button type="button" className={styles.removeFile} onClick={(event) => { event.preventDefault(); onFile(null); }}>Remove</button> : null}<input className="sr-only" type="file" accept="audio/wav,audio/aiff,audio/mpeg,audio/mp4,.wav,.aif,.aiff,.mp3,.m4a" onChange={onChange} /></label>; }
function Slider({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className={styles.sliderLabel}><span className="flex justify-between gap-3"><span>{label}</span><span className={styles.sliderValue}>{Math.round(value * 100)}%</span></span><input aria-label={label} className={styles.slider} type="range" min="0" max="1" step=".01" value={value} onChange={(event) => onChange(Number(event.target.value))} /></label>; }
