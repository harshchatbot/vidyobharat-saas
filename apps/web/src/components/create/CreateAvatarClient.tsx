'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { CreateFlowShell } from '@/components/create/CreateFlowShell';
import { useCreateDraft } from '@/components/create/useCreateDraft';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { api } from '@/lib/api';
import type { Avatar } from '@/types/api';

type Props = {
  userId: string;
};

export function CreateAvatarClient({ userId }: Props) {
  const router = useRouter();
  const { draft, update } = useCreateDraft();
  const [avatars, setAvatars] = useState<Avatar[]>([]);
  const [search, setSearch] = useState('');
  const [scope, setScope] = useState<'public' | 'own'>('public');
  const [language, setLanguage] = useState('hi-IN');
  const [selectedAvatar, setSelectedAvatar] = useState(draft.avatarId);

  useEffect(() => {
    let cancelled = false;
    void api
      .listAvatars(userId, { search, scope, language })
      .then((data) => {
        if (!cancelled) setAvatars(data);
      })
      .catch(() => {
        if (!cancelled) setAvatars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, search, scope, language]);

  const selected = useMemo(() => avatars.find((item) => item.id === selectedAvatar) ?? null, [avatars, selectedAvatar]);

  return (
    <CreateFlowShell
      step={2}
      title="Select an avatar"
      subtitle="Use your own presenters or public avatars, then continue to your script."
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search avatar by name or style" />
        <Select value={scope} onChange={(e) => setScope(e.target.value as 'public' | 'own')}>
          <option value="public">Public Avatars</option>
          <option value="own">Own Avatars</option>
        </Select>
        <Select value={language} onChange={(e) => setLanguage(e.target.value)}>
          <option value="hi-IN">Hindi</option>
          <option value="ta-IN">Tamil</option>
          <option value="bn-IN">Bengali</option>
          <option value="en-IN">English (India)</option>
        </Select>
      </div>

      <Grid className="mt-4 sm:grid-cols-2 lg:grid-cols-3">
        {avatars.map((avatar) => (
          <button
            key={avatar.id}
            type="button"
            onClick={() => setSelectedAvatar(avatar.id)}
            className={`overflow-hidden rounded-[var(--radius-lg)] border text-left transition ${
              selectedAvatar === avatar.id
                ? 'border-[hsl(var(--color-accent))] shadow-soft'
                : 'border-[hsl(var(--color-border))]'
            }`}
          >
            <img src={avatar.thumbnail_url} alt={avatar.name} className="h-36 w-full object-cover" />
            <div className="p-3">
              <p className="font-semibold text-text">{avatar.name}</p>
              <p className="text-xs text-muted">{avatar.style} • {avatar.language_tags.join(', ')}</p>
            </div>
          </button>
        ))}
      </Grid>

      <Card className="mt-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <p className="text-sm text-muted">
          {selected ? `Selected: ${selected.name}` : 'Select one avatar to continue.'}
        </p>
        <Button
          onClick={() => {
            if (!selectedAvatar) return;
            update({ creationType: 'avatar', avatarId: selectedAvatar });
            router.push('/create/script');
          }}
          disabled={!selectedAvatar}
        >
          Continue to Script
        </Button>
      </Card>
    </CreateFlowShell>
  );
}
