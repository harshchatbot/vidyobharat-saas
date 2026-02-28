import { Languages, Mic2, UserRound } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';

import { LANGUAGE_OPTIONS, VOICE_OPTIONS } from './constants';

export function VoiceSelector({
  language,
  onLanguageChange,
  voice,
  onVoiceChange,
  onPreview,
  previewing,
}: {
  language: string;
  onLanguageChange: (value: string) => void;
  voice: string;
  onVoiceChange: (value: string) => void;
  onPreview: () => void;
  previewing: boolean;
}) {
  const selected = VOICE_OPTIONS.find((item) => item.key === voice) ?? VOICE_OPTIONS[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">Language</span>
          <Dropdown value={language} onChange={(event) => onLanguageChange(event.target.value)}>
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Dropdown>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">Voice</span>
          <Dropdown value={voice} onChange={(event) => onVoiceChange(event.target.value)}>
            {VOICE_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </Dropdown>
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {VOICE_OPTIONS.map((option) => {
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
              <p className="mt-2 text-xs text-muted">{option.description}</p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-bg px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Badge>{selected.tone}</Badge>
            <Badge>{language}</Badge>
            <Badge>Natural cadence</Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <Languages className="h-4 w-4 text-[hsl(var(--color-accent))]" />
            Voice previews use browser speech synthesis as a local approximation.
          </div>
        </div>
        <Button type="button" variant="secondary" onClick={onPreview} className="gap-2 self-start sm:self-auto">
          <Mic2 className="h-4 w-4" />
          {previewing ? 'Stop preview' : 'Preview voice'}
        </Button>
      </div>
    </div>
  );
}
