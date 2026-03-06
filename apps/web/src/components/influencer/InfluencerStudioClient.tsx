'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronRight, ImageIcon, Layers3, Lock, RefreshCw, Sparkles, UserRound, Wand2 } from 'lucide-react';

import { useCredits } from '@/components/credits/CreditContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type {
  CreditEstimateResponse,
  GeneratedImage,
  ImageModel,
  InfluencerContentResponse,
  InfluencerPersona,
  InfluencerPoseOption,
  InfluencerScenePreset,
} from '@/types/api';
import { SectionCard } from '@/components/videos/create/SectionCard';

const PERSONALITY_OPTIONS = [
  'Confident',
  'Playful',
  'Motivational',
  'Luxury',
  'Bold',
  'Warm',
  'Witty',
  'Visionary',
];

const IMAGE_MODEL_FALLBACK: ImageModel[] = [
  { key: 'openai_image', label: 'OpenAI Images', description: 'Reliable prompt-following for premium persona visuals.', frontend_hint: 'Best for consistent production testing.' },
  { key: 'seedream', label: 'Seedream', description: 'Editorial visuals with premium polish.', frontend_hint: 'Good for elevated influencer scenes.' },
];

const INFLUENCER_STUDIO_CACHE_TTL_MS = 2 * 60 * 1000;

type TabKey = 'persona' | 'content' | 'images' | 'scenes' | 'settings';

type PersonaDraft = {
  name: string;
  gender_identity: string;
  niche: string;
  tone: string;
  catchphrase: string;
  personality_traits: string[];
  backstory: string;
  visual_description: string;
  character_locked: boolean;
};

function emptyDraft(): PersonaDraft {
  return {
    name: '',
    gender_identity: '',
    niche: '',
    tone: '',
    catchphrase: '',
    personality_traits: [],
    backstory: '',
    visual_description: '',
    character_locked: true,
  };
}

function toAbsoluteUrl(url: string | null | undefined) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

