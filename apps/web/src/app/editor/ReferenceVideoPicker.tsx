'use client';

import { useEffect, useRef, useState } from 'react';
import { validateReferenceVideo } from './referenceVideo';

/** Optional reference input; local-only until the Reference DNA API is wired.
 * No expensive AI calls and no reference footage is included in the output.
 */
export function ReferenceVideoPicker({ onChange }: {
  onChange?: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function select(next: File | null) {
    if (next) {
      const issue = validateReferenceVideo(next);
      if (issue) { setError(issue); return; }
    }
    setError(null);
    setFile(next);
    onChange?.(next);
  }

  return (
    <section aria-label="Optional editing reference" className="rounded-xl border border-white/15 p-4">
      <h3 className="text-sm font-semibold">Reference video <span className="font-normal opacity-70">(optional)</span></h3>
      <p className="mt-1 text-xs opacity-70">Show RangManch the pacing, typography and transitions you like. Your original footage stays yours.</p>
      <input ref={inputRef} className="mt-3 block w-full text-sm" type="file"
        accept="video/mp4,video/webm,video/quicktime,.mov" aria-label="Choose reference video"
        onChange={(event) => select(event.currentTarget.files?.[0] ?? null)} />
      {error && <p role="alert" className="mt-2 text-xs text-red-400">{error}</p>}
      {file && <div className="mt-3 space-y-2">
        <p className="break-all text-xs">{file.name}</p>
        {preview && <video src={preview} controls preload="metadata" className="max-h-52 w-full rounded-lg" aria-label="Reference preview" />}
        <button type="button" className="rounded-md border px-3 py-1 text-xs" onClick={() => {
          if (inputRef.current) inputRef.current.value = '';
          select(null);
        }}>Remove reference</button>
      </div>}
      <p className="mt-2 text-xs opacity-60">Reference analysis is not connected yet. This picker does not change the generated edit.</p>
    </section>
  );
}
