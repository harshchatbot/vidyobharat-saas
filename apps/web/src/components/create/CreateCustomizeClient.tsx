'use client';

import { useId } from 'react';
import { useRouter } from 'next/navigation';

import { CreateFlowShell } from '@/components/create/CreateFlowShell';
import { useCreateDraft } from '@/components/create/useCreateDraft';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Select } from '@/components/ui/Select';

export function CreateCustomizeClient() {
  const router = useRouter();
  const uploadId = useId();
  const { draft, update, addAsset, removeAsset } = useCreateDraft();

  return (
    <CreateFlowShell
      step={4}
      title="Customize assets and style"
      subtitle="Add logos/background images, select music/SFX, and set captions."
    >
      <div className="grid gap-4">
        <Card className="bg-bg">
          <p className="text-sm font-semibold text-text">Brand Assets</p>
          <p className="text-xs text-muted">Upload references now. Files are attached at generation time in MVP mode.</p>
          <div className="mt-3">
            <label htmlFor={uploadId} className="inline-flex cursor-pointer rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm font-semibold text-text">
              Add image/logo
            </label>
            <input
              id={uploadId}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                addAsset({
                  id: `${Date.now()}-${file.name}`,
                  filename: file.name,
                  kind: 'image',
                });
                event.currentTarget.value = '';
              }}
            />
          </div>

          <div className="mt-3 grid gap-2">
            {draft.assets.length === 0 && <p className="text-xs text-muted">No assets added yet.</p>}
            {draft.assets.map((asset) => (
              <div key={asset.id} className="flex items-center justify-between rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm">
                <span>{asset.filename}</span>
                <button type="button" className="text-xs font-semibold text-[hsl(var(--color-danger))]" onClick={() => removeAsset(asset.id)}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2">
          <Select value={draft.music} onChange={(event) => update({ music: event.target.value })}>
            <option value="inspirational">Music: Inspirational</option>
            <option value="uplifting">Music: Uplifting</option>
            <option value="minimal">Music: Minimal</option>
            <option value="none">Music: None</option>
          </Select>
          <Select value={draft.sfx} onChange={(event) => update({ sfx: event.target.value })}>
            <option value="subtle">SFX: Subtle</option>
            <option value="cinematic">SFX: Cinematic</option>
            <option value="none">SFX: None</option>
          </Select>
        </div>

        <Card className="bg-bg">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-text">Captions</p>
              <p className="text-xs text-muted">Enable burned-in captions and choose style.</p>
            </div>
            <button
              type="button"
              onClick={() => update({ captionsEnabled: !draft.captionsEnabled })}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                draft.captionsEnabled
                  ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                  : 'bg-[hsl(var(--color-border))] text-text'
              }`}
            >
              {draft.captionsEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          <div className="mt-3">
            <Select value={draft.captionStyle} onChange={(event) => update({ captionStyle: event.target.value })}>
              <option value="clean">Clean</option>
              <option value="bold">Bold</option>
              <option value="karaoke">Karaoke</option>
            </Select>
          </div>
        </Card>

        <div className="flex justify-end">
          <Button onClick={() => router.push('/create/confirm')}>Review & Confirm</Button>
        </div>
      </div>
    </CreateFlowShell>
  );
}
