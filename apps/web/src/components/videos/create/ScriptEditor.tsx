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
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-text">Topic</span>
          <Input value={topic} onChange={(event) => onTopicChange(event.target.value)} placeholder={topicPlaceholder} maxLength={300} />
        </label>
        <div className="rounded-[var(--radius-md)] border border-border bg-bg px-4 py-3 text-sm text-muted">
          Generate a first draft from the chosen content direction, then refine it without leaving the page.
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-text">Script</span>
        <Textarea
          value={script}
          onChange={(event) => onScriptChange(event.target.value)}
          rows={12}
          className="min-h-[240px] resize-y"
          placeholder={scriptPlaceholder}
        />
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onGenerate} disabled={loading} className="gap-2">
          {loading ? <Spinner /> : <Wand2 className="h-4 w-4" />}
          {loading ? 'Working...' : 'Generate Script'}
        </Button>
        <Button type="button" variant="secondary" onClick={onEnhance} disabled={loading} className="gap-2">
          <Wand2 className="h-4 w-4" />
          Enhance Script
        </Button>
        {error ? <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p> : null}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold text-text">Auto tags</p>
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
