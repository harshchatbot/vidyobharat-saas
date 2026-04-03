'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, ChevronDown, ChevronRight, ChevronUp, Download, ImageIcon, Layers3, Lock, RefreshCw, Sparkles, UserRound, Wand2 } from 'lucide-react';

import { useCredits } from '@/components/credits/CreditContext';
import { useCreditEstimator } from '@/components/credits/useCreditEstimator';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type {
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
  {
    key: 'gemini_flash_image',
    label: 'Gemini 3.1 Flash Image',
    description: 'Fast Gemini image generation for creator scenes and rapid visual testing.',
    frontend_hint: 'Best for frequent iterations and social-first influencer visuals.',
    provider: 'Google',
    badge: 'Affordable',
    logo_label: 'G',
    alias_hint: 'Previously Nano Banana',
  },
  {
    key: 'gemini_pro_image',
    label: 'Gemini 3 Pro Image',
    description: 'Premium Gemini image generation for refined persona and campaign visuals.',
    frontend_hint: 'Use this for polished brand-ready influencer outputs.',
    provider: 'Google',
    badge: 'Premium',
    logo_label: 'G',
  },
  {
    key: 'openai_image',
    label: 'OpenAI Image',
    description: 'Reliable prompt-following for premium persona visuals.',
    frontend_hint: 'Best for consistent production testing.',
    provider: 'OpenAI',
    badge: 'Premium',
    logo_label: 'O',
  },
  {
    key: 'recraft_studio',
    label: 'Recraft Studio',
    description: 'Design-forward image generation for ads, brand kits, and promotional scenes.',
    frontend_hint: 'Mapped to Recraft V4 for polished commercial compositions.',
    provider: 'Recraft',
    badge: 'Design',
    logo_label: 'R',
  },
];

const IMAGE_MODEL_PROVIDER_STYLES: Record<string, string> = {
  Google: 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]',
  OpenAI: 'bg-[hsl(var(--color-surface)/0.8)] text-text',
  Recraft: 'bg-[hsl(var(--color-danger)/0.12)] text-[hsl(var(--color-danger))]',
};

const INFLUENCER_STUDIO_CACHE_TTL_MS = 2 * 60 * 1000;

type TabKey = 'persona' | 'reference' | 'content' | 'render' | 'advanced';

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

