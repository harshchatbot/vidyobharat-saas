'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Captions, Clock3, GripVertical, Languages, Mic2, MonitorSmartphone, Sparkles, UserRound } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { MusicTrack } from '@/types/api';

type Props = {
  userId: string;
  templateKey?: string;
};

const voiceOptions = ['Aarav', 'Anaya', 'Dev', 'Mira'];
const voiceProfiles: Record<string, { tone: string; language: string }> = {
  Aarav: { tone: 'Warm male', language: 'Hindi + English' },
  Anaya: { tone: 'Bright female', language: 'Hindi + English' },
  Dev: { tone: 'Deep male', language: 'Hindi + English' },
  Mira: { tone: 'Calm female', language: 'Hindi + English' },
};

const templatePrefills: Record<string, { title: string; scriptPlaceholder: string; voice: string }> = {
  real_estate: {
    title: 'Real Estate Promo',
    scriptPlaceholder: 'Property intro, top amenities, location highlights, and CTA.',
    voice: 'Aarav',
  },
  youtube_intro: {
    title: 'YouTube Intro',
    scriptPlaceholder: 'Welcome viewers, introduce channel, mention value, ask to subscribe.',
    voice: 'Mira',
  },
};

export function CreateVideoClient({ userId, templateKey }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const musicInputRef = useRef<HTMLInputElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  const prefill = templateKey ? templatePrefills[templateKey] : undefined;

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [script, setScript] = useState('');
  const [voice, setVoice] = useState(prefill?.voice ?? 'Aarav');
  const [images, setImages] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [durationMode, setDurationMode] = useState<'auto' | 'custom'>('auto');
  const [durationSeconds, setDurationSeconds] = useState('30');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);

  const [musicMode, setMusicMode] = useState<'none' | 'library' | 'upload'>('none');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(20);
  const [duckMusic, setDuckMusic] = useState(true);
  const [musicPreviewError, setMusicPreviewError] = useState<string | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [voicePreviewing, setVoicePreviewing] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(() => images.map((file) => ({ file, url: URL.createObjectURL(file) })), [images]);
  const selectedTrack = tracks.find((item) => item.id === selectedTrackId) ?? null;
  const selectedVoiceProfile = voiceProfiles[voice];
  const selectedPreviewUrl = selectedTrack
    ? (selectedTrack.preview_url.startsWith('http://') || selectedTrack.preview_url.startsWith('https://')
      ? selectedTrack.preview_url
      : `${API_URL}${selectedTrack.preview_url}`)
    : undefined;

  useEffect(() => {
    const player = previewAudioRef.current;
    if (!player) return;
    player.pause();
    player.currentTime = 0;
    setMusicPlaying(false);
  }, [selectedPreviewUrl, musicMode]);

  const loadTracks = async () => {
    if (tracks.length > 0 || tracksLoading) return;
    setTracksLoading(true);
    try {
      const items = await api.listMusicTracks();
      setTracks(items);
      if (items.length > 0) {
        setSelectedTrackId(items[0].id);
        setMusicPreviewError(null);
      } else {
        setMusicPreviewError('No music tracks available right now.');
      }
    } finally {
      setTracksLoading(false);
    }
  };

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setImages((prev) => [...prev, ...Array.from(files)]);
  };

  const moveImage = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    setImages((prev) => {
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      if (!item) return prev;
      next.splice(toIndex, 0, item);
      return next;
    });
  };

  const submit = async () => {
    if (!script.trim()) {
      setError('Please add a script before generating.');
      return;
    }
    if (musicMode === 'library' && !selectedTrackId) {
      setError('Please select a library track.');
      return;
    }
    if (musicMode === 'upload' && !musicFile) {
      setError('Please upload a music file.');
      return;
    }
    if (durationMode === 'custom') {
      const seconds = Number(durationSeconds);
      if (!Number.isFinite(seconds) || seconds < 5 || seconds > 300) {
        setError('Custom duration must be between 5 and 300 seconds.');
        return;
      }
    }

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('script', script);
      formData.append('voice', voice);
      formData.append('aspect_ratio', aspectRatio);
      formData.append('resolution', resolution);
      formData.append('duration_mode', durationMode);
      if (durationMode === 'custom') {
        formData.append('duration_seconds', durationSeconds);
      }
      formData.append('captions_enabled', String(captionsEnabled));
      formData.append('music_mode', musicMode);
      formData.append('music_volume', String(musicVolume));
      formData.append('duck_music', String(duckMusic));
      if (musicMode === 'library') {
        formData.append('music_track_id', selectedTrackId);
      }
      if (musicMode === 'upload' && musicFile) {
        formData.append('music_file', musicFile);
      }
      images.forEach((image) => {
        formData.append('images', image);
      });

      const result = await api.createVideo(formData, userId);
      router.push(`/videos/${result.id}`);
    } catch {
      setError('Failed to create video. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const previewVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setError('Voice preview is not supported in this browser.');
      return;
    }

    if (voicePreviewing) {
      window.speechSynthesis.cancel();
      setVoicePreviewing(false);
      return;
    }

    const text = script.trim() || 'Namaste. This is a voice preview from VidyoBharat.';
    const utterance = new SpeechSynthesisUtterance(text);
    const name = voice.toLowerCase();
    utterance.lang = name === 'dev' || name === 'mira' ? 'hi-IN' : 'en-IN';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => setVoicePreviewing(false);
    utterance.onerror = () => setVoicePreviewing(false);

    setVoicePreviewing(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  const toggleMusicPreview = async () => {
    const player = previewAudioRef.current;
    if (!player) return;

    if (musicPlaying) {
      player.pause();
      player.currentTime = 0;
      setMusicPlaying(false);
      return;
    }

    setMusicPreviewError(null);
    try {
      player.currentTime = 0;
      await player.play();
      setMusicPlaying(true);
    } catch {
      setMusicPreviewError('Preview could not be played. Check track availability.');
      setMusicPlaying(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Create Video</h1>
        <p className="mt-1 text-sm text-muted">Text + images + optional music in one simple form.</p>
      </div>

      <Card>
        <p className="text-sm font-semibold text-text">Title (optional)</p>
        <Input className="mt-2" placeholder="Enter video title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Upload Images</p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            onFiles(event.dataTransfer.files);
          }}
          className={`mt-2 rounded-[var(--radius-md)] border border-dashed p-6 text-center text-sm ${
            dragActive ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)]' : 'border-border bg-bg'
          }`}
        >
          Drag & drop images here, or click to upload
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => onFiles(event.target.files)} />

        <p className="mt-3 text-xs text-muted">{images.length} image(s) selected • drag thumbnails to reorder</p>

        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {previews.map(({ file, url }, idx) => (
              <div
                key={`${file.name}-${idx}`}
                draggable
                onDragStart={() => {
                  setDragIndex(idx);
                  setDropIndex(idx);
                }}
                onDragEnter={() => setDropIndex(idx)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null) return;
                  moveImage(dragIndex, idx);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                className={`relative overflow-hidden rounded-[var(--radius-md)] border transition-all duration-200 ${
                  dragIndex === idx
                    ? 'z-10 scale-[0.98] border-[hsl(var(--color-accent))] opacity-70 shadow-soft'
                    : dropIndex === idx
                      ? 'scale-[1.02] border-[hsl(var(--color-accent))] shadow-soft'
                      : 'border-border'
                }`}
              >
                <img
                  src={url}
                  alt={file.name}
                  className={`h-20 w-full object-cover transition-transform duration-200 ${
                    dragIndex === idx ? 'scale-105' : ''
                  }`}
                />
                <span className="absolute left-1 top-1 inline-flex items-center gap-1 rounded bg-[hsl(var(--color-bg)/0.85)] px-1.5 py-0.5 text-[10px] text-muted">
                  <GripVertical className="h-3 w-3" />
                  {idx + 1}
                </span>
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute right-1 top-1 rounded bg-[hsl(var(--color-bg)/0.8)] px-1 text-xs"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer list-none">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-text">Output settings</p>
              <span className="text-xs text-muted">Advanced</span>
            </div>
          </summary>

          <div className="mt-4 grid gap-4">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Aspect ratio</p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(['9:16', '16:9', '1:1'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setAspectRatio(option)}
                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                      aspectRatio === option
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                        : 'border-border bg-bg'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Resolution</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {(['720p', '1080p'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setResolution(option)}
                    className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                      resolution === option
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                        : 'border-border bg-bg'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Duration mode</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setDurationMode('auto')}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                    durationMode === 'auto'
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                      : 'border-border bg-bg'
                  }`}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => setDurationMode('custom')}
                  className={`rounded-[var(--radius-md)] border px-3 py-2 text-sm ${
                    durationMode === 'custom'
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                      : 'border-border bg-bg'
                  }`}
                >
                  Custom
                </button>
              </div>
              {durationMode === 'custom' && (
                <Input
                  type="number"
                  min={5}
                  max={300}
                  className="mt-2"
                  value={durationSeconds}
                  onChange={(event) => setDurationSeconds(event.target.value)}
                  placeholder="Duration in seconds (5-300)"
                />
              )}
            </div>
          </div>
        </details>

        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2 text-xs text-muted">
          <MonitorSmartphone className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          <span>{aspectRatio}</span>
          <span>•</span>
          <span>{resolution}</span>
          <span>•</span>
          <Clock3 className="h-4 w-4 text-[hsl(var(--color-accent))]" />
          <span>{durationMode === 'auto' ? 'Auto duration' : `${durationSeconds || 0}s custom`}</span>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Script</p>
        <Textarea
          className="mt-2"
          rows={8}
          placeholder={prefill?.scriptPlaceholder ?? 'Write your script here...'}
          value={script}
          onChange={(event) => setScript(event.target.value)}
        />
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Voice</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Badge>Indian voices</Badge>
          <Badge>Natural tone</Badge>
          <Badge>Script synced</Badge>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {voiceOptions.map((option) => {
            const active = option === voice;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setVoice(option)}
                className={`flex items-center gap-3 rounded-[var(--radius-md)] border px-3 py-3 text-left transition ${
                  active
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                    : 'border-border bg-bg hover:bg-elevated'
                }`}
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.18)] text-text">
                  <UserRound className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-text">{option}</span>
                  <span className="block truncate text-xs text-muted">{voiceProfiles[option]?.tone ?? 'Balanced'} • {voiceProfiles[option]?.language ?? 'Hindi + English'}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
          <Dropdown value={voice} onChange={(event) => setVoice(event.target.value)}>
            {voiceOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Dropdown>
          <Button variant="secondary" type="button" onClick={previewVoice} className="gap-2">
            <Mic2 className="h-4 w-4" />
            {voicePreviewing ? 'Stop preview' : 'Preview voice'}
          </Button>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-bg px-3 py-2">
          <div className="flex items-center gap-2 text-xs text-muted">
            <Languages className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            <span>{selectedVoiceProfile?.language ?? 'Hindi + English'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted">
            <Sparkles className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            <span>{selectedVoiceProfile?.tone ?? 'Balanced'}</span>
          </div>
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Captions</p>
        <label className="mt-2 inline-flex items-center gap-2 text-sm text-text">
          <input
            type="checkbox"
            checked={captionsEnabled}
            onChange={(event) => setCaptionsEnabled(event.target.checked)}
          />
          Burn-in captions from script
        </label>
        <div className="mt-2 inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-2 py-1 text-xs text-muted">
          <Captions className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
          One simple subtitle style
        </div>
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Background music</p>

        <div className="mt-3 space-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="music-mode"
              checked={musicMode === 'library'}
              onChange={async () => {
                setMusicMode('library');
                await loadTracks();
              }}
            />
            Choose from library
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="music-mode" checked={musicMode === 'upload'} onChange={() => setMusicMode('upload')} />
            Upload my own
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="music-mode"
              checked={musicMode === 'none'}
              onChange={() => {
                setMusicMode('none');
                if (previewAudioRef.current) {
                  previewAudioRef.current.pause();
                  previewAudioRef.current.currentTime = 0;
                }
                setMusicPlaying(false);
              }}
            />
            No music
          </label>
        </div>

        {musicMode === 'library' && (
          <div className="mt-3 space-y-2">
            {tracksLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted"><Spinner /> Loading tracks...</div>
            ) : (
              <>
                <Dropdown value={selectedTrackId} onChange={(event) => setSelectedTrackId(event.target.value)}>
                  {tracks.map((track) => (
                    <option key={track.id} value={track.id}>{track.name}</option>
                  ))}
                </Dropdown>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={toggleMusicPreview}
                    disabled={!selectedTrack}
                  >
                    {musicPlaying ? 'Stop preview' : 'Play preview'}
                  </Button>
                  <audio
                    ref={previewAudioRef}
                    src={selectedPreviewUrl}
                    preload="none"
                    onError={() => setMusicPreviewError('Preview could not be loaded.')}
                    onEnded={() => setMusicPlaying(false)}
                  />
                </div>
                {musicPreviewError && <p className="text-xs text-[hsl(var(--color-danger))]">{musicPreviewError}</p>}
              </>
            )}
          </div>
        )}

        {musicMode === 'upload' && (
          <div className="mt-3">
            <input
              ref={musicInputRef}
              type="file"
              accept="audio/mpeg,audio/wav,audio/mp4,audio/x-m4a"
              onChange={(event) => setMusicFile(event.target.files?.[0] ?? null)}
            />
            <p className="mt-1 text-xs text-muted">{musicFile ? musicFile.name : 'No file selected'}</p>
          </div>
        )}

        {musicMode !== 'none' && (
          <>
            <div className="mt-4">
              <label className="text-sm text-muted" htmlFor="music-volume">Music volume: {musicVolume}</label>
              <input
                id="music-volume"
                type="range"
                min={0}
                max={100}
                value={musicVolume}
                onChange={(event) => setMusicVolume(Number(event.target.value))}
                className="mt-1 w-full"
              />
            </div>

            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={duckMusic} onChange={(event) => setDuckMusic(event.target.checked)} />
              Duck music under voice
            </label>
          </>
        )}
      </Card>

      <Card>
        <Button onClick={submit} disabled={submitting}>{submitting ? 'Generating...' : 'Generate Video'}</Button>
        {error && <p className="mt-2 text-sm text-[hsl(var(--color-danger))]">{error}</p>}
      </Card>
    </div>
  );
}
