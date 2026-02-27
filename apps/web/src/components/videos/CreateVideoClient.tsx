'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';

type Props = {
  userId: string;
  templateKey?: string;
};

const voiceOptions = ['Aarav', 'Anaya', 'Dev', 'Mira'];

const templatePrefills: Record<string, { title: string; scriptPlaceholder: string; voice: string }> = {
  real_estate: {
    title: 'Real Estate Promo',
    scriptPlaceholder: 'Showcase the property location, key amenities, floor plan highlights, and final CTA.',
    voice: 'Aarav',
  },
  youtube_intro: {
    title: 'YouTube Intro',
    scriptPlaceholder: 'Welcome viewers, introduce your channel topic, mention posting schedule, and ask for subscribe.',
    voice: 'Mira',
  },
};

export function CreateVideoClient({ userId, templateKey }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const prefill = templateKey ? templatePrefills[templateKey] : undefined;

  const [title, setTitle] = useState(prefill?.title ?? '');
  const [script, setScript] = useState('');
  const [voice, setVoice] = useState(prefill?.voice ?? 'Aarav');
  const [images, setImages] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previews = useMemo(
    () => images.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [images],
  );

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    setImages((prev) => [...prev, ...Array.from(files)]);
  };

  const submit = async () => {
    if (!script.trim()) {
      setError('Please add a script before generating.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('title', title);
      formData.append('script', script);
      formData.append('voice', voice);
      images.forEach((image) => {
        formData.append('images', image);
      });

      const result = await api.createVideo(formData, userId);
      router.push(`/videos/${result.id}`);
    } catch {
      setError('Failed to create video. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Create Video</h1>
        <p className="mt-1 text-sm text-muted">Text + images to video in one simple form.</p>
      </div>

      <Card>
        <p className="text-sm font-semibold text-text">Title (optional)</p>
        <Input
          className="mt-2"
          placeholder="Untitled Video"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Upload Images</p>
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragActive(false);
            onFiles(event.dataTransfer.files);
          }}
          className={`mt-2 rounded-[var(--radius-md)] border border-dashed p-6 text-center text-sm ${
            dragActive ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)]' : 'border-border bg-bg'
          }`}
        >
          Drag & drop images here, or click to upload
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => onFiles(event.target.files)}
        />

        <p className="mt-3 text-xs text-muted">{images.length} image(s) selected</p>

        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {previews.map(({ file, url }, idx) => (
              <div key={`${file.name}-${idx}`} className="relative overflow-hidden rounded-[var(--radius-md)] border border-border">
                <img src={url} alt={file.name} className="h-20 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute right-1 top-1 rounded bg-[hsl(var(--color-bg)/0.8)] px-1 text-xs"
                >
                  x
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Script</p>
        <Textarea
          className="mt-2"
          rows={8}
          placeholder={prefill?.scriptPlaceholder ?? 'Write your narration/script...'}
          value={script}
          onChange={(event) => setScript(event.target.value)}
        />
      </Card>

      <Card>
        <p className="text-sm font-semibold text-text">Voice</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Dropdown value={voice} onChange={(event) => setVoice(event.target.value)}>
            {voiceOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Dropdown>
          <Button variant="secondary" type="button">Preview Voice</Button>
        </div>
      </Card>

      <Card>
        <Button onClick={submit} disabled={submitting}>
          {submitting ? 'Generating...' : 'Generate Video'}
        </Button>
        {error && <p className="mt-2 text-sm text-[hsl(var(--color-danger))]">{error}</p>}
      </Card>
    </div>
  );
}
