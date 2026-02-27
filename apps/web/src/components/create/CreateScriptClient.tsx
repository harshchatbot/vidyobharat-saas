'use client';

import { useRouter } from 'next/navigation';

import { CreateFlowShell } from '@/components/create/CreateFlowShell';
import { useCreateDraft } from '@/components/create/useCreateDraft';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';

const quickSuggestions = [
  'Add a stronger opening hook for Indian SMB founders.',
  'Insert one localized CTA line in Hindi.',
  'Shorten this paragraph for 30-second format.',
];

export function CreateScriptClient() {
  const router = useRouter();
  const { draft, update } = useCreateDraft();

  return (
    <CreateFlowShell
      step={3}
      title="Write your script"
      subtitle="Add your content, pick language/voice, and continue to brand customization."
    >
      <div className="grid gap-4">
        <Textarea
          rows={12}
          placeholder="Paste or write your video script here..."
          value={draft.script}
          onChange={(event) => update({ script: event.target.value })}
        />
        <Card className="bg-bg">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Grammar Assist (Placeholder)</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {quickSuggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                className="rounded-[var(--radius-md)] border border-border px-3 py-1 text-xs text-text"
                onClick={() => update({ script: `${draft.script.trim()}\n${suggestion}`.trim() })}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={draft.language} onChange={(event) => update({ language: event.target.value })}>
            <option value="hi-IN">Hindi</option>
            <option value="ta-IN">Tamil</option>
            <option value="bn-IN">Bengali</option>
            <option value="en-IN">English (India)</option>
          </Select>
          <Select value={draft.voice} onChange={(event) => update({ voice: event.target.value })}>
            <option value="Aarav">Aarav (Male)</option>
            <option value="Anaya">Anaya (Female)</option>
            <option value="Dev">Dev (Male)</option>
            <option value="Mira">Mira (Female)</option>
          </Select>
        </div>

        <div className="flex justify-end">
          <Button onClick={() => router.push('/create/customize')} disabled={!draft.script.trim()}>
            Customize & Continue
          </Button>
        </div>
      </div>
    </CreateFlowShell>
  );
}
