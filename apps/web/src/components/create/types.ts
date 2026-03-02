export type CreationType = 'avatar' | 'template' | 'script-only';

export type DraftAsset = {
  id: string;
  filename: string;
  kind: 'logo' | 'background' | 'image';
};

export type CreateDraft = {
  creationType: CreationType | null;
  avatarId: string | null;
  templateId: string | null;
  script: string;
  language: string;
  voice: string;
  music: string;
  sfx: string;
  captionsEnabled: boolean;
  captionStyle: string;
  assets: DraftAsset[];
};

export const defaultDraft: CreateDraft = {
  creationType: null,
  avatarId: null,
  templateId: null,
  script: '',
  language: 'hi-IN',
  voice: 'Aarav',
  music: 'inspirational',
  sfx: 'subtle',
  captionsEnabled: true,
  captionStyle: 'clean',
  assets: [],
};

export const createFlowSteps = [
  { key: 'choose', label: 'Choose Base', href: '/create/choose' },
  { key: 'select', label: 'Select Avatar/Template', href: '/create/avatar' },
  { key: 'script', label: 'Script & Voice', href: '/create/script' },
  { key: 'customize', label: 'Customize', href: '/create/customize' },
  { key: 'confirm', label: 'Review & Confirm', href: '/create/confirm' },
] as const;
