import { Languages, Mic2, UserRound } from 'lucide-react';
import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Textarea } from '@/components/ui/Textarea';

import type { TTSLanguageOption, TTSVoiceOption } from '@/types/api';
import { AUDIO_QUALITY_OPTIONS } from './constants';
import { Spinner } from '@/components/ui/Spinner';

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
  previewLoadingKey,
  previewProvider,
  resolvedVoice,
  previewCached,
  previewLimit,
  previewError,
  previewMessage,
  translating,
  estimatedCredits,
  currentBalance,
  insufficientCredits,
  onOpenLowBalance,
  voiceCreditMap,
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
  previewLoadingKey?: string | null;
  previewProvider: string | null;
  resolvedVoice: string | null;
  previewCached: boolean;
  previewLimit: string | null;
  previewError: string | null;
  previewMessage: string | null;
  translating: boolean;
  estimatedCredits?: number;
  currentBalance?: number | null;
  insufficientCredits?: boolean;
  onOpenLowBalance?: () => void;
  voiceCreditMap?: Record<string, number>;
}) {
  const selected = voiceOptions.find((item) => item.key === voice) ?? voiceOptions[0];

  return (
    <div className="space-y-3">
      <div className="space-y-4 rounded-[24px] border border-border bg-[hsl(var(--color-bg)/0.72)] px-4 py-4 shadow-[var(--shadow-soft)]">
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
          <div className="space-y-1 text-xs leading-5 text-muted">
            <p>
              Default behavior: if no explicit speaker is chosen, <span className="font-semibold text-text">Shubh</span> is used.
            </p>
            <p>
              Current mode: one narrator voice per video render. Multi-character voice casting (Heart/Lungs/Brain in different voices) is not enabled yet.
            </p>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] xl:items-start">
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Language</span>
                <div className="relative">
                  <Dropdown
                    value={language}
                    onChange={(event) => onLanguageChange(event.target.value)}
                    disabled={translating}
                    className="bg-[hsl(var(--color-surface)/0.3)]"
                  >
                    {languageOptions.map((option) => (
                      <option key={`${option.label}-${option.code}`} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </Dropdown>
                  {translating ? (
                    <span className="pointer-events-none absolute right-3 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 text-xs font-medium text-muted">
                      <Spinner className="h-3.5 w-3.5" />
                      Translating
                    </span>
                  ) : null}
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Voice</span>
                <Dropdown value={voice} onChange={(event) => onVoiceChange(event.target.value)} className="bg-[hsl(var(--color-surface)/0.3)]">
                  {voiceOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </Dropdown>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Audio quality</span>
              <Dropdown value={String(sampleRateHz)} onChange={(event) => onSampleRateHzChange(Number(event.target.value))} className="bg-[hsl(var(--color-surface)/0.3)]">
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
          </div>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Preview text</span>
            <Textarea
              value={previewText}
              onChange={(event) => onPreviewTextChange(event.target.value)}
              rows={4}
              maxLength={280}
              className="min-h-[128px] bg-[hsl(var(--color-surface)/0.3)]"
              placeholder="Type the exact line you want to test in the selected Sarvam voice."
            />
            <span className="mt-2 block text-xs text-muted">
              Up to 280 characters per preview.{translating ? ' Translating to the selected language…' : ''}
            </span>
          </label>
        </div>
        <div className="space-y-1 text-xs leading-5 text-muted">
          {typeof estimatedCredits === 'number' ? (
            <p>
              Estimated Credits: <span className="font-medium text-text">{estimatedCredits}</span>
              {typeof currentBalance === 'number' ? (
                <>
                  {' '}· Your Balance: <span className="font-medium text-text">{currentBalance}</span>
                </>
              ) : null}
            </p>
          ) : null}
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
          {insufficientCredits ? (
            <div className="flex flex-wrap items-center gap-2 text-[hsl(var(--color-danger))]">
              <p>Insufficient credits — Top-Up or upgrade plan.</p>
              {onOpenLowBalance ? (
                <button type="button" onClick={onOpenLowBalance} className="font-semibold underline underline-offset-2">
                  See options
                </button>
              ) : null}
              <Link href="/billing" className="font-semibold underline underline-offset-2">
                Top-Up
              </Link>
              <Link href="/pricing" className="font-semibold underline underline-offset-2">
                View Plans
              </Link>
            </div>
          ) : null}
          {previewError ? <p className="text-[hsl(var(--color-danger))]">{previewError}</p> : null}
        </div>
      </div>
      <div className="rounded-[20px] border border-border bg-[hsl(var(--color-bg)/0.66)] p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Voice library</p>
            <p className="mt-1 text-sm text-muted">Select a narrator voice and preview it without leaving the composer.</p>
          </div>
          {translating ? <p className="text-xs text-muted">Updating language preview…</p> : null}
        </div>
        <div className="max-h-[24rem] overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
        {voiceOptions.map((option) => {
          const active = option.key === voice;
          return (
            <div
              key={option.key}
              onClick={() => onVoiceChange(option.key)}
              className={`rounded-[20px] border p-4 text-left transition ${
                active
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] shadow-soft'
                  : 'border-border bg-[hsl(var(--color-surface)/0.3)] hover:bg-[hsl(var(--color-elevated)/0.85)]'
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onVoiceChange(option.key);
                }
              }}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3 text-left">
                  <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.16)] text-[hsl(var(--color-accent))]">
                    <UserRound className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <p className="text-sm font-semibold text-text">{option.label}</p>
                    <p className="text-xs text-muted">{option.tone}</p>
                  </span>
                </div>
                <Button
                  type="button"
                  variant={active ? 'primary' : 'secondary'}
                  onClick={(event) => {
                    event.stopPropagation();
                    onVoiceChange(option.key);
                    onPreview(option.key);
                  }}
                  disabled={!previewText.trim() || Boolean(insufficientCredits) || Boolean(previewLoadingKey)}
                  className="w-full shrink-0 gap-2 rounded-full px-3 py-2 text-xs sm:w-auto"
                >
                  {previewLoadingKey === option.key ? (
                    <>
                      <Spinner className="h-3.5 w-3.5 border-[hsl(var(--color-accent-contrast)/0.45)] border-t-[hsl(var(--color-accent-contrast))]" />
                      Loading
                    </>
                  ) : (
                    <>
                      <Mic2 className="h-3.5 w-3.5" />
                      {previewing && active
                    ? 'Stop'
                    : `Preview · ${
                        typeof voiceCreditMap?.[option.key] === 'number'
                          ? voiceCreditMap[option.key] >= 0
                            ? voiceCreditMap[option.key] > 0
                              ? `${voiceCreditMap[option.key]} cr`
                              : 'Free'
                            : 'Estimating'
                          : 'Estimating'
                      }`}
                    </>
                  )}
                </Button>
              </div>
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
    </div>
  );
}
