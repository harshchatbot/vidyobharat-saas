import { Captions, Clock3, Info } from 'lucide-react';

import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';

import { ASPECT_OPTIONS, CAPTION_STYLE_OPTIONS, DURATION_OPTIONS, RESOLUTION_OPTIONS } from './constants';

export function OutputSettings({
  aspectRatio,
  onAspectRatioChange,
  resolution,
  onResolutionChange,
  durationMode,
  onDurationModeChange,
  durationSeconds,
  onDurationSecondsChange,
  captionsEnabled,
  onCaptionsEnabledChange,
  captionStyle,
  onCaptionStyleChange,
  durationError,
}: {
  aspectRatio: string;
  onAspectRatioChange: (value: '9:16' | '16:9' | '1:1') => void;
  resolution: string;
  onResolutionChange: (value: '720p' | '1080p') => void;
  durationMode: 'auto' | 'custom';
  onDurationModeChange: (value: 'auto' | 'custom') => void;
  durationSeconds: string;
  onDurationSecondsChange: (value: string) => void;
  captionsEnabled: boolean;
  onCaptionsEnabledChange: (value: boolean) => void;
  captionStyle: string;
  onCaptionStyleChange: (value: string) => void;
  durationError: string | null;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 2xl:grid-cols-3">
        <div>
          <p className="mb-2 text-sm font-semibold text-text">Aspect ratio</p>
          <div className="space-y-2">
            {ASPECT_OPTIONS.map((option) => {
              const active = option.value === aspectRatio;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onAspectRatioChange(option.value)}
                  className={`w-full rounded-[var(--radius-md)] border px-4 py-3 text-left ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                      : 'border-border bg-bg hover:bg-elevated'
                  }`}
                >
                  <span className="block text-sm font-semibold text-text">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-text">Resolution</p>
          <div className="space-y-2">
            {RESOLUTION_OPTIONS.map((option) => {
              const active = option.value === resolution;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => onResolutionChange(option.value)}
                  className={`w-full rounded-[var(--radius-md)] border px-4 py-3 text-left ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                      : 'border-border bg-bg hover:bg-elevated'
                  }`}
                >
                  <span className="block text-sm font-semibold text-text">{option.label}</span>
                  <span className="mt-1 block text-xs text-muted">{option.description}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-text">Duration</p>
            <div className="space-y-2">
              {DURATION_OPTIONS.map((option) => {
                const active = option.value === durationMode;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onDurationModeChange(option.value)}
                    className={`w-full rounded-[var(--radius-md)] border px-4 py-3 text-left ${
                      active
                        ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)]'
                        : 'border-border bg-bg hover:bg-elevated'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-text">{option.label}</span>
                    <span className="mt-1 block text-xs text-muted">{option.description}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {durationMode === 'custom' ? (
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
                <Clock3 className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Custom duration (seconds)
              </span>
              <Input type="number" min={5} max={300} value={durationSeconds} onChange={(event) => onDurationSecondsChange(event.target.value)} />
              {durationError ? <p className="mt-1 text-sm text-[hsl(var(--color-danger))]">{durationError}</p> : null}
            </label>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <label className="flex items-start justify-between gap-4 rounded-[var(--radius-md)] border border-border bg-bg px-4 py-3">
          <span>
            <span className="flex items-center gap-2 text-sm font-semibold text-text">
              <Captions className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              Enable captions (burned-in)
            </span>
            <span className="mt-1 block text-xs text-muted">Captions improve watchability on mute and keep short-form pacing clear.</span>
          </span>
          <input type="checkbox" checked={captionsEnabled} onChange={(event) => onCaptionsEnabledChange(event.target.checked)} className="mt-1 h-4 w-4 accent-accent" />
        </label>

        <label className="block">
          <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
            Caption style
            <span title="This is stored with the job for future styling support.">
              <Info className="h-4 w-4 text-muted" />
            </span>
          </span>
          <Dropdown value={captionStyle} onChange={(event) => onCaptionStyleChange(event.target.value)}>
            {CAPTION_STYLE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Dropdown>
        </label>
      </div>
    </div>
  );
}
