import { ArrowDown, ArrowUp, ImagePlus, X } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

import { API_URL } from '@/lib/env';
import type { GeneratedImage } from '@/types/api';

function toAbsoluteUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://') ? url : `${API_URL}${url}`;
}

export function ReferenceImagePicker({
  generatedImages,
  selectedImageUrls,
  onToggle,
  onAddUrl,
  pastedUrl,
  onPastedUrlChange,
  onMove,
  onRemove,
}: {
  generatedImages: GeneratedImage[];
  selectedImageUrls: string[];
  onToggle: (url: string) => void;
  onAddUrl: () => void;
  pastedUrl: string;
  onPastedUrlChange: (value: string) => void;
  onMove: (index: number, direction: 'up' | 'down') => void;
  onRemove: (url: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,0.6fr)]">
        <div>
          <p className="text-sm font-semibold text-text">Select from Your Images</p>
          <p className="mt-1 text-sm text-muted">Use one or more existing generated images to seed the motion. If none are selected, generation will be text-to-video only.</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {generatedImages.slice(0, 9).map((image) => {
              const absoluteUrl = toAbsoluteUrl(image.image_url);
              const active = selectedImageUrls.includes(absoluteUrl);
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => onToggle(absoluteUrl)}
                  className={`overflow-hidden rounded-[var(--radius-lg)] border text-left transition ${
                    active
                      ? 'border-[hsl(var(--color-accent))] shadow-soft'
                      : 'border-border hover:border-[hsl(var(--color-accent)/0.4)]'
                  }`}
                >
                  <img src={absoluteUrl} alt={image.prompt} className="h-32 w-full object-cover" />
                  <div className="bg-bg p-3">
                    <p className="line-clamp-2 text-sm font-semibold text-text">{image.prompt}</p>
                    <p className="mt-1 text-xs text-muted">{image.aspect_ratio} • {image.resolution}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-border bg-bg p-4">
          <p className="text-sm font-semibold text-text">Add external image URL</p>
          <p className="mt-1 text-sm text-muted">Use this when you want to seed from an image outside your library.</p>
          <div className="mt-4 space-y-3">
            <Input value={pastedUrl} onChange={(event) => onPastedUrlChange(event.target.value)} placeholder="https://example.com/reference.jpg" />
            <Button type="button" variant="secondary" onClick={onAddUrl} className="w-full gap-2">
              <ImagePlus className="h-4 w-4" />
              Add reference image
            </Button>
          </div>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-text">Selected references</p>
        {selectedImageUrls.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No reference images selected.</p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {selectedImageUrls.map((url, index) => (
              <div key={`${url}-${index}`} className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg">
                <img src={url} alt={`Reference ${index + 1}`} className="h-32 w-full object-cover" />
                <div className="flex items-center justify-between gap-2 p-3">
                  <p className="truncate text-xs text-muted">Reference {index + 1}</p>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => onMove(index, 'up')} className="rounded border border-border p-1 text-text">
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onMove(index, 'down')} className="rounded border border-border p-1 text-text">
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button type="button" onClick={() => onRemove(url)} className="rounded border border-border p-1 text-text">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
