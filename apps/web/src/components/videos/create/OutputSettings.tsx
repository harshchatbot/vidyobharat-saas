import { Captions, Clock3, Info } from 'lucide-react';

import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';

import { CAPTION_STYLE_OPTIONS, VIDEO_QUALITY_OPTIONS } from './constants';

export function OutputSettings({
  modelLabel,
  aspectRatio,
  onAspectRatioChange,
  availableAspectRatios,
  selectedAspectDescription,
  resolution,
  onResolutionChange,
  availableResolutions,
  resolutionDisplayOptions,
  selectedResolutionDimensions,
  quality,
  onQualityChange,
  durationSeconds,
  onDurationSecondsChange,
  availableDurations,
  supportsCustomDuration,
  minDuration,
  maxDuration,
  durationHelperText,
  durationError,
  captionsEnabled,
  onCaptionsEnabledChange,
  captionStyle,
  onCaptionStyleChange,
}: {
  modelLabel: string;
  aspectRatio: string;
  availableAspectRatios: Array<{ value: '9:16' | '16:9' | '1:1'; label: string; description: string }>;
  selectedAspectDescription: string;
  onAspectRatioChange: (value: '9:16' | '16:9' | '1:1') => void;
  resolution: string;
  onResolutionChange: (value: '720p' | '1080p') => void;
  availableResolutions: Array<{ value: '720p' | '1080p'; label: string; description: string }>;
  resolutionDisplayOptions: ReadonlyArray<{ value: string; label: string; description: string }>;
  selectedResolutionDimensions: string;
  quality: 'standard' | 'high';
  onQualityChange: (value: 'standard' | 'high') => void;
  durationSeconds: string;
  onDurationSecondsChange: (value: string) => void;
  availableDurations: number[];
  supportsCustomDuration: boolean;
  minDuration?: number;
  maxDuration?: number;
  durationHelperText: string;
  durationError: string | null;
  captionsEnabled: boolean;
  onCaptionsEnabledChange: (value: boolean) => void;
  captionStyle: string;
  onCaptionStyleChange: (value: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-[24px] border border-border bg-bg px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-text">Output</p>
            <p className="mt-1 text-xs text-muted">
              {aspectRatio} • {selectedResolutionDimensions} • {VIDEO_QUALITY_OPTIONS.find((option) => option.value === quality)?.label ?? 'Standard'}
            </p>
          </div>
          <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.45)] px-3 py-1 text-xs font-semibold text-text">
            {modelLabel}
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-text">Aspect ratio</p>
          <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
            <div className="flex flex-wrap gap-2">
              {availableAspectRatios.map((option) => {
                const active = option.value === aspectRatio;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onAspectRatioChange(option.value)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                        : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                    }`}
                    title={`${option.label} · ${option.description}`}
                  >
                    {option.value}
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted">{selectedAspectDescription}</p>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-text">Resolution</p>
          <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
            <div className="flex flex-wrap gap-2">
              {resolutionDisplayOptions.map((option) => {
                const selectable = availableResolutions.some((item) => item.value === option.value);
                const active = option.value === resolution;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      if (selectable) onResolutionChange(option.value as '720p' | '1080p');
                    }}
                    disabled={!selectable}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      active && selectable
                        ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                        : selectable
                          ? 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                          : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.45)] text-muted opacity-60'
                    }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-text">Quality</p>
          <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
            <div className="flex flex-wrap gap-2">
              {VIDEO_QUALITY_OPTIONS.map((option) => {
                const active = option.value === quality;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onQualityChange(option.value)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                        : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                    }`}
                    title={option.description}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-semibold text-text">Duration</p>
          <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
            <div className="flex flex-wrap gap-2">
              {availableDurations.map((seconds) => {
                const active = Number(durationSeconds) === seconds;
                return (
                  <button
                    key={seconds}
                    type="button"
                    onClick={() => onDurationSecondsChange(String(seconds))}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                        : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                    }`}
                  >
                    {seconds}s
                  </button>
                );
              })}
            </div>
          </div>
          <p className="text-xs text-muted">{durationHelperText}</p>
          {supportsCustomDuration ? (
            <label className="block">
              <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text">
                <Clock3 className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                Custom duration (seconds)
              </span>
              <Input
                type="number"
                min={minDuration}
                max={maxDuration}
                value={durationSeconds}
                onChange={(event) => onDurationSecondsChange(event.target.value)}
              />
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
