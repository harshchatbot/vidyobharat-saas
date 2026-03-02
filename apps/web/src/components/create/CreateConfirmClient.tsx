'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CreateFlowShell } from '@/components/create/CreateFlowShell';
import { useCreateDraft } from '@/components/create/useCreateDraft';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';

type Props = {
  userId: string;
};

function estimateCredits(script: string, assetsCount: number) {
  const scriptCost = Math.max(6, Math.ceil(script.length / 120));
  return scriptCost + assetsCount;
}

export function CreateConfirmClient({ userId }: Props) {
  const router = useRouter();
  const { draft, reset } = useCreateDraft();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const estimatedCredits = useMemo(
    () => estimateCredits(draft.script, draft.assets.length),
    [draft.script, draft.assets.length],
  );

  const generate = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const project = await api.createProject(
        {
          user_id: userId,
          title: `Video ${new Date().toLocaleDateString()}`,
          script: draft.script,
          language: draft.language,
          voice: draft.voice,
          template: draft.templateId ?? draft.creationType ?? 'script-only',
        },
        userId,
      );

      await Promise.all(
        draft.assets.map((asset) =>
          api.addProjectAsset(project.id, { filename: asset.filename, kind: asset.kind }, userId),
        ),
      );

      const render = await api.createRender(
        { project_id: project.id, user_id: userId, include_broll: true },
        userId,
      );

      reset();
      router.push(`/renders/${render.id}`);
    } catch {
      setError('Unable to start render. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <CreateFlowShell
      step={5}
      title="Review and confirm"
      subtitle="Check your setup before generation."
    >
      <div className="grid gap-4">
        <Card className="bg-bg">
          <p className="text-sm text-muted">Creation type</p>
          <p className="font-semibold text-text">{draft.creationType ?? 'Not selected'}</p>
          <p className="mt-2 text-sm text-muted">Avatar</p>
          <p className="font-semibold text-text">{draft.avatarId ?? 'Not selected'}</p>
          <p className="mt-2 text-sm text-muted">Template</p>
          <p className="font-semibold text-text">{draft.templateId ?? 'Not selected'}</p>
        </Card>

        <Card className="bg-bg">
          <p className="text-sm text-muted">Script</p>
          <p className="line-clamp-5 text-sm text-text">{draft.script || 'No script added yet.'}</p>
          <p className="mt-2 text-sm text-muted">Voice / Language</p>
          <p className="font-semibold text-text">{draft.voice} • {draft.language}</p>
        </Card>

        <Card className="bg-bg">
          <p className="text-sm text-muted">Assets and style</p>
          <p className="text-sm text-text">Assets: {draft.assets.length}</p>
          <p className="text-sm text-text">Music: {draft.music}</p>
          <p className="text-sm text-text">SFX: {draft.sfx}</p>
          <p className="text-sm text-text">Captions: {draft.captionsEnabled ? `On (${draft.captionStyle})` : 'Off'}</p>
        </Card>

        <Card className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <p className="text-sm text-muted">Estimated credit cost</p>
            <p className="text-2xl font-extrabold text-text">{estimatedCredits} credits</p>
          </div>
          <Button onClick={generate} disabled={submitting || !draft.script.trim()}>
            {submitting ? 'Generating...' : 'Generate'}
          </Button>
        </Card>

        {error && <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>}
      </div>
    </CreateFlowShell>
  );
}
