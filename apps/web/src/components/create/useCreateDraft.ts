'use client';

import { useEffect, useMemo, useState } from 'react';

import type { CreateDraft } from '@/components/create/types';
import { defaultDraft } from '@/components/create/types';

const STORAGE_KEY = 'vidyobharat-create-draft';

export function useCreateDraft() {
  const [draft, setDraft] = useState<CreateDraft>(defaultDraft);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CreateDraft>;
        setDraft({ ...defaultDraft, ...parsed });
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  }, [draft, hydrated]);

  const actions = useMemo(
    () => ({
      update(patch: Partial<CreateDraft>) {
        setDraft((prev) => ({ ...prev, ...patch }));
      },
      addAsset(asset: CreateDraft['assets'][number]) {
        setDraft((prev) => ({ ...prev, assets: [...prev.assets, asset] }));
      },
      removeAsset(assetId: string) {
        setDraft((prev) => ({ ...prev, assets: prev.assets.filter((item) => item.id !== assetId) }));
      },
      reset() {
        setDraft(defaultDraft);
        window.localStorage.removeItem(STORAGE_KEY);
      },
    }),
    [],
  );

  return { draft, hydrated, ...actions };
}