function downloadImage(url: string | null | undefined, fallbackName: string) {
  const resolved = toAbsoluteUrl(url);
  if (!resolved || typeof document === 'undefined') return;
  const safeName = fallbackName.replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'influencer-image';
  const link = document.createElement('a');
  link.href = `/api/download?url=${encodeURIComponent(resolved)}&filename=${encodeURIComponent(`${safeName}.png`)}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
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
  const [selectedImageModel, setSelectedImageModel] = useState('gemini_flash_image');
  const [imageModelPickerOpen, setImageModelPickerOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [resolution, setResolution] = useState('1536');
  const [generatedImage, setGeneratedImage] = useState<GeneratedImage | null>(null);
  const [personaError, setPersonaError] = useState<string | null>(null);
  const [estimateErrorShown, setEstimateErrorShown] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showMobileSummary, setShowMobileSummary] = useState(false);
  const { wallet, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();
  const sectionRefs: Record<TabKey, React.RefObject<HTMLDivElement | null>> = {
    persona: useRef<HTMLDivElement>(null),
    reference: useRef<HTMLDivElement>(null),
    content: useRef<HTMLDivElement>(null),
    render: useRef<HTMLDivElement>(null),
    advanced: useRef<HTMLDivElement>(null),
  };

  const selectedPersona = useMemo(
    () => personas.find((item) => item.id === selectedPersonaId) ?? null,
    [personas, selectedPersonaId],
  );
  const selectedScenePreset = useMemo(
    () => scenePresets.find((item) => item.key === selectedScene) ?? null,
    [scenePresets, selectedScene],
  );
  const hasReferenceImage = Boolean(selectedPersona?.reference_image_url);
  const canLockIdentity = Boolean(selectedPersonaId && hasReferenceImage);
  const canGenerateImage = Boolean(
    selectedPersonaId && hasReferenceImage && (selectedPose !== 'custom' || customPose.trim()),
  );
  const canGenerateContent = Boolean(selectedPersonaId && contentIntent.trim());
  const canSaveCustomScene = Boolean(customSceneLabel.trim() && customSceneEnvironment.trim());
  const imageFlowStepClass = (state: 'active' | 'ready' | 'pending') => {
    if (state === 'active') return 'border-[hsl(var(--color-accent)/0.55)] bg-[hsl(var(--color-accent)/0.1)]';
    if (state === 'ready') return 'border-[hsl(var(--color-success)/0.35)] bg-[hsl(var(--color-success)/0.08)]';
    return 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)]';
  };
  const uploadStepState: 'active' | 'ready' | 'pending' = !selectedPersonaId || !hasReferenceImage ? 'active' : 'ready';
  const lockStepState: 'active' | 'ready' | 'pending' = hasReferenceImage && !selectedPersona?.character_locked
    ? 'active'
    : selectedPersona?.character_locked
      ? 'ready'
      : 'pending';
  const generateStepState: 'active' | 'ready' | 'pending' = canGenerateImage ? 'active' : 'pending';
  const { estimates, isEstimating, estimateError, isUsingFallback } = useCreditEstimator(
    [
      {
        key: 'content',
        action: 'influencer_content_generate',
        payload: {},
      },
      {
        key: 'reference',
        action: 'influencer_reference_lock',
        payload: {},
      },
      {
        key: 'image',
        action: 'influencer_image_generate',
        payload: { model: selectedImageModel, resolution },
      },
    ],
    { currentCredits: wallet?.currentCredits ?? 0 },
  );
  const contentEstimate = estimates.content ?? null;
  const referenceEstimate = estimates.reference ?? null;
  const imageEstimate = estimates.image ?? null;

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
    ]).then(([loadedPersonas, poses, scenes, models]) => {
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
    if (!estimateError) {
      if (estimateErrorShown) setEstimateErrorShown(null);
      return;
    }
    if (estimateErrorShown === estimateError) return;
    setEstimateErrorShown(estimateError);
    show('Could not estimate credits right now.');
  }, [estimateError, estimateErrorShown, show]);

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
    if (!selectedPersona?.reference_image_url) {
      setPersonaError('Upload a base reference image before generating persona images');
      show('Upload a base reference image before generating persona images.');
      return;
    }
    if (selectedPose === 'custom' && !customPose.trim()) {
      setPersonaError('Add a custom pose description before generating this image');
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
      scrollToSection('render');
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
    { key: 'persona', label: '1 Create Character' },
    { key: 'reference', label: '2 Reference' },
    { key: 'content', label: '3 Content' },
    { key: 'render', label: '4 Generate Visual' },
  ];

  return (
    <div className="rangmanch-page-stack">
      <LoadingOverlay
        open={loading}
        title="Preparing Influencer Studio"
        description="Loading personas, pose systems, scenes, and credit-aware generation tools."
        stepLabel="Booting character consistency engine"
        accentLabel="Influencer Studio"
      />
      <LoadingOverlay
        open={generatingImage}
        title="Generating influencer image"
        description=""
        stepLabel="Locking identity, pose, and scene consistency"
        accentLabel="Influencer Studio"
      />
      <LoadingOverlay
        open={generatingContent}
        title="Generating influencer content"
        description=""
        stepLabel="Applying persona memory and platform voice"
        accentLabel="Influencer Studio"
      />
      <StudioPageHeader
        eyebrow="Influencer Studio"
        title="Build persona-led content with a cleaner workflow"
        description="Lock identity, shape content voice, and generate campaign-ready visuals from one studio tuned for character consistency."
        actions={
          <>
            <Badge variant="outline" className="px-3 py-2 text-xs">
              {personas.length} personas
            </Badge>
            <Badge variant="outline" className="px-3 py-2 text-xs">
              {wallet?.currentCredits ?? 0} credits
            </Badge>
          </>
        }
      />

      <div className="flex gap-2 overflow-x-auto border-b border-[hsl(var(--color-border))] pb-2">
        {tabItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => scrollToSection(item.key)}
            className={`whitespace-nowrap rounded-[12px] px-3 py-1.5 text-sm font-medium transition ${
              activeTab === item.key
                ? 'bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]'
                : 'text-muted hover:bg-[hsl(var(--color-bg))] hover:text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
        <span className="font-medium text-text">Simple 4-step workflow</span>
        <span>Create the character, upload one reference, shape the content, then render.</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[hsl(var(--color-border))] pb-3">
        <p className="text-sm text-muted">Advanced controls stay available, but they are tucked away until you need them.</p>
        <Button type="button" variant="secondary" onClick={() => setShowAdvanced((current) => !current)}>
          {showAdvanced ? 'Hide Advanced' : 'Show Advanced'}
        </Button>
      </div>

      <div className="grid gap-5 xl:gap-6 2xl:grid-cols-[minmax(0,1fr)_360px] 2xl:items-start">
        <div className="space-y-5 sm:space-y-6">
          {personaError ? (
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-danger))] px-4 py-3 text-sm text-[hsl(var(--color-danger))]">
              {personaError}
            </div>
          ) : null}

          <div ref={sectionRefs.persona} className="scroll-mt-24">
        <SectionCard
          title="1. Create Character"
          description="Set the name, niche, tone, and visual identity for the influencer."
          icon={<UserRound className="h-5 w-5" />}
          compact
          action={
            selectedPersona ? (
              <Badge variant="outline">{selectedPersona.name}</Badge>
            ) : null
          }
        >
          <div className="grid gap-5 2xl:grid-cols-[250px_1fr]">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-text">Saved personas</h3>
                <Button variant="secondary" type="button" className="px-3 py-2 text-xs" onClick={() => { setSelectedPersonaId(''); setDraft(emptyDraft()); }}>
                  New
                </Button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 2xl:grid 2xl:max-h-[18rem] 2xl:grid-cols-1 2xl:overflow-visible 2xl:pb-0">
                {personas.length === 0 ? (
                  <div className="w-full rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.62)] px-4 py-4 text-sm text-muted">No persona saved yet.</div>
                ) : (
                  personas.map((persona) => (
                    <button
                      key={persona.id}
                      type="button"
                      onClick={() => syncDraftFromPersona(persona)}
                      className={`min-w-[180px] rounded-[18px] border px-4 py-3 text-left transition 2xl:min-w-0 ${
                        selectedPersonaId === persona.id
                          ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.08)]'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.56)]'
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
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Gender / Identity</label>
                  <Input
                    value={draft.gender_identity}
                    onChange={(e) => setDraft((current) => ({ ...current, gender_identity: e.target.value }))}
                    placeholder="e.g. Female founder, androgynous creator, male fitness coach"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Niche</label>
                  <Input
                    value={draft.niche}
                    onChange={(e) => setDraft((current) => ({ ...current, niche: e.target.value }))}
                    placeholder="e.g. SaaS growth, luxury real estate, wellness coaching"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Tone</label>
                  <Input
                    value={draft.tone}
                    onChange={(e) => setDraft((current) => ({ ...current, tone: e.target.value }))}
                    placeholder="e.g. polished, bold, witty, mentor-like"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-text">Core Personality</label>
                <p className="mb-3 text-xs text-muted">Choose traits that stay constant across platforms and scenes.</p>
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
                <label className="mb-2 block text-sm font-medium text-text">Visual description</label>
                <Textarea
                  rows={4}
                  value={draft.visual_description}
                  onChange={(e) => setDraft((current) => ({ ...current, visual_description: e.target.value }))}
                  placeholder="Describe face shape, hairstyle, skin tone, fashion signatures, accessories, and identity markers."
                />
                <p className="mt-2 text-xs text-muted">Be specific so future generations stay visually consistent.</p>
              </div>

              {showAdvanced ? (
                <div className="rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.42)] p-4">
                  <p className="text-sm font-semibold text-text">Advanced character memory</p>
                  <div className="mt-4 grid gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-text">Catchphrase</label>
                      <Input
                        value={draft.catchphrase}
                        onChange={(e) => setDraft((current) => ({ ...current, catchphrase: e.target.value }))}
                        placeholder="e.g. Let's build smarter, not louder."
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-text">Long-form backstory</label>
                      <Textarea
                        rows={5}
                        value={draft.backstory}
                        onChange={(e) => setDraft((current) => ({ ...current, backstory: e.target.value }))}
                        placeholder="Explain where this influencer comes from, what shaped them, and what informs their content."
                      />
                    </div>
                  </div>
                </div>
              ) : null}

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

          <div ref={sectionRefs.reference} className="scroll-mt-24">
        <SectionCard
          title="2. Reference"
          description="Upload one base face and lock identity before generating variations."
          icon={<Camera className="h-5 w-5" />}
          compact
        >
          <div className="grid gap-5 lg:grid-cols-[220px_1fr]">
            <div className="space-y-4">
              <div className="mx-auto w-full max-w-[220px] overflow-hidden rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)]">
                <div className="aspect-[3/4] bg-[hsl(var(--color-bg))]">
                  {selectedPersona?.reference_image_url ? (
                    <img src={toAbsoluteUrl(selectedPersona.reference_image_url) ?? ''} alt={selectedPersona.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center px-4 text-center text-sm text-muted">No reference uploaded</div>
                  )}
                </div>
              </div>
              <label className="inline-flex w-full cursor-pointer items-center justify-center rounded-[14px] border border-[hsl(var(--color-border))] px-4 py-2 text-sm font-medium text-text">
                {uploadingReference ? 'Uploading...' : 'Upload reference'}
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
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className={`rounded-[14px] border px-4 py-3 ${imageFlowStepClass(uploadStepState)}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">Upload</Badge>
                  {hasReferenceImage ? <Badge variant="success">Ready</Badge> : <Badge variant="outline">Required</Badge>}
                </div>
                <p className="mt-3 text-sm font-semibold text-text">Base face</p>
                <p className="mt-1 text-xs text-muted">Use one clean portrait with stable lighting.</p>
              </div>
              <div className={`rounded-[14px] border px-4 py-3 ${imageFlowStepClass(lockStepState)}`}>
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">Lock</Badge>
                  {selectedPersona?.character_locked ? <Badge variant="success">Locked</Badge> : <Badge variant="outline">Next</Badge>}
                </div>
                <p className="mt-3 text-sm font-semibold text-text">Identity</p>
                <p className="mt-1 text-xs text-muted">Freeze face structure and identity markers.</p>
              </div>
              <div className="rounded-[14px] border border-[hsl(var(--color-border))] px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <Badge variant="outline">Credits</Badge>
                  <Badge variant="outline">{referenceEstimate?.estimatedCredits ?? 0}</Badge>
                </div>
                <p className="mt-3 text-sm font-semibold text-text">Reference lock</p>
                <p className="mt-1 text-xs text-muted">One-time setup before rendering consistent visuals.</p>
              </div>
              <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={onLockReference}
                  disabled={lockingReference || !canLockIdentity}
                >
                  {lockingReference ? 'Locking...' : `Lock Identity · ${referenceEstimate?.estimatedCredits ?? 0} credits`}
                </Button>
                <p className="text-xs text-muted">Upload first, then lock once. After that you can render scenes and poses.</p>
              </div>
            </div>
          </div>
        </SectionCard>
          </div>

          <div ref={sectionRefs.content} className="scroll-mt-24">
        <SectionCard
          title="3. Content"
          description="Optional: generate platform-ready content from the saved character memory."
          icon={<Sparkles className="h-5 w-5" />}
          compact
        >
          <div className="grid gap-4">
            <div className="grid gap-4 xl:grid-cols-[1fr_220px]">
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Intent</label>
                <Textarea
                  rows={5}
                  value={contentIntent}
                  onChange={(e) => setContentIntent(e.target.value)}
                  placeholder="e.g. Create a LinkedIn post about why Indian founders should ship faster, with a motivating close and a confident CTA."
                />
                <p className="mt-2 text-xs text-muted">Describe the topic, angle, and goal. Persona memory shapes the voice.</p>
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
                <div className={`rounded-[14px] border px-4 py-3 text-sm ${canGenerateContent ? 'border-[hsl(var(--color-success)/0.28)] bg-[hsl(var(--color-success)/0.05)]' : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.56)]'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-text">Generate Content</div>
                    <span className="text-xs text-muted">{canGenerateContent ? 'Ready' : 'Add a brief'}</span>
                  </div>
                  <div className="mt-1 text-muted">
                    {contentEstimate ? `${contentEstimate.estimatedCredits} credits` : isEstimating ? 'Estimating...' : 'Unavailable'}
                  </div>
                </div>
                <Button type="button" onClick={onGenerateContent} disabled={generatingContent || !contentIntent.trim()}>
                  {`Generate Content · ${contentEstimate?.estimatedCredits ?? 0} credits`}
                </Button>
                <p className="text-xs text-muted">Skip this if you only want the visual.</p>
              </div>
            </div>
            {estimateError ? (
              <p className="text-xs text-amber-600">Could not estimate credits right now. Final validation happens during generation.</p>
            ) : null}
            {!estimateError && isUsingFallback ? (
              <p className="text-xs text-muted">Using estimated credits based on current settings.</p>
            ) : null}
            {contentResult ? (
              <div className="space-y-4 border-t border-[hsl(var(--color-border))] pt-4">
                <div className="text-sm font-semibold text-text">Output</div>
                <h3 className="mt-2 font-heading text-2xl font-bold text-text">{contentResult.title}</h3>
                <p className="mt-3 text-sm text-muted">{contentResult.intro}</p>
                <div className="mt-4 grid gap-3">
                  {contentResult.content_blocks.map((block, index) => (
                    <div key={`${block}-${index}`} className="rounded-[14px] border border-[hsl(var(--color-border))] px-4 py-3 text-sm text-text">
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
              </div>
            ) : null}
          </div>
        </SectionCard>
          </div>

          <div ref={sectionRefs.render} className="scroll-mt-24">
        <SectionCard
          title="4. Generate Visual"
          description="Choose pose, scene, and model, then generate a consistent influencer image."
          icon={<ImageIcon className="h-5 w-5" />}
          compact
        >
          <div className="grid gap-4">
            <div className={`rounded-[14px] border px-4 py-3 ${imageFlowStepClass(generateStepState)}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-text">Render readiness</p>
                  <p className="mt-1 text-xs text-muted">Reference should be uploaded and locked before rendering.</p>
                </div>
                <span className="text-xs font-medium text-muted">{canGenerateImage ? 'Ready' : 'Waiting'}</span>
              </div>
            </div>
            <div className="grid gap-4">
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Pose</label>
                  <Dropdown value={selectedPose} onChange={(e) => setSelectedPose(e.target.value)}>
                    {poseOptions.map((pose) => (
                      <option key={pose.key} value={pose.key}>{pose.label}</option>
                    ))}
                  </Dropdown>
                  <p className="mt-2 text-xs text-muted">Pose changes stance, not identity.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Scene</label>
                  <Dropdown value={selectedScene} onChange={(e) => setSelectedScene(e.target.value)}>
                    {scenePresets.map((scene) => (
                      <option key={scene.key} value={scene.key}>{scene.label}</option>
                    ))}
                  </Dropdown>
                  <p className="mt-2 text-xs text-muted">Scene changes background, lighting, and mood only.</p>
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Image model</label>
                  <button
                    type="button"
                    onClick={() => setImageModelPickerOpen(true)}
                    className="w-full rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] p-3 text-left transition hover:bg-[hsl(var(--color-elevated))]"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] text-sm font-semibold ${
                          IMAGE_MODEL_PROVIDER_STYLES[imageModels.find((model) => model.key === selectedImageModel)?.provider ?? ''] ??
                          'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                        }`}
                      >
                        {imageModels.find((model) => model.key === selectedImageModel)?.logo_label ?? <Sparkles className="h-4 w-4" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-text">
                            {imageModels.find((model) => model.key === selectedImageModel)?.label ?? 'Choose model'}
                          </p>
                        </div>
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

              <div className="space-y-3 border-t border-[hsl(var(--color-border))] pt-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Output</p>
                    <p className="mt-1 text-xs text-muted">
                      {aspectRatio} • {resolution === '1024' ? '1K' : resolution === '1536' ? '1.5K' : resolution === '2048' ? '2K' : resolution} • {imageModels.find((model) => model.key === selectedImageModel)?.label ?? 'Selected model'}
                    </p>
                  </div>
                  <span className="text-xs font-medium text-muted">{imageEstimate ? `${imageEstimate.estimatedCredits} credits` : isEstimating ? 'Estimating...' : 'Unavailable'}</span>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium text-text">Aspect ratio</p>
                  <div className="rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.2)] p-2">
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
                  <div className="rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.2)] p-2">
                    <div className="flex flex-wrap gap-2">
                      {[
                        ['1024', '1K'],
                        ['1536', '1.5K'],
                        ['2048', '2K'],
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
                  <p className="text-xs text-muted">Higher resolutions cost more but help for thumbnails and campaigns.</p>
                </div>
              </div>

              {selectedPose === 'custom' ? (
                <div>
                  <label className="mb-2 block text-sm font-medium text-text">Custom pose</label>
                  <Input
                    value={customPose}
                    onChange={(e) => setCustomPose(e.target.value)}
                    placeholder="e.g. leaning on a glass desk, one hand raised mid-explanation"
                  />
                  <p className="mt-2 text-xs text-muted">Describe body positioning only.</p>
                </div>
              ) : null}

              {selectedScenePreset ? (
                <div className="rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.5)] px-4 py-4 text-sm">
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
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Generate image</span>
                  <span className="text-xs text-muted">
                    {selectedPersona?.character_locked
                      ? 'Identity locked'
                      : !selectedPersonaId
                        ? 'Needs character'
                        : !hasReferenceImage
                          ? 'Needs reference'
                          : canGenerateImage
                            ? 'Ready'
                            : 'Needs pose detail'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="button"
                    onClick={onGenerateImage}
                    disabled={generatingImage || !selectedPersonaId || (selectedPose === 'custom' && !customPose.trim())}
                  >
                    {`Generate Image · ${imageEstimate?.estimatedCredits ?? 0} credits`}
                  </Button>
                </div>
              </div>
              {estimateError ? (
                <p className="text-xs text-amber-600">Could not estimate credits right now. Final validation happens during generation.</p>
              ) : null}
              {!estimateError && isUsingFallback ? (
                <p className="text-xs text-muted">Using estimated credits based on current settings.</p>
              ) : null}
              {!selectedPersonaId ? (
                <p className="text-xs text-muted">Save or select a persona to unlock image generation.</p>
              ) : !selectedPersona?.reference_image_url ? (
                <p className="text-xs text-muted">Upload a base reference image first so the face and identity stay consistent.</p>
              ) : null}

              {generatedImage ? (
                <div className="overflow-hidden rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.62)]">
                  <div className="mx-auto w-full max-w-[340px]">
                    <img src={toAbsoluteUrl(generatedImage.image_url) ?? ''} alt="Generated influencer" className="aspect-[4/5] w-full object-cover" />
                  </div>
                  <div className="px-4 py-4 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="font-semibold text-text">Latest influencer render</div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button type="button" variant="secondary" onClick={onGenerateImage} disabled={generatingImage}>
                          Retry
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => downloadImage(generatedImage.image_url, `${selectedPersona?.name || 'influencer'}-render`)}
                        >
                          <Download className="h-4 w-4" />
                          Download
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => generatedImage?.image_url && window.open(toAbsoluteUrl(generatedImage.image_url) ?? generatedImage.image_url, '_blank', 'noopener,noreferrer')}
                        >
                          Open
                        </Button>
                      </div>
                    </div>
                    <p className="mt-1 text-muted">{generatedImage.prompt}</p>
                    {selectedImageModel === 'gemini_flash_image' ? (
                      <p className="mt-3 text-xs text-muted">
                        Gemini 3.1 Flash Image is best for fast drafts. For stronger wardrobe realism and stricter styling consistency, retry with Gemini 3 Pro Image or OpenAI Image.
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </SectionCard>
          </div>

          {showAdvanced ? (
          <div ref={sectionRefs.advanced} className="scroll-mt-24 space-y-5 sm:space-y-6">
        <SectionCard
          title="Advanced scene library"
          description="Save and reuse custom scenes without changing the face."
          icon={<Layers3 className="h-5 w-5" />}
          compact
        >
          <div className="mb-4 border-l-2 border-[hsl(var(--color-border))] pl-4 text-sm text-muted">
            These presets define the background, lighting, and overall scene mood behind the influencer. Identity remains locked separately through the reference image and character memory.
          </div>

          <div className={`mb-4 rounded-[14px] border bg-[hsl(var(--color-surface)/0.2)] p-4 ${canSaveCustomScene ? 'border-[hsl(var(--color-success)/0.3)]' : 'border-[hsl(var(--color-border))]'}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-text">Save custom scene</p>
                <p className="mt-1 text-xs text-muted">Create reusable scene presets for future renders.</p>
              </div>
              {canSaveCustomScene ? <Badge variant="success">Ready</Badge> : <Badge variant="outline">Needs name + environment</Badge>}
            </div>
            <div className="grid gap-4 2xl:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Scene name</label>
                <Input
                  value={customSceneLabel}
                  onChange={(e) => setCustomSceneLabel(e.target.value)}
                  placeholder="e.g. Luxury car reveal"
                />
                <p className="mt-2 text-xs text-muted">Saved to the persona library.</p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-text">Environment</label>
                <Input
                  value={customSceneEnvironment}
                  onChange={(e) => setCustomSceneEnvironment(e.target.value)}
                  placeholder="e.g. premium driveway with a black luxury sedan and reflective marble entrance"
                />
                <p className="mt-2 text-xs text-muted">Describe the background and setting.</p>
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
            {!canSaveCustomScene ? (
              <p className="mt-4 text-xs text-muted">Add at least a scene name and environment to save a reusable preset.</p>
            ) : null}
          </div>

          <div className="max-h-[32rem] overflow-y-auto pr-1">
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {scenePresets.map((scene) => (
              <button
                key={scene.key}
                type="button"
                onClick={() => {
                  setSelectedScene(scene.key);
                  scrollToSection('render');
                }}
                className={`rounded-[14px] border px-4 py-4 text-left transition ${
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

        <SectionCard
          title="Advanced character controls"
          description="Use these controls when you need to rebuild or manually adjust character memory."
          icon={<Wand2 className="h-5 w-5" />}
          compact
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.56)] px-5 py-5">
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
                  <span className={`h-8 w-8 rounded-full bg-[hsl(var(--color-surface))] transition ${draft.character_locked ? 'translate-x-10' : 'translate-x-0'}`} />
                </button>
              </div>
            </div>
            <div className="rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.56)] px-5 py-5">
              <div className="font-semibold text-text">Regenerate embeddings</div>
              <p className="mt-1 text-sm text-muted">Rebuild the internal style memory from your latest persona state and saved reference.</p>
              <Button type="button" variant="secondary" className="mt-4" onClick={savePersona}>
                <RefreshCw className="mr-2 h-4 w-4" /> Rebuild Character Memory
              </Button>
            </div>
          </div>
        </SectionCard>
          </div>
          ) : null}
        </div>

        <div className="space-y-4 sm:space-y-5 2xl:sticky 2xl:top-24">
          <div className="2xl:hidden">
            <button
              type="button"
              onClick={() => setShowMobileSummary((current) => !current)}
              className="flex w-full items-center justify-between rounded-[14px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3 text-left transition hover:bg-[hsl(var(--color-surface)/0.35)]"
              aria-expanded={showMobileSummary}
            >
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Summary</p>
                <p className="mt-1 text-sm text-text">Character, scene, and output overview</p>
              </div>
              {showMobileSummary ? <ChevronUp className="h-4 w-4 text-muted" /> : <ChevronDown className="h-4 w-4 text-muted" />}
            </button>
          </div>

          <div className={`${showMobileSummary ? 'block' : 'hidden'} space-y-5 sm:space-y-6 2xl:block`}>
          <div className="space-y-3 border-l border-[hsl(var(--color-border))] pl-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Live Character</p>
                <h2 className="mt-2 text-lg font-semibold text-text">{selectedPersona?.name ?? draft.name ?? 'New persona'}</h2>
              </div>
              <span className="text-xs text-muted">{draft.character_locked ? 'Locked' : 'Unlocked'}</span>
            </div>
            <p className="text-sm text-muted">
              {selectedPersona?.reference_image_url
                ? 'Reference uploaded. Character is ready for content and render work.'
                : 'Save a persona and upload one reference image to get started.'}
            </p>
            <div className="space-y-1.5 text-sm text-muted">
              <p><span className="font-medium text-text">Niche:</span> {selectedPersona?.niche || draft.niche || 'Not set'}</p>
              <p><span className="font-medium text-text">Tone:</span> {selectedPersona?.tone || draft.tone || 'Not set'}</p>
              <p><span className="font-medium text-text">Scene:</span> {selectedScenePreset?.label || 'No scene selected'}</p>
            </div>
          </div>

          <div className="space-y-3 border-l border-[hsl(var(--color-border))] pl-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Outputs</p>
                <h3 className="mt-2 text-base font-semibold text-text">Quick summary</h3>
              </div>
              <span className="text-xs text-muted">{platform}</span>
            </div>
            {contentResult ? (
              <div className="rounded-[12px] border border-[hsl(var(--color-border))] p-3.5">
                <p className="text-sm font-semibold text-text">{contentResult.title}</p>
                <p className="mt-2 text-sm text-muted">{contentResult.intro}</p>
              </div>
            ) : (
              <div className="rounded-[12px] border border-[hsl(var(--color-border))] p-3.5 text-sm text-muted">
                Content generation is optional. You can go straight to render.
              </div>
            )}
            <div className="rounded-[12px] border border-[hsl(var(--color-border))] p-3.5">
              <p className="text-sm font-semibold text-text">Current scene preset</p>
              <p className="mt-2 text-sm text-muted">{selectedScenePreset?.description || 'Choose or create a scene to shape environment, props, and lighting.'}</p>
            </div>
          </div>
          </div>
        </div>
      </div>

      <Modal open={imageModelPickerOpen} onClose={() => setImageModelPickerOpen(false)}>
        <div className="space-y-3.5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[hsl(var(--color-accent))]">Model selection</p>
            <h3 className="mt-1 text-lg font-semibold text-text">Choose image model</h3>
            <p className="mt-1 text-xs text-muted">Select a render engine for the influencer visuals, then return to pose and scene controls.</p>
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
                  className={`w-full rounded-[16px] border px-3 py-2.5 text-left transition ${
                    active
                      ? 'border-[hsl(var(--color-accent))] bg-[linear-gradient(135deg,hsl(var(--color-accent)/0.16),transparent)]'
                      : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] hover:bg-[hsl(var(--color-elevated))]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.7)] text-xs font-semibold ${
                        IMAGE_MODEL_PROVIDER_STYLES[model.provider ?? ''] ?? 'bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]'
                      }`}
                    >
                      {model.logo_label ?? <Sparkles className="h-3.5 w-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[13px] font-semibold text-text">{model.label}</p>
                        {model.badge ? <Badge>{model.badge}</Badge> : null}
                        {active ? <Badge>Selected</Badge> : null}
                      </div>
                      <p className="mt-1 text-[11px] leading-4 text-muted">{model.description}</p>
                      {model.frontend_hint ? <p className="mt-1.5 text-[11px] text-[hsl(var(--color-accent))]">{model.frontend_hint}</p> : null}
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                        {model.provider ? <span>{model.provider}</span> : null}
                        {model.alias_hint ? <span>{model.alias_hint}</span> : null}
                      </div>
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
