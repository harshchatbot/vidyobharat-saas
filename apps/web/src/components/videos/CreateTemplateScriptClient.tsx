'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, WandSparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import type { ReelScriptOutput } from '@/types/api';

const TEMPLATE_OPTIONS = [
  { value: 'History_POV', label: 'History POV' },
  { value: 'Mythology_POV', label: 'Mythology POV' },
  { value: 'Titanic_POV', label: 'Titanic POV' },
  { value: 'Roman_Soldier_POV', label: 'Roman Soldier POV' },
  { value: 'Historical_Fact_Reel', label: 'Historical Fact Reel' },
];

const TONE_OPTIONS = ['Cinematic', 'Dramatic', 'Educational', 'Inspirational', 'Bold'];
const LANGUAGE_OPTIONS = ['English', 'Hinglish', 'Hindi'];

type Props = {
  userId: string;
};

export function CreateTemplateScriptClient({ userId }: Props) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState('History_POV');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Cinematic');
  const [language, setLanguage] = useState('English');
  const [result, setResult] = useState<ReelScriptOutput | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const script = await api.generateReelScript({ templateId, topic: topic.trim(), tone, language }, userId);
      setResult(script);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate script. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const continueToRender = () => {
    if (!result) return;
    const finalScript = [result.hook, ...result.body_lines, result.cta].filter(Boolean).join('\n');
    const params = new URLSearchParams({
      script: finalScript,
      title: topic.trim() || 'AI Reel',
    });
    router.push(`/create?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Create Reel Script</h1>
        <p className="mt-1 text-sm text-muted">Generate, edit, and continue to video render in one flow.</p>
      </Card>

      <Card className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-semibold text-text">Template</p>
            <Dropdown value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
              {TEMPLATE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Dropdown>
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-text">Tone</p>
            <Dropdown value={tone} onChange={(event) => setTone(event.target.value)}>
              {TONE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
          <div>
            <p className="mb-1 text-sm font-semibold text-text">Topic</p>
            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. Rise and fall of the Mughal empire"
              maxLength={300}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-text">Language</p>
            <Dropdown value={language} onChange={(event) => setLanguage(event.target.value)}>
              {LANGUAGE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button onClick={generate} disabled={loading} className="gap-2">
            {loading ? (
              <>
                <Spinner />
                Generating...
              </>
            ) : (
              <>
                <WandSparkles className="h-4 w-4" />
                Generate Script
              </>
            )}
          </Button>
          {error && <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>}
        </div>
      </Card>

      {result && (
        <Card className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Hook</p>
            <Input
              value={result.hook}
              onChange={(event) => setResult((prev) => (prev ? { ...prev, hook: event.target.value } : prev))}
            />
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Body lines</p>
              <Button
                variant="secondary"
                type="button"
                className="gap-1 px-2 py-1 text-xs"
                onClick={() => setResult((prev) => (prev ? { ...prev, body_lines: [...prev.body_lines, ''] } : prev))}
              >
                <Plus className="h-3.5 w-3.5" />
                Add
              </Button>
            </div>
            <div className="space-y-2">
              {result.body_lines.map((line, index) => (
                <div key={`body-line-${index}`} className="flex items-center gap-2">
                  <Input
                    value={line}
                    onChange={(event) =>
                      setResult((prev) => {
                        if (!prev) return prev;
                        const next = [...prev.body_lines];
                        next[index] = event.target.value;
                        return { ...prev, body_lines: next };
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="px-2"
                    onClick={() =>
                      setResult((prev) => {
                        if (!prev) return prev;
                        return { ...prev, body_lines: prev.body_lines.filter((_, idx) => idx != index) };
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">CTA</p>
            <Input
              value={result.cta}
              onChange={(event) => setResult((prev) => (prev ? { ...prev, cta: event.target.value } : prev))}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Caption</p>
            <Textarea
              value={result.caption}
              rows={3}
              onChange={(event) => setResult((prev) => (prev ? { ...prev, caption: event.target.value } : prev))}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Hashtags (space separated)</p>
            <Input
              value={result.hashtags.join(' ')}
              onChange={(event) => {
                const tags = event.target.value.split(/\s+/).filter(Boolean);
                setResult((prev) => (prev ? { ...prev, hashtags: tags } : prev));
              }}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={continueToRender}>Continue to Render</Button>
            <p className="text-xs text-muted">This will prefill your script in the create page.</p>
          </div>
        </Card>
      )}
    </div>
  );
}
