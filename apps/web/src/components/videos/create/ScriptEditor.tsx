import type { RefObject } from 'react';
import { Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';

import { ScriptQualityPanel } from './ScriptQualityPanel';
import type { ScriptQualityReport } from './scriptQuality';

const VIDEO_PROMPT_MAX_CHARS = 2000;

export function ScriptEditor({
  topic,
  onTopicChange,
  topicPlaceholder,
  script,
  onScriptChange,
  scriptPlaceholder,
  onGenerate,
  onEnhance,
  loading,
  error,
  tags,
  generateCredits,
  enhanceCredits,
  qualityReport,
  scriptTextareaRef,
}: {
  topic: string;
  onTopicChange: (value: string) => void;
  topicPlaceholder: string;
  script: string;
  onScriptChange: (value: string) => void;
  scriptPlaceholder: string;
  onGenerate: () => void;
  onEnhance: () => void;
  loading: boolean;
  error: string | null;
  tags: string[];
  generateCredits?: number | null;
  enhanceCredits?: number | null;
  qualityReport: ScriptQualityReport;
  scriptTextareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const generateLabel =
    typeof generateCredits === 'number'
      ? generateCredits > 0
        ? `${script.trim() ? 'Regenerate script draft' : 'Generate script draft'} · ${generateCredits} credits`
        : `${script.trim() ? 'Regenerate script draft' : 'Generate script draft'} · Free`
      : script.trim()
        ? 'Regenerate script draft'
        : 'Generate script draft';
  const enhanceLabel =
    typeof enhanceCredits === 'number'
      ? enhanceCredits > 0
        ? `Improve script · ${enhanceCredits} credits`
        : 'Improve script · Free'
      : 'Improve script';

  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
        <label className="block">
          <div className="mb-1.5 flex items-center justify-between gap-3">
            <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Video prompt</span>
            <span className={`text-xs ${topic.length > VIDEO_PROMPT_MAX_CHARS * 0.92 ? 'text-amber-300' : 'text-muted'}`}>
              {topic.length}/{VIDEO_PROMPT_MAX_CHARS}
            </span>
          </div>
          <Input
            value={topic}
            onChange={(event) => onTopicChange(event.target.value)}
            placeholder={topicPlaceholder}
            maxLength={VIDEO_PROMPT_MAX_CHARS}
            className="bg-[hsl(var(--color-surface)/0.22)]"
          />
        </label>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button type="button" onClick={onGenerate} disabled={loading} className="gap-2 rounded-full px-4 py-2 text-xs">
            {loading ? <Spinner /> : <Wand2 className="h-4 w-4" />}
            {loading ? 'Working...' : generateLabel}
          </Button>
          <Button type="button" variant="secondary" onClick={onEnhance} disabled={loading} className="gap-2 rounded-full px-4 py-2 text-xs">
            <Wand2 className="h-4 w-4" />
            {enhanceLabel}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted">
        Generate creates a fresh replacement draft. Improve rewrites the current script to strengthen structure, pacing, cues, and CTA quality.
      </p>

      <label className="block">
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Script / voiceover</span>
        <Textarea
          ref={scriptTextareaRef}
          value={script}
          onChange={(event) => onScriptChange(event.target.value)}
          rows={11}
          className="min-h-[220px] resize-y bg-[hsl(var(--color-surface)/0.22)] leading-6"
          placeholder={scriptPlaceholder}
        />
      </label>
      {error ? <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}

      <ScriptQualityPanel report={qualityReport} onEnhance={onEnhance} loading={loading} enhanceCredits={enhanceCredits} />

      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[18px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-bg)/0.48)] px-3.5 py-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Auto tags</p>
          <p className="mt-1 text-xs text-muted">Created from your script so it is easier to search, organize, and revisit later.</p>
        </div>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
