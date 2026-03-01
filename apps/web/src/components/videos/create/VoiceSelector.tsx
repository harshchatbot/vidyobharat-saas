import { Languages, Mic2, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Textarea } from '@/components/ui/Textarea';

import type { TTSLanguageOption, TTSVoiceOption } from '@/types/api';
import { AUDIO_QUALITY_OPTIONS } from './constants';

export function VoiceSelector({
  languageOptions,
  voiceOptions,
  language,
  onLanguageChange,
  voice,
  onVoiceChange,
  sampleRateHz,
  onSampleRateHzChange,
  previewText,
  onPreviewTextChange,
  onPreview,
  previewing,
  previewProvider,
  resolvedVoice,
  previewCached,
  previewLimit,
  previewError,
  previewMessage,
  translating,
}: {
  languageOptions: TTSLanguageOption[];
  voiceOptions: TTSVoiceOption[];
  language: string;
  onLanguageChange: (value: string) => void;
  voice: string;
  onVoiceChange: (value: string) => void;
  sampleRateHz: number;
  onSampleRateHzChange: (value: number) => void;
  previewText: string;
  onPreviewTextChange: (value: string) => void;
  onPreview: (voiceKey?: string) => void;
  previewing: boolean;
  previewProvider: string | null;
  resolvedVoice: string | null;
  previewCached: boolean;
  previewLimit: string | null;
  previewError: string | null;
  previewMessage: string | null;
  translating: boolean;
}) {
  const selected = voiceOptions.find((item) => item.key === voice) ?? voiceOptions[0];

  return (
    <div className="space-y-4">
      <div className="space-y-4 rounded-[var(--radius-md)] border border-border bg-bg px-4 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge>{selected?.tone ?? 'Voice selected'}</Badge>
            <Badge>{language}</Badge>
            <Badge>Natural cadence</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Languages className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Preview any custom line before generating. Exact repeated previews are served from cache.
          </div>
        </div>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-text">Preview text</span>
            <Textarea
              value={previewText}
              onChange={(event) => onPreviewTextChange(event.target.value)}
              rows={4}
              maxLength={280}
              placeholder="Type the exact line you want to test in the selected Sarvam voice."
            />
          <span className="mt-2 block text-xs text-muted">
            Up to 280 characters per preview.{translating ? ' Translating to the selected language…' : ''}
          </span>
        </label>
        <div className="space-y-1 text-xs text-muted">
          {previewProvider ? (
            <p>
              Provider: <span className="font-medium text-text">{previewProvider}</span>
              {resolvedVoice ? (
                <>
                  {' '}· Resolved voice: <span className="font-medium text-text">{resolvedVoice}</span>
                </>
              ) : null}
              {' '}· {previewCached ? 'served from cache' : 'new synthesis'}
            </p>
          ) : null}
          {previewLimit ? <p>{previewLimit}</p> : null}
          {previewMessage ? <p className="text-[hsl(var(--color-warning))]">{previewMessage}</p> : null}
          {previewError ? <p className="text-[hsl(var(--color-danger))]">{previewError}</p> : null}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">Language</span>
          <Dropdown value={language} onChange={(event) => onLanguageChange(event.target.value)}>
            {languageOptions.map((option) => (
              <option key={`${option.label}-${option.code}`} value={option.label}>
                {option.label}
              </option>
            ))}
          </Dropdown>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">Voice</span>
          <Dropdown value={voice} onChange={(event) => onVoiceChange(event.target.value)}>
            {voiceOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Dropdown>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">Sarvam audio quality</span>
        <Dropdown value={String(sampleRateHz)} onChange={(event) => onSampleRateHzChange(Number(event.target.value))}>
          {AUDIO_QUALITY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Dropdown>
        <span className="mt-2 block text-xs text-muted">
          {AUDIO_QUALITY_OPTIONS.find((option) => option.value === sampleRateHz)?.description}
        </span>
      </label>

      <div className="max-h-[26rem] overflow-y-auto rounded-[var(--radius-md)] border border-border bg-[hsl(var(--color-bg)/0.55)] p-3">
        <div className="grid gap-3 sm:grid-cols-2">
        {voiceOptions.map((option) => {
          const active = option.key === voice;
          return (
            <div
              key={option.key}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                  : 'border-border bg-bg hover:bg-elevated'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onVoiceChange(option.key)}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.16)] text-[hsl(var(--color-accent))]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <p className="text-sm font-semibold text-text">{option.label}</p>
                    <p className="text-xs text-muted">{option.tone}</p>
                  </span>
                </button>
                <Button
                  type="button"
                  variant={active ? 'primary' : 'secondary'}
                  onClick={() => {
                    onVoiceChange(option.key);
                    onPreview(option.key);
                  }}
                  disabled={!previewText.trim()}
                  className="shrink-0 gap-2 px-3 py-2 text-xs"
                >
                  <Mic2 className="h-3.5 w-3.5" />
                  {previewing && active ? 'Stop' : 'Preview'}
                </Button>
              </div>
              <p className="text-xs text-muted">{option.tone}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--color-accent))]">
                Sarvam speaker: {option.provider_voice}
              </p>
              <p className="mt-2 text-xs text-muted">{option.description}</p>
            </div>
          );
        })}
        </div>
      </div>
    </div>
  );
}
