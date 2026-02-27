'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
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

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('script', script);
      formData.append('voice', voice);
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

        <p className="mt-3 text-xs text-muted">{images.length} image(s) selected</p>

        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {previews.map(({ file, url }, idx) => (
              <div key={`${file.name}-${idx}`} className="relative overflow-hidden rounded-[var(--radius-md)] border border-border">
                <img src={url} alt={file.name} className="h-20 w-full object-cover" />
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
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Dropdown value={voice} onChange={(event) => setVoice(event.target.value)}>
            {voiceOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Dropdown>
          <Button variant="secondary" type="button" onClick={previewVoice}>
            {voicePreviewing ? 'Stop preview' : 'Preview voice'}
          </Button>
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
