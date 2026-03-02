'use client';

import { useRouter } from 'next/navigation';

import { CreateFlowShell } from '@/components/create/CreateFlowShell';
import type { CreationType } from '@/components/create/types';
import { useCreateDraft } from '@/components/create/useCreateDraft';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';

const options: Array<{ id: CreationType; label: string; description: string; nextHref: string }> = [
  {
    id: 'script-only',
    label: 'Script-Only',
    description: 'Start from your script and auto-build scenes with voice and captions.',
    nextHref: '/create/script',
  },
  {
    id: 'avatar',
    label: 'Avatar',
    description: 'Pick an AI presenter first and continue with script and brand setup.',
    nextHref: '/create/avatar',
  },
  {
    id: 'template',
    label: 'Template',
    description: 'Begin from a production template and then customize content.',
    nextHref: '/create/template',
  },
];

export function CreateChooseClient() {
  const router = useRouter();
  const { draft, update } = useCreateDraft();

  return (
    <CreateFlowShell
      step={1}
      title="Choose your base"
      subtitle="Pick the way you want to start. You can still customize everything in later steps."
    >
      <Grid className="md:grid-cols-3">
        {options.map((option) => {
          const selected = draft.creationType === option.id;
          return (
            <Card key={option.id} className="flex h-full flex-col justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold text-text">{option.label}</h2>
                <p className="mt-2 text-sm text-muted">{option.description}</p>
              </div>
              <Button
                className="mt-4"
                variant={selected ? 'primary' : 'secondary'}
                onClick={() => {
                  update({ creationType: option.id });
                  router.push(option.nextHref);
                }}
              >
                {selected ? 'Selected' : 'Choose'}
              </Button>
            </Card>
          );
        })}
      </Grid>
    </CreateFlowShell>
  );
}
