'use client';

import { useMemo, useState } from 'react';
import { Film, Sparkles, Wand2 } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AIVideoGenerateResponse } from '@/types/api';

const TEMPLATE_OPTIONS = [
  { value: 'History_POV', label: 'History POV' },
  { value: 'Mythology_POV', label: 'Mythology POV' },
  { value: 'Titanic_POV', label: 'Titanic POV' },
  { value: 'Roman_Soldier_POV', label: 'Roman Soldier POV' },
  { value: 'Historical_Fact_Reel', label: 'Historical Fact Reel' },
];

const MODEL_OPTIONS = [
  { value: 'heygen', label: 'HeyGen' },
  { value: 'runway', label: 'Runway' },
  { value: 'genericTextVideoAPI', label: 'Generic Text Video API' },
  { value: 'fallback', label: 'Fallback Local Generator' },
];

const TONE_OPTIONS = ['Cinematic', 'Dramatic', 'Educational', 'Inspirational', 'Bold'];
const LANGUAGE_OPTIONS = ['English', 'Hinglish', 'Hindi'];
const VOICE_OPTIONS = ['', 'Aarav', 'Anaya', 'Dev', 'Mira'];

function toAbsoluteUrl(url: string) {
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

type Props = {
  userId: string;
};

export function CreateAIVideoClient({ userId }: Props) {
  const [templateId, setTemplateId] = useState('History_POV');
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Cinematic');
  const [language, setLanguage] = useState('English');
  const [selectedModel, setSelectedModel] = useState('heygen');
  const [voice, setVoice] = useState('');
  const [referenceImagesText, setReferenceImagesText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AIVideoGenerateResponse | null>(null);

  const referenceImages = useMemo(
    () =>
      referenceImagesText
        .split('\n')
        .map((value) => value.trim())
        .filter(Boolean),
    [referenceImagesText],
  );

  const generate = async () => {
    if (!topic.trim()) {
      setError('Please enter a topic.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await api.generateAIVideo(
        {
          templateId,
          topic: topic.trim(),
          tone,
          language,
          selectedModel,
          voice: voice || undefined,
          referenceImages,
        },
        userId,
      );
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate AI video.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Card>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">AI Video Generator</h1>
        <p className="mt-1 text-sm text-muted">
          Choose a model, describe your reel, and generate a provider-backed AI video.
        </p>
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
            <p className="mb-1 text-sm font-semibold text-text">Model</p>
            <Dropdown value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>
              {MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="mb-1 text-sm font-semibold text-text">Topic</p>
            <Input
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="e.g. A cinematic mythology reel about Karna"
              maxLength={300}
            />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold text-text">Voice (optional)</p>
            <Dropdown value={voice} onChange={(event) => setVoice(event.target.value)}>
              {VOICE_OPTIONS.map((option) => (
                <option key={option || 'none'} value={option}>
                  {option || 'No voice preference'}
                </option>
              ))}
            </Dropdown>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-text">Reference image URLs (optional)</p>
          <Textarea
            rows={4}
            value={referenceImagesText}
            onChange={(event) => setReferenceImagesText(event.target.value)}
            placeholder={'https://example.com/image-1.jpg\nhttps://example.com/image-2.jpg'}
          />
          <p className="mt-1 text-xs text-muted">One URL per line. These are passed to the selected provider if supported.</p>
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
                <Wand2 className="h-4 w-4" />
                Generate AI Video
              </>
            )}
          </Button>
          {error && <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>}
        </div>
      </Card>

      {result && (
        <Card className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              Provider: {result.provider}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1">
              <Film className="h-3.5 w-3.5 text-accent" />
              {result.duration}s • {result.quality}
            </span>
          </div>

          <video
            src={toAbsoluteUrl(result.videoUrl)}
            controls
            className="w-full rounded-[var(--radius-md)] border border-border bg-bg"
          />

          <div className="flex items-center gap-2">
            <Button type="button" onClick={() => window.open(toAbsoluteUrl(result.videoUrl), '_blank')}>
              Open Video
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
