import { Languages, Mic2, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Textarea } from '@/components/ui/Textarea';

import type { TTSLanguageOption, TTSVoiceOption } from '@/types/api';

export function VoiceSelector({
  languageOptions,
  voiceOptions,
  language,
  onLanguageChange,
  voice,
  onVoiceChange,
  previewText,
  onPreviewTextChange,
  onPreview,
  previewing,
  previewProvider,
  resolvedVoice,
  previewCached,
  previewLimit,
  previewError,
}: {
  languageOptions: TTSLanguageOption[];
  voiceOptions: TTSVoiceOption[];
  language: string;
  onLanguageChange: (value: string) => void;
  voice: string;
  onVoiceChange: (value: string) => void;
  previewText: string;
  onPreviewTextChange: (value: string) => void;
  onPreview: () => void;
  previewing: boolean;
  previewProvider: string | null;
  resolvedVoice: string | null;
  previewCached: boolean;
  previewLimit: string | null;
  previewError: string | null;
}) {
  const selected = voiceOptions.find((item) => item.key === voice) ?? voiceOptions[0];

  return (
    <div className="space-y-4">
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

      <div className="grid gap-3 sm:grid-cols-2">
        {voiceOptions.map((option) => {
          const active = option.key === voice;
          return (
            <button
              key={option.key}
              type="button"
              onClick={() => onVoiceChange(option.key)}
              className={`rounded-[var(--radius-lg)] border p-4 text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                  : 'border-border bg-bg hover:bg-elevated'
              }`}
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.16)] text-[hsl(var(--color-accent))]">
                <UserRound className="h-5 w-5" />
              </span>
              <p className="mt-4 text-sm font-semibold text-text">{option.label}</p>
              <p className="text-xs text-muted">{option.tone}</p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[hsl(var(--color-accent))]">
                Sarvam speaker: {option.provider_voice}
              </p>
              <p className="mt-2 text-xs text-muted">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="space-y-4 rounded-[var(--radius-md)] border border-border bg-bg px-4 py-4">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge>{selected?.tone ?? 'Voice selected'}</Badge>
            <Badge>{language}</Badge>
            <Badge>Natural cadence</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Languages className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Voice previews use the active backend TTS provider for a more accurate sample.
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-text">Preview text</span>
            <Textarea
              value={previewText}
              onChange={(event) => onPreviewTextChange(event.target.value)}
              rows={4}
              maxLength={280}
              placeholder="Type the exact line you want to test in the selected Sarvam voice."
            />
            <span className="mt-2 block text-xs text-muted">Up to 280 characters per preview.</span>
          </label>
          <Button type="button" variant="secondary" onClick={onPreview} className="gap-2 self-start lg:self-auto" disabled={!previewText.trim()}>
            <Mic2 className="h-4 w-4" />
            {previewing ? 'Stop preview' : 'Preview voice'}
          </Button>
        </div>
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
          {previewError ? <p className="text-[hsl(var(--color-danger))]">{previewError}</p> : null}
        </div>
      </div>
    </div>
  );
}
