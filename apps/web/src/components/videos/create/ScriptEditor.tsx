import { Wand2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';

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
}) {
  const generateLabel =
    typeof generateCredits === 'number'
      ? generateCredits > 0
        ? `Generate Script · ${generateCredits} credits`
        : 'Generate Script · Free'
      : 'Generate Script';
  const enhanceLabel =
    typeof enhanceCredits === 'number'
      ? enhanceCredits > 0
        ? `Enhance Script · ${enhanceCredits} credits`
        : 'Enhance Script · Free'
      : 'Enhance Script';

  return (
    <div className="space-y-3">
      <div className="rounded-[24px] border border-border bg-[hsl(var(--color-bg)/0.72)] px-4 py-4 shadow-[var(--shadow-soft)]">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Topic</span>
            <Input
              value={topic}
              onChange={(event) => onTopicChange(event.target.value)}
              placeholder={topicPlaceholder}
              maxLength={300}
              className="bg-[hsl(var(--color-surface)/0.3)]"
            />
          </label>
          <div className="flex flex-wrap gap-2">
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

        <label className="mt-4 block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Script</span>
          <Textarea
            value={script}
            onChange={(event) => onScriptChange(event.target.value)}
            rows={11}
            className="min-h-[220px] resize-y bg-[hsl(var(--color-surface)/0.3)] leading-6"
            placeholder={scriptPlaceholder}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
      </div>

      <div className="space-y-2 rounded-[20px] border border-border bg-[hsl(var(--color-bg)/0.66)] px-4 py-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Auto tags</p>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Tags are generated from your script for better search and organization.</p>
        )}
      </div>
    </div>
  );
}