export function InfluencerStudioClient({ userId }: { userId: string }) {
  const cacheKey = `rangmanch:influencer-studio:v1:${userId}`;
  const draftKey = `rangmanch-influencer-draft:${userId}`;
  const [activeTab, setActiveTab] = useState<TabKey>('persona');
  const [personas, setPersonas] = useState<InfluencerPersona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>('');
  const [draft, setDraft] = useState<PersonaDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [savingPersona, setSavingPersona] = useState(false);
  const [uploadingReference, setUploadingReference] = useState(false);
  const [lockingReference, setLockingReference] = useState(false);
  const [generatingContent, setGeneratingContent] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [contentIntent, setContentIntent] = useState('');
  const [platform, setPlatform] = useState<'linkedin' | 'reels' | 'twitter' | 'youtube'>('linkedin');
  const [contentResult, setContentResult] = useState<InfluencerContentResponse | null>(null);
  const [poseOptions, setPoseOptions] = useState<InfluencerPoseOption[]>([]);
  const [scenePresets, setScenePresets] = useState<InfluencerScenePreset[]>([]);
  const [selectedPose, setSelectedPose] = useState('standing_confident');
  const [customPose, setCustomPose] = useState('');
  const [selectedScene, setSelectedScene] = useState('luxury_office');
  const [customSceneLabel, setCustomSceneLabel] = useState('');
  const [customSceneEnvironment, setCustomSceneEnvironment] = useState('');
  const [customSceneProps, setCustomSceneProps] = useState('');
  const [customSceneLighting, setCustomSceneLighting] = useState('');
  const [customSceneMood, setCustomSceneMood] = useState('');
  const [savingCustomScene, setSavingCustomScene] = useState(false);
  const [imageModels, setImageModels] = useState<ImageModel[]>(IMAGE_MODEL_FALLBACK);
  const [selectedImageModel, setSelectedImageModel] = useState('openai_image');
  const [imageModelPickerOpen, setImageModelPickerOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [contentEstimate, setContentEstimate] = useState<CreditEstimateResponse | null>(null);
  const [referenceEstimate, setReferenceEstimate] = useState<CreditEstimateResponse | null>(null);
  const [imageEstimate, setImageEstimate] = useState<CreditEstimateResponse | null>(null);
  const { wallet, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();
  const sectionRefs: Record<TabKey, React.RefObject<HTMLDivElement | null>> = {
    persona: useRef<HTMLDivElement>(null),
    content: useRef<HTMLDivElement>(null),
    images: useRef<HTMLDivElement>(null),
    scenes: useRef<HTMLDivElement>(null),
    settings: useRef<HTMLDivElement>(null),
  };

  const selectedPersona = useMemo(
    () => personas.find((item) => item.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  );
  const selectedScenePreset = useMemo(
    () => scenePresets.find((item) => item.key === selectedScene) ?? null,
    [scenePresets, selectedScene],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      setDraft({ ...emptyDraft(), ...(JSON.parse(raw) as Partial<PersonaDraft>) });
    } catch {
      // Ignore malformed drafts.
    }
  }, [draftKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [draftKey, draft]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        ts: number;
        personas: InfluencerPersona[];
        poses: InfluencerPoseOption[];
        scenes: InfluencerScenePreset[];
        models: ImageModel[];
        contentCost: CreditEstimateResponse | null;
        referenceCost: CreditEstimateResponse | null;
      };
      if (!cached.ts || Date.now() - cached.ts > INFLUENCER_STUDIO_CACHE_TTL_MS) return;
      setPersonas(cached.personas ?? []);
      if (cached.personas?.[0]) {
        setSelectedPersonaId(cached.personas[0].id);
        setDraft({
          name: cached.personas[0].name,
          gender_identity: cached.personas[0].gender_identity ?? '',
          niche: cached.personas[0].niche ?? '',
          tone: cached.personas[0].tone ?? '',
          catchphrase: cached.personas[0].catchphrase ?? '',
          personality_traits: cached.personas[0].personality_traits,
          backstory: cached.personas[0].backstory ?? '',
          visual_description: cached.personas[0].visual_description,
          character_locked: cached.personas[0].character_locked,
        });
      }
      setPoseOptions(cached.poses ?? []);
      setScenePresets(cached.scenes ?? []);
      setImageModels(cached.models?.length ? cached.models : IMAGE_MODEL_FALLBACK);
      setContentEstimate(cached.contentCost ?? null);
      setReferenceEstimate(cached.referenceCost ?? null);
      setLoading(false);
    } catch {
      // ignore malformed cache
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const hasWarmCache = typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(cacheKey));
    setLoading(!hasWarmCache);
    void Promise.all([
      api.listInfluencerPersonas(userId).catch(() => []),
      api.listInfluencerPoses(userId).catch(() => []),
      api.listInfluencerScenes(userId).catch(() => []),
      api.listImageModels(userId).catch(() => IMAGE_MODEL_FALLBACK),
      api.estimateCredits('influencer_content_generate', {}, userId).catch(() => null),
      api.estimateCredits('influencer_reference_lock', {}, userId).catch(() => null),
    ]).then(([loadedPersonas, poses, scenes, models, contentCost, referenceCost]) => {
      if (cancelled) return;
      setPersonas(loadedPersonas);
      if (loadedPersonas[0]) {
        setSelectedPersonaId(loadedPersonas[0].id);
        setDraft({
          name: loadedPersonas[0].name,
          gender_identity: loadedPersonas[0].gender_identity ?? '',
          niche: loadedPersonas[0].niche ?? '',
          tone: loadedPersonas[0].tone ?? '',
          catchphrase: loadedPersonas[0].catchphrase ?? '',
          personality_traits: loadedPersonas[0].personality_traits,
          backstory: loadedPersonas[0].backstory ?? '',
          visual_description: loadedPersonas[0].visual_description,
          character_locked: loadedPersonas[0].character_locked,
        });
      }
      setPoseOptions(poses);
      setScenePresets(scenes);
      setImageModels(models.length > 0 ? models : IMAGE_MODEL_FALLBACK);
      setContentEstimate(contentCost);
      setReferenceEstimate(referenceCost);
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              ts: Date.now(),
              personas: loadedPersonas,
              poses,
              scenes,
              models: models.length > 0 ? models : IMAGE_MODEL_FALLBACK,
              contentCost,
              referenceCost,
            }),
          );
        } catch {
          // ignore cache write issues
        }
      }
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, userId]);

  useEffect(() => {
    void api.listInfluencerScenes(userId, selectedPersonaId || undefined).then(setScenePresets).catch(() => undefined);
  }, [userId, selectedPersonaId]);

  useEffect(() => {
    void api
      .estimateCredits('influencer_image_generate', { model: selectedImageModel, resolution }, userId)
      .then(setImageEstimate)
      .catch(() => setImageEstimate(null));
  }, [selectedImageModel, resolution, userId]);

  function syncDraftFromPersona(persona: InfluencerPersona) {
    setSelectedPersonaId(persona.id);
    setDraft({
      name: persona.name,
      gender_identity: persona.gender_identity ?? '',
      niche: persona.niche ?? '',
      tone: persona.tone ?? '',
      catchphrase: persona.catchphrase ?? '',
      personality_traits: persona.personality_traits,
      backstory: persona.backstory ?? '',
      visual_description: persona.visual_description,
      character_locked: persona.character_locked,
    });
  }

  function scrollToSection(tab: TabKey) {
    setActiveTab(tab);
    const node = sectionRefs[tab].current;
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  async function savePersona() {
    setSavingPersona(true);
    setPersonaError(null);
    try {
      const payload = {
        name: draft.name.trim(),
        gender_identity: draft.gender_identity.trim() || null,
        niche: draft.niche.trim() || null,
        tone: draft.tone.trim() || null,
        catchphrase: draft.catchphrase.trim() || null,
        personality_traits: draft.personality_traits,
        backstory: draft.backstory.trim() || null,
        visual_description: draft.visual_description.trim(),
        character_locked: draft.character_locked,
      };
      if (!payload.name || !payload.visual_description) {
        throw new Error('Character name and visual description are required');
      }
      const persona = selectedPersonaId
        ? await api.updateInfluencerPersona(selectedPersonaId, payload, userId)
        : await api.createInfluencerPersona(payload, userId);
      setPersonas((current) => {
        const next = current.filter((item) => item.id !== persona.id);
        return [persona, ...next];
      });
      syncDraftFromPersona(persona);
      show(`Persona saved. ${persona.name} is ready for consistent generation.`);
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : 'Failed to save persona');
    } finally {
      setSavingPersona(false);
    }
  }

  async function onReferenceUpload(file: File) {
    if (!selectedPersonaId) {
      setPersonaError('Save the persona before uploading a reference image');
      return;
    }
    setUploadingReference(true);
    try {
      const persona = await api.uploadInfluencerReference(selectedPersonaId, file, userId);
      setPersonas((current) => current.map((item) => (item.id === persona.id ? persona : item)));
      syncDraftFromPersona(persona);
      show('Reference uploaded. Base face lock image stored successfully.');
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : 'Failed to upload reference image');
    } finally {
      setUploadingReference(false);
    }
  }

  async function onLockReference() {
    if (!selectedPersonaId) return;
    if (referenceEstimate && wallet && wallet.currentCredits < referenceEstimate.estimatedCredits) {
      openLowBalanceModal(referenceEstimate.estimatedCredits);
      return;
    }
    setLockingReference(true);
    try {
      const response = await api.lockInfluencerReference(selectedPersonaId, userId);
      setPersonas((current) => current.map((item) => (item.id === response.persona.id ? response.persona : item)));
      syncDraftFromPersona(response.persona);
      await refreshCredits();
      show(response.message);
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : 'Failed to lock character identity');
    } finally {
      setLockingReference(false);
    }
  }

  async function onGenerateContent() {
    if (!selectedPersonaId) {
      setPersonaError('Create or select a persona first');
      return;
    }
    if (contentEstimate && wallet && wallet.currentCredits < contentEstimate.estimatedCredits) {
      openLowBalanceModal(contentEstimate.estimatedCredits);
      return;
    }
    setGeneratingContent(true);
    try {
      const result = await api.generateInfluencerContent({ persona_id: selectedPersonaId, intent: contentIntent.trim(), platform }, userId);
      setContentResult(result);
      if (result.remaining_credits != null && wallet) {
        applyWallet({ ...wallet, currentCredits: result.remaining_credits });
      } else {
        await refreshCredits();
      }
      show(`Content generated. Used ${result.applied_credits} credits.`);
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : 'Failed to generate influencer content');
    } finally {
      setGeneratingContent(false);
    }
  }

  async function onGenerateImage() {
    if (!selectedPersonaId) {
      setPersonaError('Create or select a persona first');
      return;
    }
    if (imageEstimate && wallet && wallet.currentCredits < imageEstimate.estimatedCredits) {
      openLowBalanceModal(imageEstimate.estimatedCredits);
      return;
    }
    setGeneratingImage(true);
    try {
      const image = await api.generateInfluencerImage(
        {
          persona_id: selectedPersonaId,
          pose: selectedPose,
          scene: selectedScene,
          custom_pose: selectedPose === 'custom' ? customPose : null,
          model_key: selectedImageModel,
          aspect_ratio: aspectRatio,
          resolution,
        },
        userId,
      );
      setGeneratedImage(image);
      if (image.remaining_credits != null && wallet) {
        applyWallet({ ...wallet, currentCredits: image.remaining_credits });
      } else {
        await refreshCredits();
      }
      show(`Image generated. Used ${image.applied_credits} credits.`);
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : 'Failed to generate influencer image');
    } finally {
      setGeneratingImage(false);
    }
  }

  async function onSaveCustomScene() {
    if (!customSceneLabel.trim() || !customSceneEnvironment.trim()) {
      setPersonaError('Custom scene name and environment are required');
      return;
    }
    setSavingCustomScene(true);
    setPersonaError(null);
    try {
      const created = await api.createInfluencerScene(
        {
          persona_id: selectedPersonaId || null,
          label: customSceneLabel.trim(),
          description: `${customSceneLabel.trim()} scene for ${selectedPersona?.name || 'the selected influencer'}`,
          environment: customSceneEnvironment.trim(),
          props: customSceneProps.trim() || null,
          lighting: customSceneLighting.trim() || null,
          mood: customSceneMood.trim() || null,
          negative_constraints: 'Do not alter face, hairstyle, skin tone, or core identity markers.',
        },
        userId,
      );
      const refreshed = await api.listInfluencerScenes(userId, selectedPersonaId || undefined);
      setScenePresets(refreshed);
      setSelectedScene(created.key);
      setCustomSceneLabel('');
      setCustomSceneEnvironment('');
      setCustomSceneProps('');
      setCustomSceneLighting('');
      setCustomSceneMood('');
      show(`Custom scene saved. ${created.label} is now available in your scene library.`);
      scrollToSection('images');
    } catch (error) {
      setPersonaError(error instanceof Error ? error.message : 'Failed to save custom scene');
    } finally {
      setSavingCustomScene(false);
    }
  }

  async function onToggleCharacterLock() {
    const nextValue = !draft.character_locked;
    setDraft((current) => ({ ...current, character_locked: nextValue }));
    if (!selectedPersonaId) {
      return;
    }
    try {
      const persona = await api.updateInfluencerPersona(
        selectedPersonaId,
        {
          name: draft.name.trim() || selectedPersona?.name || 'Untitled persona',
          gender_identity: draft.gender_identity.trim() || null,
          niche: draft.niche.trim() || null,
          tone: draft.tone.trim() || null,
          catchphrase: draft.catchphrase.trim() || null,
          personality_traits: draft.personality_traits,
          backstory: draft.backstory.trim() || null,
          visual_description: draft.visual_description.trim() || selectedPersona?.visual_description || 'Consistent influencer visual identity',
          character_locked: nextValue,
        },
        userId,
      );
      setPersonas((current) => current.map((item) => (item.id === persona.id ? persona : item)));
      syncDraftFromPersona(persona);
      show(nextValue ? 'Character identity locked.' : 'Character identity unlocked.');
    } catch (error) {
      setDraft((current) => ({ ...current, character_locked: !nextValue }));
      setPersonaError(error instanceof Error ? error.message : 'Failed to update character lock state');
    }
  }

  const tabItems: { key: TabKey; label: string }[] = [
    { key: 'persona', label: 'Persona' },
    { key: 'content', label: 'Content' },
    { key: 'images', label: 'Images' },
    { key: 'scenes', label: 'Scenes' },
    { key: 'settings', label: 'Settings' },
  ];

  return (
    <div className="space-y-6">
      <LoadingOverlay
        open={loading}
        title="Preparing Influencer Studio"
        description="Loading personas, pose systems, scenes, and credit-aware generation tools."
        stepLabel="Booting character consistency engine"
        accentLabel="Influencer Studio"
      />

      

      <div className="flex gap-2 overflow-x-auto rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))] p-2">
        {tabItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => scrollToSection(item.key)}
            className={`whitespace-nowrap rounded-[var(--radius-md)] px-4 py-2 text-sm font-medium transition ${
              activeTab === item.key
                ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                : 'text-muted hover:bg-[hsl(var(--color-bg))]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-start">
        <div className="space-y-6">
          {personaError ? (
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-danger))] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">
              {personaError}
            </div>
          ) : null}

          <div ref={sectionRefs.persona} className="scroll-mt-24">
        <SectionCard
          title="Persona Builder"
          description="Define the memory, voice, visuals, and emotional core of the influencer."
          icon={<UserRound className="h-5 w-5" />}
          action={
            selectedPersona ? (
              <Badge variant="outline">{selectedPersona.name}</Badge>
            ) : null
          }
        >
          <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text">Saved personas</h3>
                <Button variant="secondary" type="button" onClick={() => { setSelectedPersonaId(''); setDraft(emptyDraft()); }}>
                  New
                </Button>
              </div>
              <div className="grid gap-2">
                {personas.length === 0 ? (
                  <Card className="px-4 py-4 text-sm text-muted">No persona saved yet.</Card>
                ) : (
                  personas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => syncDraftFromPersona(persona)}
                      className={`rounded-[var(--radius-md)] border px-4 py-3 text-left transition ${
                        selectedPersonaId === persona.id
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.1)]'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]'
                      }`}
                    >
                      <div className="font-semibold text-text">{persona.name}</div>
                      <div className="mt-1 text-xs text-muted">{persona.niche || 'No niche set'}</div>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Character Name</label>
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft((current) => ({ ...current, name: e.target.value }))}
                    placeholder="e.g. Ira Malhotra, the startup storyteller"
                  />
                  <p className="mt-2 text-xs text-muted">Use the public-facing name you want to keep consistent across all content.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Gender / Identity</label>
                  <Input
                    value={draft.gender_identity}
                    onChange={(e) => setDraft((current) => ({ ...current, gender_identity: e.target.value }))}
                    placeholder="e.g. Female founder, androgynous creator, male fitness coach"
                  />
                  <p className="mt-2 text-xs text-muted">Describe how the character should be represented, not just a one-word label.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Niche</label>
                  <Input
                    value={draft.niche}
                    onChange={(e) => setDraft((current) => ({ ...current, niche: e.target.value }))}
                    placeholder="e.g. SaaS growth, luxury real estate, wellness coaching"
                  />
                  <p className="mt-2 text-xs text-muted">This helps keep content topics and scene choices aligned with the brand persona.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Tone</label>
                  <Input
                    value={draft.tone}
                    onChange={(e) => setDraft((current) => ({ ...current, tone: e.target.value }))}
                    placeholder="e.g. polished, bold, witty, mentor-like"
                  />
                  <p className="mt-2 text-xs text-muted">Keep this stable so captions, hooks, and speaking style feel recognisable.</p>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-text">Catchphrase</label>
                  <Input
                    value={draft.catchphrase}
                    onChange={(e) => setDraft((current) => ({ ...current, catchphrase: e.target.value }))}
                    placeholder="e.g. Let's build smarter, not louder."
                  />
                  <p className="mt-2 text-xs text-muted">Optional, but useful if you want signature intros or closes in content.</p>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text">Core Personality</label>
                <p className="mb-3 text-xs text-muted">Choose 3-5 traits that should stay constant even when the scene or platform changes.</p>
                <div className="flex flex-wrap gap-2">
                  {PERSONALITY_OPTIONS.map((trait) => {
                    const active = draft.personality_traits.includes(trait);
                    return (
                      <button
                        key={trait}
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            personality_traits: active
                              ? current.personality_traits.filter((item) => item !== trait)
                              : [...current.personality_traits, trait],
                          }))
                        }
                        className={`rounded-full border px-3 py-1.5 text-sm transition ${
                          active
                            ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] text-text'
                        }`}
                      >
                        {trait}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text">Long-form backstory</label>
                <Textarea
                  rows={5}
                  value={draft.backstory}
                  onChange={(e) => setDraft((current) => ({ ...current, backstory: e.target.value }))}
                  placeholder="Explain where this influencer comes from, what shaped them, what they care about, and what personal history informs their content."
                />
                <p className="mt-2 text-xs text-muted">Think of this as memory for future content, not public-facing copy.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text">Visual description</label>
                <Textarea
                  rows={4}
                  value={draft.visual_description}
                  onChange={(e) => setDraft((current) => ({ ...current, visual_description: e.target.value }))}
                  placeholder="Describe face shape, hairstyle, skin tone, fashion signatures, accessories, and identity markers."
                />
                <p className="mt-2 text-xs text-muted">Be specific. This description is used to keep the character visually locked across future generations.</p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={savePersona} disabled={savingPersona}>
                  {savingPersona ? 'Saving...' : selectedPersonaId ? 'Update Persona' : 'Save Persona'}
                </Button>
                {selectedPersona?.system_prompt_template ? (
                  <Button variant="secondary" type="button" onClick={() => navigator.clipboard.writeText(selectedPersona.system_prompt_template ?? '')}>
                    Copy Style Block
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </SectionCard>
          </div>

          <div ref={sectionRefs.content} className="scroll-mt-24">
        <SectionCard
          title="Influencer Content Generator"
          description="Generate structured platform content from the locked persona memory."
          icon={<Sparkles className="h-5 w-5" />}
        >
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-[1fr_220px]">
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Intent</label>
                <Textarea
                  rows={5}
                  value={contentIntent}
                  onChange={(e) => setContentIntent(e.target.value)}
                  placeholder="e.g. Create a LinkedIn post about why Indian founders should ship faster, with a motivating close and a confident CTA."
                />
                <p className="mt-2 text-xs text-muted">Describe the topic, angle, and desired outcome. The persona memory will shape the voice automatically.</p>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Platform</label>
                  <Dropdown value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
                    <option value="linkedin">LinkedIn</option>
                    <option value="reels">Reels</option>
                    <option value="twitter">Twitter</option>
                    <option value="youtube">YouTube</option>
                  </Dropdown>
                </div>
                <Card className="px-4 py-3 text-sm">
                  <div className="font-semibold text-text">Generate Content</div>
                  <div className="mt-1 text-muted">
                    {contentEstimate ? `${contentEstimate.estimatedCredits} credits` : '—'}
                  </div>
                </Card>
                <Button type="button" onClick={onGenerateContent} disabled={generatingContent || !contentIntent.trim()}>
                  {generatingContent ? 'Generating...' : `Generate Content · ${contentEstimate?.estimatedCredits ?? 0} credits`}
                </Button>
              </div>
            </div>

            {contentResult ? (
              <Card className="px-5 py-5">
                <div className="text-sm uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Output Preview</div>
                <h3 className="mt-2 font-heading text-2xl font-bold text-text">{contentResult.title}</h3>
                <p className="mt-3 text-sm text-muted">{contentResult.intro}</p>
                <div className="mt-4 grid gap-3">
                  {contentResult.content_blocks.map((block, index) => (
                    <div key={`${block}-${index}`} className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-4 py-3 text-sm text-text">
                      {block}
                    </div>
                  ))}
                </div>
                <p className="mt-4 text-sm font-medium text-text">{contentResult.motivational_close}</p>
                <p className="mt-2 text-sm text-[hsl(var(--color-accent))]">{contentResult.cta}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {contentResult.tags.map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </Card>
            ) : null}
          </div>
        </SectionCard>
          </div>

          <div ref={sectionRefs.images} className="scroll-mt-24">
        <SectionCard
          title="Reference Locking & Image Consistency"
          description="Upload a base face, lock the identity, then generate pose and scene variations without changing the character."
          icon={<ImageIcon className="h-5 w-5" />}
        >
          <div className="grid gap-6 xl:grid-cols-[320px_1fr]">
            <div className="space-y-4">
              <Card className="overflow-hidden p-0">
                <div className="aspect-[4/5] bg-[hsl(var(--color-bg))]">
                  {selectedPersona?.reference_image_url ? (
                    <img src={toAbsoluteUrl(selectedPersona.reference_image_url) ?? ''} alt={selectedPersona.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">No reference uploaded</div>
                  )}
                </div>
              </Card>
              <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-medium text-text">
                {uploadingReference ? 'Uploading...' : 'Upload base reference'}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onReferenceUpload(file);
                  }}
                />
              </label>
              <p className="text-xs text-muted">Use a clean front-facing portrait with clear lighting. This becomes the identity anchor for future image and video generation.</p>
              <Button
                type="button"
                variant="secondary"
                onClick={onLockReference}
                disabled={lockingReference || !selectedPersona?.reference_image_url}
                className="w-full"
              >
                {lockingReference ? 'Locking...' : `Lock Character Identity · ${referenceEstimate?.estimatedCredits ?? 0} credits`}
              </Button>
            </div>

            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Pose</label>
                  <Dropdown value={selectedPose} onChange={(e) => setSelectedPose(e.target.value)}>
                    {poseOptions.map((pose) => (
                      <option key={pose.key} value={pose.key}>{pose.label}</option>
                    ))}
                  </Dropdown>
                  <p className="mt-2 text-xs text-muted">Pose changes body stance only. It should not alter facial identity.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Scene</label>
                  <Dropdown value={selectedScene} onChange={(e) => setSelectedScene(e.target.value)}>
                    {scenePresets.map((scene) => (
                      <option key={scene.key} value={scene.key}>{scene.label}</option>
                    ))}
                  </Dropdown>
                  <p className="mt-2 text-xs text-muted">Scene controls the background, lighting, and mood only. It should not change the face or identity.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Image model</label>
                  <button
                    type="button"
                    onClick={() => setImageModelPickerOpen(true)}
                    className="w-full rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-3 text-left transition hover:bg-[hsl(var(--color-elevated))]"
                  >
                    <div className="flex items-start gap-3">
                      <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] text-[hsl(var(--color-accent))]">
                        <Sparkles className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-text">
                          {imageModels.find((model) => model.key === selectedImageModel)?.label ?? 'Choose model'}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {imageModels.find((model) => model.key === selectedImageModel)?.frontend_hint ??
                            'Choose the model based on how polished or stylized you want the final portrait to feel.'}
                        </p>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted" />
                    </div>
                  </button>
                </div>
              </div>

              <Card className="space-y-3 rounded-[24px] border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Output</p>
                    <p className="mt-1 text-xs text-muted">
                      {aspectRatio} • {resolution} px • {imageModels.find((model) => model.key === selectedImageModel)?.label ?? 'Selected model'}
                    </p>
                  </div>
                  <Badge variant="outline">{imageEstimate ? `${imageEstimate.estimatedCredits} credits` : 'Estimating...'}</Badge>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-text">Aspect ratio</p>
                  <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['9:16', 'Reels'],
                        ['4:5', 'Portrait'],
                        ['1:1', 'Square'],
                        ['16:9', 'Landscape'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setAspectRatio(value)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                            aspectRatio === value
                              ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                              : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                          }`}
                          title={label}
                        >
                          {value}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-text">Resolution</p>
                  <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.32)] p-2">
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['1024', '1024 px'],
                        ['1536', '1536 px'],
                        ['2048', '2048 px'],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setResolution(value)}
                          className={`rounded-full px-3 py-2 text-xs font-semibold transition ${
                            resolution === value
                              ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                              : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] text-muted hover:text-text'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-muted">Higher resolutions cost more credits but help when the asset will be reused in thumbnails or campaigns.</p>
                </div>
              </Card>

              {selectedPose === 'custom' ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Custom pose</label>
                  <Input
                    value={customPose}
                    onChange={(e) => setCustomPose(e.target.value)}
                    placeholder="e.g. leaning on a glass desk, one hand raised mid-explanation"
                  />
                  <p className="mt-2 text-xs text-muted">Describe body positioning only. Avoid redefining face or identity features here.</p>
                </div>
              ) : null}

              {selectedScenePreset ? (
                <Card className="px-4 py-4 text-sm">
                  <div className="font-semibold text-text">{selectedScenePreset.label}</div>
                  <p className="mt-1 text-muted">{selectedScenePreset.description}</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Environment</div>
                      <div className="mt-1 text-text">{selectedScenePreset.environment || 'Uses the preset background context.'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Lighting</div>
                      <div className="mt-1 text-text">{selectedScenePreset.lighting || 'Uses adaptive premium lighting.'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Props</div>
                      <div className="mt-1 text-text">{selectedScenePreset.props || 'Minimal supporting props only.'}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Mood</div>
                      <div className="mt-1 text-text">{selectedScenePreset.mood || 'Keeps the character premium and consistent.'}</div>
                    </div>
                  </div>
                </Card>
              ) : null}

              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={onGenerateImage} disabled={generatingImage || !selectedPersona?.reference_image_url}>
                  {generatingImage ? 'Generating...' : `Generate Image · ${imageEstimate?.estimatedCredits ?? 0} credits`}
                </Button>
                {selectedPersona?.character_locked ? (
                  <Badge variant="success"><Lock className="mr-1 h-3 w-3" /> Identity locked</Badge>
                ) : (
                  <Badge variant="outline">Identity unlocked</Badge>
                )}
              </div>

              {generatedImage ? (
                <Card className="overflow-hidden p-0">
                  <img src={toAbsoluteUrl(generatedImage.image_url) ?? ''} alt="Generated influencer" className="w-full object-cover" />
                  <div className="px-4 py-4 text-sm">
                    <div className="font-semibold text-text">Latest influencer render</div>
                    <p className="mt-1 text-muted">{generatedImage.prompt}</p>
                  </div>
                </Card>
              ) : null}
            </div>
          </div>
        </SectionCard>
          </div>

          <div ref={sectionRefs.scenes} className="scroll-mt-24">
        <SectionCard
          title="Scene Variations Engine"
          description="Use saved scene presets to vary environment, lighting, and mood without changing the face."
          icon={<Layers3 className="h-5 w-5" />}
        >
          <div className="mb-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-4 py-4 text-sm text-muted">
            These presets define the background, lighting, and overall scene mood behind the influencer. Identity remains locked separately through the reference image and character memory.
          </div>

          <div className="mb-4 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-4">
            <div className="grid gap-4 xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Scene name</label>
                <Input
                  value={customSceneLabel}
                  onChange={(e) => setCustomSceneLabel(e.target.value)}
                  placeholder="e.g. Luxury car reveal"
                />
                <p className="mt-2 text-xs text-muted">This becomes a reusable scene preset in the persona library.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Environment</label>
                <Input
                  value={customSceneEnvironment}
                  onChange={(e) => setCustomSceneEnvironment(e.target.value)}
                  placeholder="e.g. premium driveway with a black luxury sedan and reflective marble entrance"
                />
                <p className="mt-2 text-xs text-muted">Describe the background and physical setting behind the influencer.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Props</label>
                <Input
                  value={customSceneProps}
                  onChange={(e) => setCustomSceneProps(e.target.value)}
                  placeholder="e.g. luxury car, valet stand, subtle designer luggage"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Lighting</label>
                <Input
                  value={customSceneLighting}
                  onChange={(e) => setCustomSceneLighting(e.target.value)}
                  placeholder="e.g. glossy sunset light with premium automotive reflections"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Mood</label>
                <Input
                  value={customSceneMood}
                  onChange={(e) => setCustomSceneMood(e.target.value)}
                  placeholder="e.g. aspirational, elite, arrival energy"
                />
              </div>
              <div className="flex items-end">
                <Button
                  type="button"
                  onClick={onSaveCustomScene}
                  disabled={savingCustomScene || !customSceneLabel.trim() || !customSceneEnvironment.trim()}
                  className="w-full"
                >
                  {savingCustomScene ? 'Saving scene...' : 'Save Custom Scene'}
                </Button>
              </div>
            </div>
          </div>

          <div className="max-h-[32rem] overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {scenePresets.map((scene) => (
              <button
                key={scene.key}
                type="button"
                onClick={() => {
                  setSelectedScene(scene.key);
                  scrollToSection('images');
                }}
                className={`rounded-[var(--radius-md)] border px-4 py-4 text-left transition ${
                  selectedScene === scene.key
                    ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)]'
                    : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-text">{scene.label}</div>
                  {scene.is_system ? <Badge variant="outline">System</Badge> : <Badge variant="success">Custom</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted">{scene.description}</p>
                <div className="mt-3 grid gap-2 text-xs text-muted">
                  <div><span className="font-medium text-text">Environment:</span> {scene.environment || 'Preset environment'}</div>
                  <div><span className="font-medium text-text">Lighting:</span> {scene.lighting || 'Adaptive premium lighting'}</div>
                  <div><span className="font-medium text-text">Mood:</span> {scene.mood || 'Confident and polished'}</div>
                </div>
              </button>
            ))}
            </div>
          </div>
        </SectionCard>
          </div>

          <div ref={sectionRefs.settings} className="scroll-mt-24">
        <SectionCard
          title="Character Lock Mode"
          description="Freeze core identity and rebuild style memory without changing the persona’s face."
          icon={<Wand2 className="h-5 w-5" />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="px-5 py-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-text">Lock Character Identity</div>
                  <p className="mt-1 text-sm text-muted">When on, face structure and identity markers remain fixed across generations.</p>
                </div>
                <button
                  type="button"
                  onClick={onToggleCharacterLock}
                  className={`inline-flex h-10 w-20 shrink-0 items-center self-start rounded-full border px-1 transition sm:self-auto ${
                    draft.character_locked ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.16)]' : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]'
                  }`}
                  aria-pressed={draft.character_locked}
                >
                  <span className={`h-8 w-8 rounded-full bg-[hsl(var(--color-surface))] shadow transition ${draft.character_locked ? 'translate-x-10' : 'translate-x-0'}`} />
                </button>
              </div>
            </Card>
            <Card className="px-5 py-5">
              <div className="font-semibold text-text">Regenerate embeddings</div>
              <p className="mt-1 text-sm text-muted">Rebuild the internal style memory from your latest persona state and saved reference.</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={savePersona}>
                <RefreshCw className="mr-2 h-4 w-4" /> Rebuild Character Memory
              </Button>
            </Card>
          </div>
        </SectionCard>
          </div>
        </div>

        <div className="space-y-6 xl:sticky xl:top-24">
          <Card className="space-y-4 border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Live Character</p>
                <h2 className="mt-2 text-lg font-semibold text-text">{selectedPersona?.name ?? draft.name ?? 'New persona'}</h2>
              </div>
              {draft.character_locked ? <Badge variant="success">Locked</Badge> : <Badge variant="outline">Unlocked</Badge>}
            </div>
            <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))]">
              {generatedImage?.image_url ? (
                <img src={toAbsoluteUrl(generatedImage.image_url) ?? ''} alt="Generated influencer" className="aspect-[4/5] w-full object-cover" />
              ) : selectedPersona?.reference_image_url ? (
                <img src={toAbsoluteUrl(selectedPersona.reference_image_url) ?? ''} alt={selectedPersona.name} className="aspect-[4/5] w-full object-cover" />
              ) : (
                <div className="flex aspect-[4/5] items-center justify-center text-sm text-muted">
                  Save a persona and upload a reference to start.
                </div>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-1">
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Niche</p>
                <p className="mt-1 text-sm font-semibold text-text">{selectedPersona?.niche || draft.niche || 'Not set'}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Tone</p>
                <p className="mt-1 text-sm font-semibold text-text">{selectedPersona?.tone || draft.tone || 'Not set'}</p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-3">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Scene</p>
                <p className="mt-1 text-sm font-semibold text-text">{selectedScenePreset?.label || 'No scene selected'}</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4 border-[hsl(var(--color-border))] bg-[linear-gradient(180deg,hsl(var(--color-surface)),hsl(var(--color-elevated)))]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Outputs</p>
                <h3 className="mt-2 text-base font-semibold text-text">Content & scenes</h3>
              </div>
              <Badge variant="outline">{platform}</Badge>
            </div>
            {contentResult ? (
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
                <p className="text-sm font-semibold text-text">{contentResult.title}</p>
                <p className="mt-2 text-sm text-muted">{contentResult.intro}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {contentResult.tags.slice(0, 4).map((tag) => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4 text-sm text-muted">
                Generated captions, hooks, and CTA blocks will appear here.
              </div>
            )}
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-4">
              <p className="text-sm font-semibold text-text">Current scene preset</p>
              <p className="mt-2 text-sm text-muted">{selectedScenePreset?.description || 'Choose or create a scene to shape environment, props, and lighting.'}</p>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={imageModelPickerOpen} onClose={() => setImageModelPickerOpen(false)}>
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Model selection</p>
            <h3 className="mt-1 text-xl font-semibold text-text">Choose image model</h3>
            <p className="mt-1 text-sm text-muted">Select a render engine for the influencer visuals, then return to pose and scene controls.</p>
          </div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
            {imageModels.map((model) => {
              const active = model.key === selectedImageModel;
              return (
                <button
                  key={model.key}
                  type="button"
                  onClick={() => {
                    setSelectedImageModel(model.key);
                    setImageModelPickerOpen(false);
                  }}
                  className={`w-full rounded-[24px] border p-4 text-left transition ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.16),transparent)] shadow-soft'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] hover:bg-[hsl(var(--color-elevated))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.55)] text-[hsl(var(--color-accent))]">
                      <Sparkles className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-semibold text-text">{model.label}</p>
                        {active ? <Badge>Selected</Badge> : null}
                      </div>
                      <p className="mt-1 text-sm text-muted">{model.description}</p>
                      <p className="mt-2 text-xs text-[hsl(var(--color-accent))]">{model.frontend_hint}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
