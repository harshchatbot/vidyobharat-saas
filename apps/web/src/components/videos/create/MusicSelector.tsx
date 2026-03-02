import { Music2, Upload } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';

import type { MusicTrack } from '@/types/api';

export function MusicSelector({
  mode,
  onModeChange,
  tracks,
  tracksLoading,
  selectedTrackId,
  onTrackChange,
  uploadUrl,
  onUploadUrlChange,
  onTogglePreview,
  isPlaying,
  volume,
  onVolumeChange,
  ducking,
  onDuckingChange,
  error,
}: {
  mode: 'none' | 'library' | 'upload';
  onModeChange: (value: 'none' | 'library' | 'upload') => void;
  tracks: MusicTrack[];
  tracksLoading: boolean;
  selectedTrackId: string;
  onTrackChange: (value: string) => void;
  uploadUrl: string;
  onUploadUrlChange: (value: string) => void;
  onTogglePreview: () => void;
  isPlaying: boolean;
  volume: number;
  onVolumeChange: (value: number) => void;
  ducking: boolean;
  onDuckingChange: (value: boolean) => void;
  error: string | null;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { value: 'none', label: 'No music', description: 'Narration only.' },
          { value: 'library', label: 'Choose from library', description: 'Use built-in tracks with preview.' },
          { value: 'upload', label: 'Upload my own', description: 'Use your own hosted audio URL.' },
        ].map((option) => {
          const active = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onModeChange(option.value as 'none' | 'library' | 'upload')}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                  : 'border-border bg-bg hover:bg-elevated'
              }`}
            >
              <p className="text-sm font-semibold text-text">{option.label}</p>
              <p className="mt-1 text-sm text-muted">{option.description}</p>
            </button>
          );
        })}
      </div>

      {mode === 'library' ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">Library track</span>
            <Dropdown value={selectedTrackId} onChange={(event) => onTrackChange(event.target.value)}>
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name}
                </option>
              ))}
            </Dropdown>
          </label>
          <Button type="button" variant="secondary" onClick={onTogglePreview} disabled={tracksLoading || tracks.length === 0} className="gap-2">
            {tracksLoading ? <Spinner /> : <Music2 className="h-4 w-4" />}
            {isPlaying ? 'Stop preview' : 'Play preview'}
          </Button>
        </div>
      ) : null}

      {mode === 'upload' ? (
        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
            <Upload className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Hosted audio URL
          </span>
          <Input value={uploadUrl} onChange={(event) => onUploadUrlChange(event.target.value)} placeholder="https://example.com/your-track.mp3" />
        </label>
      ) : null}

      {mode !== 'none' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-text">Music volume</span>
            <input
              type="range"
              min={0}
              max={100}
              value={volume}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              className="w-full accent-accent"
            />
            <p className="mt-1 text-xs text-muted">{volume}%</p>
          </label>
          <label className="flex items-center justify-between rounded-[var(--radius-md)] border border-border bg-bg px-4 py-3">
            <span>
              <span className="block text-sm font-semibold text-text">Duck under narration</span>
              <span className="block text-xs text-muted">Reduce music presence while narration plays.</span>
            </span>
            <input type="checkbox" checked={ducking} onChange={(event) => onDuckingChange(event.target.checked)} className="h-4 w-4 accent-accent" />
          </label>
        </div>
      ) : null}

      {error ? <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
    </div>
  );
}
