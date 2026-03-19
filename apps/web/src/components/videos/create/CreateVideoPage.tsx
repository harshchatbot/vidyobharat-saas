'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BadgeIndianRupee, Clapperboard, Download, Film, GalleryVerticalEnd, Mic2, Settings2, Sparkles, Wallet, Wand2 } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Modal } from '@/components/ui/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { Textarea } from '@/components/ui/Textarea';
import { useToast } from '@/components/ui/Toast';
import { useCredits } from '@/components/credits/CreditContext';
import { useCreditEstimator } from '@/components/credits/useCreditEstimator';
import { ActiveProjectBar } from '@/components/projects/ActiveProjectBar';
import { getVideoModelMap } from '@/config/videoModels';
import creditEngine from '@/config/creditEngine';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AIVideoModel, AIVideoStatusResponse, GeneratedImage, MusicTrack, Project, TTSLanguageOption, TTSVoiceOption, Video, Template as UnifiedTemplate, TemplateInputField, TemplatePreviewResponse } from '@/types/api';

import { ASPECT_OPTIONS, AUDIO_QUALITY_OPTIONS, FALLBACK_VIDEO_MODELS, LANGUAGE_OPTIONS, RESOLUTION_DISPLAY_OPTIONS, RESOLUTION_OPTIONS, TEMPLATE_OPTIONS, VIDEO_DURATION_RULES, VIDEO_OUTPUT_RULES, VOICE_OPTIONS, type TemplateOption } from './constants';
import { GenerateButton } from './GenerateButton';
import { ModelDropdown } from './ModelDropdown';
import { MusicSelector } from './MusicSelector';
import { OutputSettings } from './OutputSettings';
import { ReferenceImagePicker } from './ReferenceImagePicker';
import { ScriptEditor } from './ScriptEditor';
import { SectionCard } from './SectionCard';
import { TemplateSelector } from './TemplateSelector';
import { VideoPreview } from './VideoPreview';
import { VoiceSelector } from './VoiceSelector';
import { getVideoLaneDefinition, VIDEO_LANES, type VideoLaneKey } from './videoLanes';

const DRAFT_VERSION = 2;
const FREE_VOICE_KEYS = new Set(['Aarav', 'Mira', 'Dev', 'Shubh', 'Priya']);
const VIDEO_STUDIO_CACHE_TTL_MS = 2 * 60 * 1000;

function sanitizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

type VideoModelKey = string;
type RenderSessionPhase = 'idle' | 'preparing' | 'queued' | 'processing' | 'success' | 'failed';

function estimateInrFromCredits(credits: number) {
  if (credits <= 0) return null;
  return Math.max(0, Math.ceil(credits * 2.5));
}

function buildTierStageLabel(phase: RenderSessionPhase, progress: number) {
  if (phase === 'preparing') return 'Preparing generation';
  if (phase === 'queued') return 'Loading assets';
  if (phase === 'processing' && progress < 72) return 'Composing scenes';
  if (phase === 'processing') return 'Rendering visuals';
  if (phase === 'success') return 'Finalizing output';
  if (phase === 'failed') return 'Closing render';
  return 'Preparing generation';
}

function normalizeTemplateOptions(field: TemplateInputField): Array<{ label: string; value: string }> {
  return (field.options || []).map((option) =>
    typeof option === 'string'
      ? { label: option, value: option }
      : { label: option.label || option.value, value: option.value },
  );
}

function buildInitialTemplateInputs(template: UnifiedTemplate | null): Record<string, string> {
  if (!template?.inputs?.length) return {};
  return Object.fromEntries(
    template.inputs.map((field) => [field.key, field.placeholder || normalizeTemplateOptions(field)[0]?.value || '']),
  );
}

const HERO_SUBTYPE_KEYS = new Set(['speakerType', 'subjectType', 'businessType', 'subtype', 'carouselType', 'productType']);

function isHeroSubtypeField(field: TemplateInputField) {
  return HERO_SUBTYPE_KEYS.has(field.key);
}

function mapCategoryToIcon(template: UnifiedTemplate) {
  const category = (template.category || '').toLowerCase();
  const subtype = (template.subcategory || '').toLowerCase();
  if (category.includes('ads') || category.includes('promo')) return Sparkles;
  if (category.includes('viral')) return Wand2;
  if (category.includes('carousel') || category.includes('cover')) return GalleryVerticalEnd;
  if (subtype.includes('histor') || subtype.includes('myth') || category.includes('explainer') || category.includes('education')) return Clapperboard;
  return Film;
}

function mapUnifiedTemplateToVideoOption(template: UnifiedTemplate): TemplateOption {
  return {
    key: template.id,
    label: template.title || template.name,
    description: template.short_description || template.description || 'Guided video workflow',
    icon: mapCategoryToIcon(template),
    scriptHint: template.script_hint || template.description || '',
    topicHint: template.topic_hint || template.short_description || template.name,
    image: template.preview_image_url || template.thumbnail_url,
    eyebrow: template.category.replace(/_/g, ' '),
    helper: template.recommended_model?.label || 'Recommended model included',
    badge: template.badge || (template.is_quick_start ? 'Quick Start' : undefined),
    defaultModelKey: template.generation_defaults?.model_key || template.recommended_model?.internal_model_key || undefined,
  };
}

const VIDEO_LANE_PROMPT_PLACEHOLDERS: Record<VideoLaneKey, { topic: string; script: string }> = {
  daily: {
    topic: 'Example: A short educational reel about why the brain uses so much energy',
    script:
      'Example: A stylized 3D animated brain glowing with electric pulses, dramatic close-up, strong first frame, vertical 9:16 reel, clean educational background, social-first motion, highly engaging short-form opener.',
  },
  creator_pro: {
    topic: 'Example: Launch reel for a premium skincare product',
    script:
      'Example: A cinematic beauty promo showing a luxury skincare bottle on wet stone, soft moving camera, elegant lighting transitions, premium brand mood, polished text-to-video composition, vertical 9:16 creator ad aesthetic.',
  },
  premium: {
    topic: 'Example: Hero launch film for a new electric car',
    script:
      'Example: A cinematic night-time reveal of a futuristic electric car emerging through rain and neon reflections, dramatic camera push, premium commercial lighting, rich motion detail, high-production flagship campaign look.',
  },
};

function mergeVideoTemplateOptions(unifiedTemplates: UnifiedTemplate[]): TemplateOption[] {
  const localMap = new Map(TEMPLATE_OPTIONS.map((item) => [item.key, item]));
  const merged: TemplateOption[] = [];
  const custom = localMap.get('custom');
  if (custom) merged.push(custom);

  const unifiedMapped = unifiedTemplates.map(mapUnifiedTemplateToVideoOption);
  const coveredLegacyKeys = new Set(unifiedTemplates.flatMap((template) => [template.id, ...(template.legacy_mappings || [])]));
  merged.push(...unifiedMapped);

  for (const option of TEMPLATE_OPTIONS) {
    if (option.key === 'custom') continue;
    if (coveredLegacyKeys.has(option.key)) continue;
    merged.push(option);
  }

  return merged;
}

function defaultTemplateEstimatePayload(
  template: UnifiedTemplate | null,
  inputs: Record<string, string>,
  modelOverride: string,
) {
  if (!template) return null;
  const defaults = template.generation_defaults || {};
  return {
    action: 'video_create' as const,
    payload: {
      model: modelOverride || defaults.model_key || template.recommended_model?.internal_model_key || 'veo3',
      resolution: defaults.resolution || '720p',
      durationSeconds: defaults.duration_seconds || 8,
      quality: defaults.quality || 'standard',
      captionsEnabled: true,
      voice: defaults.voice || 'Shubh',
      imageUrls: [],
      audioSettings: { sampleRateHz: 22050 },
      language: inputs.language || defaults.language || 'English',
    },
  };
}

function VideoLaneSelector({
  lane,
  onChange,
}: {
  lane: VideoLaneKey;
  onChange: (value: VideoLaneKey) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <div className="inline-flex min-w-full gap-2 rounded-[18px] bg-[hsl(var(--color-bg)/0.62)] p-1.5">
          {VIDEO_LANES.map((item) => {
            const active = item.key === lane;
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => onChange(item.key)}
                className={`inline-flex min-w-[132px] flex-1 items-center justify-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition ${active
                    ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]'
                    : 'bg-[hsl(var(--color-surface)/0.34)] text-muted hover:text-text'
                  }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className={`rounded-[18px] border px-4 py-3.5 ${getVideoLaneDefinition(lane).accentClassName}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <p className="text-base font-semibold text-text">{getVideoLaneDefinition(lane).label}</p>
            <p className="mt-1 text-sm text-muted">{getVideoLaneDefinition(lane).description}</p>
          </div>
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${getVideoLaneDefinition(lane).pillClassName}`}>
            {getVideoLaneDefinition(lane).shortLabel}
          </span>
        </div>
        <p className="mt-2 text-xs leading-5 text-muted">{getVideoLaneDefinition(lane).helper}</p>
      </div>
    </div>
  );
}

export function CreateVideoPage({
  userId,
  templateKey,
  initialScript,
  initialTitle,
  initialProjectId,
}: {
  userId: string;
  templateKey?: string;
  initialScript?: string;
  initialTitle?: string;
  initialProjectId?: string;
}) {
  const cacheKey = `rangmanch:video-studio:v2:${userId}`;
  const draftKey = `rangmanch-create-draft:${userId}`;
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewControlsRef = useRef<HTMLDivElement | null>(null);
  const lastTaggedScriptRef = useRef('');

  const initialTemplate = TEMPLATE_OPTIONS.find((item) => item.key === templateKey) ?? TEMPLATE_OPTIONS[0];

  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate.key);
  const [videoTemplates, setVideoTemplates] = useState<TemplateOption[]>([]);
  const [unifiedVideoTemplates, setUnifiedVideoTemplates] = useState<UnifiedTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState(initialProjectId ?? '');
  const [projectCreating, setProjectCreating] = useState(false);
  const [activeTemplateFlow, setActiveTemplateFlow] = useState<UnifiedTemplate | null>(null);
  const [templateFlowOpen, setTemplateFlowOpen] = useState(false);
  const [templateFlowInputs, setTemplateFlowInputs] = useState<Record<string, string>>({});
  const [templateFlowPromptOverride, setTemplateFlowPromptOverride] = useState('');
  const [templateFlowModelOverride, setTemplateFlowModelOverride] = useState('');
  const [templateFlowPreview, setTemplateFlowPreview] = useState<TemplatePreviewResponse | null>(null);
  const [templateFlowPreviewLoading, setTemplateFlowPreviewLoading] = useState(false);
  const [appliedHeroTemplateId, setAppliedHeroTemplateId] = useState<string | null>(null);
  const [appliedHeroTemplateInputs, setAppliedHeroTemplateInputs] = useState<Record<string, string>>({});
  const [appliedHeroTemplatePromptOverride, setAppliedHeroTemplatePromptOverride] = useState('');
  const [appliedHeroTemplateModelOverride, setAppliedHeroTemplateModelOverride] = useState('');
  const [title, setTitle] = useState(initialTitle ?? '');
  const [topic, setTopic] = useState(initialTitle ?? '');
  const [script, setScript] = useState(initialScript ?? '');
  const [scriptTags, setScriptTags] = useState<string[]>([]);
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [scriptLoading, setScriptLoading] = useState(false);

  const [language, setLanguage] = useState('English');
  const [voice, setVoice] = useState('Shubh');
  const [audioSampleRateHz, setAudioSampleRateHz] = useState(22050);
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [voicePreviewLoadingKey, setVoicePreviewLoadingKey] = useState<string | null>(null);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreviewVoiceKey, setVoicePreviewVoiceKey] = useState<string | null>(null);
  const [voicePreviewText, setVoicePreviewText] = useState(
    'Welcome to RangManch AI. Let us create something amazing for your audience today.',
  );
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>(VOICE_OPTIONS);
  const [languageOptions, setLanguageOptions] = useState<TTSLanguageOption[]>(LANGUAGE_OPTIONS);
  const previousLaneRef = useRef<VideoLaneKey>('daily');
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null);
  const [voicePreviewProvider, setVoicePreviewProvider] = useState<string | null>(null);
  const [voicePreviewResolvedVoice, setVoicePreviewResolvedVoice] = useState<string | null>(null);
  const [voicePreviewCached, setVoicePreviewCached] = useState(false);
  const [voicePreviewLimit, setVoicePreviewLimit] = useState<string | null>(null);
  const [voicePreviewMessage, setVoicePreviewMessage] = useState<string | null>(null);
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);

  const [models, setModels] = useState<AIVideoModel[]>(FALLBACK_VIDEO_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [videoLane, setVideoLane] = useState<VideoLaneKey>('daily');
  const [modelKey, setModelKey] = useState<VideoModelKey>('wan2.1_t2v_turbo');
  const [showDailyAdvanced, setShowDailyAdvanced] = useState(false);
  const activeProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([]);
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([]);
  const [referenceImageUrlInput, setReferenceImageUrlInput] = useState('');

  const [musicMode, setMusicMode] = useState<'none' | 'library' | 'upload'>('none');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [uploadedMusicUrl, setUploadedMusicUrl] = useState('');
  const [musicVolume, setMusicVolume] = useState(20);
  const [ducking, setDucking] = useState(true);
  const [musicPreviewError, setMusicPreviewError] = useState<string | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);

  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>('9:16');
  const [resolution, setResolution] = useState<'720p' | '1080p'>('720p');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [durationMode, setDurationMode] = useState<'auto' | 'custom'>('custom');
  const [durationSeconds, setDurationSeconds] = useState('8');
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [narrationEnabled, setNarrationEnabled] = useState(false);
  const [captionStyle, setCaptionStyle] = useState('Classic');

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitStartedAt, setSubmitStartedAt] = useState<number | null>(null);
  const [uiRenderProgress, setUiRenderProgress] = useState(0);
  const [renderSessionPhase, setRenderSessionPhase] = useState<RenderSessionPhase>('idle');
  const [job, setJob] = useState<Video | null>(null);
  const [jobStatus, setJobStatus] = useState<AIVideoStatusResponse | null>(null);
  const [jobResponseId, setJobResponseId] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [publishingVideoId, setPublishingVideoId] = useState<string | null>(null);
  const { wallet: creditWallet, refreshing: creditsRefreshing, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();
  const estimateErrorShownRef = useRef<string | null>(null);

  const template = videoTemplates.find((item) => item.key === selectedTemplate) ?? videoTemplates[0] ?? TEMPLATE_OPTIONS[0];
  const selectedHeroTemplate =
    unifiedVideoTemplates.find(
      (item) => item.id === selectedTemplate || (item.legacy_mappings || []).includes(selectedTemplate),
    ) ?? null;
  const subtypeFields = (activeTemplateFlow?.inputs || []).filter(isHeroSubtypeField);
  const primarySubtypeField = subtypeFields[0] ?? null;
  const remainingTemplateFlowFields = (activeTemplateFlow?.inputs || []).filter((field) => !isHeroSubtypeField(field));
  const templateFlowMissingRequired = useMemo(
    () =>
      (activeTemplateFlow?.inputs || []).filter(
        (field) => field.required && !(templateFlowInputs[field.key] || '').trim(),
      ),
    [activeTemplateFlow, templateFlowInputs],
  );
  const canApplyStructuredTemplateFlow =
    Boolean(activeTemplateFlow) &&
    templateFlowMissingRequired.length === 0 &&
    !templateFlowPreviewLoading &&
    Boolean(templateFlowPreview?.scriptPreview || templateFlowPreview?.videoPrompt || templateFlowPreview?.prompt);
  const completionToastRef = useRef<string | null>(null);
  const sharedModelMap = useMemo(() => getVideoModelMap(), []);
  const visibleTemplates = videoTemplates.filter((item) => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.label} ${item.description}`.toLowerCase().includes(query);
  });
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const laneModels = useMemo(
    () => models.filter((model) => (sharedModelMap[model.key]?.lane ?? 'creator_pro') === videoLane),
    [models, sharedModelMap, videoLane],
  );
  const visibleModels = laneModels.length > 0 ? laneModels : models;
  const selectedModel = visibleModels.find((model) => model.key === modelKey) ?? visibleModels.find((model) => model.enabled !== false) ?? visibleModels[0];
  const selectedModelDisabled = selectedModel?.enabled === false;
  const selectedLane = getVideoLaneDefinition(videoLane);
  const isDailyLane = videoLane === 'daily';
  const activeLanePromptPlaceholder = VIDEO_LANE_PROMPT_PLACEHOLDERS[videoLane].script;
  const activeLaneTopicPlaceholder = VIDEO_LANE_PROMPT_PLACEHOLDERS[videoLane].topic;
  const selectedLanguageCode =
    languageOptions.find((item) => item.label === language)?.code ??
    LANGUAGE_OPTIONS.find((item) => item.label === language)?.code ??
    'en-IN';
  const filteredVoiceOptions = voiceOptions.filter((item) =>
    item.supported_language_codes.includes(selectedLanguageCode),
  );
  const voiceProvider = FREE_VOICE_KEYS.has(voice) ? 'free' : 'sarvam';
  const durationRule = VIDEO_DURATION_RULES[modelKey];
  const estimateRequests = useMemo(
    () => [
      {
        key: 'videoCreate',
        action: 'video_create',
        payload: {
          model: modelKey,
          resolution,
          durationSeconds: Number(durationSeconds) || durationRule.defaultSeconds,
          quality,
          captionsEnabled,
          narrationEnabled,
          voice,
          provider: narrationEnabled ? undefined : 'free',
          imageUrls: selectedImageUrls,
          audioSettings: { sampleRateHz: audioSampleRateHz },
        },
      },
      {
        key: 'voicePreview',
        action: 'tts_preview',
        payload: {
          provider: voiceProvider,
          sampleRateHz: audioSampleRateHz,
          voice,
        },
      },
      {
        key: 'premiumVoicePreview',
        action: 'tts_preview',
        payload: {
          provider: 'sarvam',
          sampleRateHz: audioSampleRateHz,
          voice: 'sarvam',
        },
      },
      {
        key: 'scriptGenerate',
        action: 'script_generate',
        payload: {},
      },
      {
        key: 'scriptEnhance',
        action: 'script_enhance',
        payload: {},
      },
    ],
    [
      modelKey,
      resolution,
      durationSeconds,
      durationRule.defaultSeconds,
      quality,
      captionsEnabled,
      voice,
      narrationEnabled,
      selectedImageUrls,
      audioSampleRateHz,
      voiceProvider,
    ],
  );
  const { estimates, isEstimating, estimateError, isUsingFallback } = useCreditEstimator(estimateRequests, {
    currentCredits: creditWallet?.currentCredits ?? 0,
  });
  const creditEstimate = estimates.videoCreate ?? null;
  const voiceEstimate = estimates.voicePreview ?? null;
  const premiumVoiceEstimate = estimates.premiumVoicePreview ?? null;
  const scriptGenerateEstimate = estimates.scriptGenerate ?? null;
  const scriptEnhanceEstimate = estimates.scriptEnhance ?? null;
  const outputRule = VIDEO_OUTPUT_RULES[modelKey];
  const outputSizes = outputRule.sizes as Record<string, Record<string, string>>;
  const supportedAspects = [...outputRule.aspects] as string[];
  const supportedResolutions = [...outputRule.resolutions] as string[];
  const hasReferenceImages = selectedImageUrls.length > 0;
  const seededDuration = durationRule.seededSeconds;
  const klingMinDuration = durationRule.minSeconds;
  const klingMaxDuration = durationRule.maxSeconds;
  const availableDurations: number[] = hasReferenceImages && seededDuration
    ? [seededDuration]
    : [...durationRule.presetSeconds];
  const availableAspectRatios = ASPECT_OPTIONS.filter((option) =>
    supportedAspects.includes(option.value),
  );
  const availableResolutions = RESOLUTION_OPTIONS.filter((option) =>
    supportedResolutions.includes(option.value),
  );
  const selectedAspectDescription =
    availableAspectRatios.find((option) => option.value === aspectRatio)?.description ??
    availableAspectRatios[0]?.description ??
    '';
  const selectedResolutionDimensions =
    outputSizes[aspectRatio]?.[resolution] ??
    outputSizes[availableAspectRatios[0]?.value ?? '']?.[availableResolutions[0]?.value ?? ''] ??
    '';
  const estimatedTime = videoLane === 'premium' ? '2-5 min' : videoLane === 'creator_pro' ? '2-4 min' : '1-3 min';
  const derivedVideoEstimateCredits = useMemo(() => {
    const apiEstimated = creditEstimate?.estimatedCredits;
    if (typeof apiEstimated === 'number' && Number.isFinite(apiEstimated) && apiEstimated > 0) {
      return apiEstimated;
    }
    const aliasMap = (creditEngine.videoModelAliases ?? {}) as Record<string, string>;
    const normalizedModel = aliasMap[String(modelKey).toLowerCase()] ?? 'sora';
    const modelMultiplier = Number((creditEngine.video.modelMultiplier as Record<string, number>)[normalizedModel] ?? 0);
    const resolutionMultiplier = Number((creditEngine.video.resolutionMultiplier as Record<string, number>)[resolution] ?? 1);
    const qualityMultiplier = Number((creditEngine.video.qualityMultiplier as Record<string, number>)[quality] ?? 1);
    const baseCredits = Number(creditEngine.video.baseCredits ?? 0);
    const baseDuration = Number(creditEngine.video.baseDuration ?? 15);
    const duration = Math.max(1, Number(durationSeconds) || durationRule.defaultSeconds || 8);
    const baseRaw = baseCredits * modelMultiplier * resolutionMultiplier * (duration / Math.max(baseDuration, 1)) * qualityMultiplier;
    const base = Math.max(1, Math.ceil(baseRaw));

    let total = base;
    const provider = FREE_VOICE_KEYS.has(voice) ? 'free' : 'sarvam';
    if (narrationEnabled && provider !== 'free') {
      const voiceBase = Number(creditEngine.voice.baseCredits ?? 0);
      const providerMul = Number((creditEngine.voice.providerMultiplier as Record<string, number>)?.[provider] ?? 0);
      const sampleRateKey = audioSampleRateHz >= 48000 ? '48000' : '22050';
      const sampleRateMul = Number((creditEngine.voice.sampleRateMultiplier as Record<string, number>)?.[sampleRateKey] ?? 1);
      total += Math.max(1, Math.ceil(voiceBase * providerMul * sampleRateMul));
    }
    if (captionsEnabled) total += Number(creditEngine.fixedCosts.auto_caption ?? 0);
    if (selectedImageUrls.length > 0) total += Number(creditEngine.fixedCosts.character_consistency ?? 0);
    total += Number(creditEngine.fixedCosts.auto_tag ?? 0);
    return Number.isFinite(total) ? Math.max(0, Math.ceil(total)) : 0;
  }, [
    audioSampleRateHz,
    captionsEnabled,
    creditEstimate?.estimatedCredits,
    durationRule.defaultSeconds,
    durationSeconds,
    modelKey,
    narrationEnabled,
    quality,
    resolution,
    selectedImageUrls.length,
    voice,
  ]);
  const estimatedInr = estimateInrFromCredits(derivedVideoEstimateCredits);
  const fixedCosts = creditEngine.fixedCosts;
  const narrationCredits = narrationEnabled ? (voiceEstimate?.estimatedCredits ?? 0) : 0;
  const captionCredits = captionsEnabled ? Number(fixedCosts.auto_caption ?? 0) : 0;
  const referenceCredits = selectedImageUrls.length > 0 ? Number(fixedCosts.character_consistency ?? 0) : 0;
  const autoTagCredits = Number(fixedCosts.auto_tag ?? 0);
  const displayVideoEstimateCredits = Math.max(derivedVideoEstimateCredits, autoTagCredits > 0 ? autoTagCredits : 0);
  const addOnCreditsTotal = narrationCredits + captionCredits + referenceCredits + autoTagCredits;
  const baseGenerationCredits = Math.max(0, displayVideoEstimateCredits - addOnCreditsTotal);
  const laneHasOnlyGatedModels = laneModels.length > 0 && laneModels.every((model) => model.enabled === false);
  const handleVideoLaneChange = (nextLane: VideoLaneKey) => {
    setVideoLane(nextLane);
    const nextLaneModels = models.filter((model) => (sharedModelMap[model.key]?.lane ?? 'creator_pro') === nextLane);
    const nextEnabledModel =
      nextLaneModels.find((model) => model.enabled !== false) ??
      nextLaneModels[0] ??
      models.find((model) => model.enabled !== false) ??
      models[0];
    if (nextEnabledModel && nextEnabledModel.key !== modelKey) {
      setModelKey(nextEnabledModel.key as VideoModelKey);
    }
  };

  useEffect(() => {
    const previousLane = previousLaneRef.current;
    if (previousLane === videoLane) return;
    previousLaneRef.current = videoLane;
    if (videoLane !== 'daily') return;

    setResolution('720p');
    setQuality('standard');
    setCaptionsEnabled(false);
    setNarrationEnabled(false);
    setSelectedImageUrls([]);
    setDurationMode('custom');

    const safeDailyDurations = availableDurations.filter((value) => value === 5 || value === 8);
    const fallbackDailyDuration = safeDailyDurations[0] ?? availableDurations[0] ?? 8;
    setDurationSeconds(String(fallbackDailyDuration));
  }, [availableDurations, videoLane]);

  useEffect(() => {
    if (!isDailyLane) return;
    const safeDailyDurations = availableDurations.filter((value) => value === 5 || value === 8);
    const allowedDurations = safeDailyDurations.length > 0 ? safeDailyDurations : availableDurations;
    if (allowedDurations.length === 0) return;
    if (allowedDurations.includes(Number(durationSeconds))) return;
    setDurationSeconds(String(allowedDurations[0]));
  }, [availableDurations, durationSeconds, isDailyLane]);

  useEffect(() => {
    if (laneModels.length > 0) return;
    const fallbackLane = VIDEO_LANES.find((laneOption) =>
      models.some((model) => (sharedModelMap[model.key]?.lane ?? 'creator_pro') === laneOption.key && model.enabled !== false),
    );
    if (!fallbackLane || fallbackLane.key === videoLane) return;
    const fallbackModel = models.find(
      (model) => (sharedModelMap[model.key]?.lane ?? 'creator_pro') === fallbackLane.key && model.enabled !== false,
    );
    setVideoLane(fallbackLane.key);
    if (fallbackModel && fallbackModel.key !== modelKey) {
      setModelKey(fallbackModel.key as VideoModelKey);
    }
  }, [laneModels.length, modelKey, models, sharedModelMap, videoLane]);
  const durationError =
    durationRule.minSeconds !== undefined && durationRule.maxSeconds !== undefined
      ? (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) < (klingMinDuration ?? 3) || Number(durationSeconds) > (klingMaxDuration ?? 10)
        ? `Enter a duration between ${klingMinDuration}s and ${klingMaxDuration}s.`
        : null)
      : (!availableDurations.includes(Number(durationSeconds))
        ? `Choose one of the supported ${selectedModel.label} durations: ${availableDurations.map((value) => `${value}s`).join(', ')}.`
        : null);
  const generationOverlayVisible = renderSessionPhase === 'preparing' || renderSessionPhase === 'queued' || renderSessionPhase === 'processing';
  const overlayVisible = generationOverlayVisible || voiceTranslationLoading || initialLoading;
  const overlayTitle = initialLoading
    ? 'Preparing your studio'
    : voiceTranslationLoading
      ? 'Translating preview text'
      : renderSessionPhase === 'queued'
        ? 'Your render is in motion'
        : renderSessionPhase === 'processing'
          ? 'Generating your video'
          : 'Preparing your video';
  const overlayDescription = initialLoading
    ? ''
    : voiceTranslationLoading
      ? `Converting your preview line into ${language} so the selected voice can be auditioned accurately.`
      : `Building your ${selectedModel?.label ?? 'selected model'} render with the selected script, voice, media, and output settings.`;
  const overlayStepLabel = initialLoading
    ? 'Fetching studio data'
    : voiceTranslationLoading
      ? `Localizing text for ${language}`
      : buildTierStageLabel(renderSessionPhase, uiRenderProgress);
  const overlayAccentLabel = initialLoading
    ? 'Studio Load'
    : voiceTranslationLoading
      ? 'Language Update'
      : selectedLane.label;
  const overlayProgress = generationOverlayVisible ? Math.max(12, Math.min(96, uiRenderProgress)) : null;
  const voiceCreditMap = useMemo(() => {
    const allVoices = filteredVoiceOptions.length > 0 ? filteredVoiceOptions : voiceOptions;
    const premiumCredits = premiumVoiceEstimate?.estimatedCredits ?? null;
    return Object.fromEntries(
      allVoices.map((option) => [
        option.key,
        FREE_VOICE_KEYS.has(option.key) ? 0 : (premiumCredits ?? -1),
      ]),
    );
  }, [filteredVoiceOptions, voiceOptions, premiumVoiceEstimate]);

  useEffect(() => {
    if (!estimateError) {
      estimateErrorShownRef.current = null;
      return;
    }
    if (estimateErrorShownRef.current === estimateError) return;
    estimateErrorShownRef.current = estimateError;
    show({ title: 'Estimate unavailable', message: 'Could not estimate credits right now.', variant: 'error' });
  }, [estimateError, show]);

  useEffect(() => {
    if (initialLoading || voiceTranslationLoading) return;
    if (!generationOverlayVisible) {
      setUiRenderProgress(0);
      return;
    }

    const tick = () => {
      const elapsedSeconds = submitStartedAt ? Math.floor((Date.now() - submitStartedAt) / 1000) : 0;
      const providerProgress = renderSessionPhase === 'processing' && typeof jobStatus?.progress === 'number'
        ? Math.max(35, Math.min(95, jobStatus.progress))
        : null;

      const stageTarget = renderSessionPhase === 'preparing'
        ? Math.min(28, 12 + Math.floor(elapsedSeconds / 2))
        : renderSessionPhase === 'queued'
          ? Math.min(46, 28 + Math.floor(elapsedSeconds / 2))
          : renderSessionPhase === 'processing'
            ? Math.min(94, 46 + Math.floor(elapsedSeconds * 1.4))
            : 0;

      const target = providerProgress !== null ? Math.max(stageTarget, providerProgress) : stageTarget;

      setUiRenderProgress((current) => {
        if (target <= 0) return current;
        if (current >= target) return current;
        const delta = Math.max(1, Math.ceil((target - current) * 0.18));
        return Math.min(target, current + delta);
      });
    };

    tick();
    const interval = window.setInterval(tick, 500);
    return () => window.clearInterval(interval);
  }, [
    generationOverlayVisible,
    initialLoading,
    voiceTranslationLoading,
    renderSessionPhase,
    jobStatus?.progress,
    submitStartedAt,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as {
        ts: number;
        videoModels: AIVideoModel[];
        unifiedVideoTemplates?: UnifiedTemplate[];
        ttsCatalog: {
          voices: TTSVoiceOption[];
          languages: TTSLanguageOption[];
        } | null;
        userImages: GeneratedImage[];
        userVideos: Video[];
      };
      if (!cached.ts || Date.now() - cached.ts > VIDEO_STUDIO_CACHE_TTL_MS) return;
      const warmModels = cached.videoModels?.length ? cached.videoModels : FALLBACK_VIDEO_MODELS;
      setModels(warmModels);
      const warmUnifiedTemplates = cached.unifiedVideoTemplates ?? [];
      const warmTemplates = warmUnifiedTemplates.length > 0
        ? mergeVideoTemplateOptions(warmUnifiedTemplates)
        : TEMPLATE_OPTIONS;
      setUnifiedVideoTemplates(warmUnifiedTemplates);
      setVideoTemplates(warmTemplates);
      setSelectedTemplate((current) =>
        warmTemplates.some((item) => item.key === current)
          ? current
          : (warmTemplates[0]?.key ?? 'custom'),
      );
      setTemplatesLoading(false);
      if (cached.ttsCatalog) {
        setLanguageOptions(cached.ttsCatalog.languages.length > 0 ? cached.ttsCatalog.languages : LANGUAGE_OPTIONS);
        setVoiceOptions(cached.ttsCatalog.voices.length > 0 ? cached.ttsCatalog.voices : VOICE_OPTIONS);
      }
      setGeneratedImages(cached.userImages ?? []);
      setVideos(cached.userVideos ?? []);
      if (warmModels.length > 0) {
        setModelKey((current) =>
          warmModels.some((item) => item.key === current)
            ? current
            : ((warmModels[0].key as VideoModelKey) ?? 'sora2'),
        );
      }
      setInitialLoading(false);
    } catch {
      // ignore malformed cache
    }
  }, [cacheKey]);

  useEffect(() => {
    let cancelled = false;
    const hasWarmCache = typeof window !== 'undefined' && Boolean(window.sessionStorage.getItem(cacheKey));
    setModelsLoading(!hasWarmCache);
    setTemplatesLoading(!hasWarmCache);
    setProjectsLoading(true);
    setInitialLoading(!hasWarmCache);
    void Promise.all([
      api.listAIVideoModels(userId).catch(() => FALLBACK_VIDEO_MODELS),
      api.getTtsCatalog(userId).catch(() => null),
      api.listGeneratedImages(userId).catch(() => []),
      api.listVideos(userId).catch(() => []),
      api.listUnifiedTemplates(userId, { type: 'video', active: true }).catch(() => []),
      api.listProjects(userId).catch(() => []),
    ]).then(([videoModels, ttsCatalog, userImages, userVideos, unifiedTemplates, projectItems]) => {
      if (cancelled) return;
      setModels(videoModels.length > 0 ? videoModels : FALLBACK_VIDEO_MODELS);
      if (ttsCatalog) {
        setLanguageOptions(ttsCatalog.languages.length > 0 ? ttsCatalog.languages : LANGUAGE_OPTIONS);
        setVoiceOptions(ttsCatalog.voices.length > 0 ? ttsCatalog.voices : VOICE_OPTIONS);
      }
      setGeneratedImages(userImages);
      setVideos(userVideos);
      setUnifiedVideoTemplates(unifiedTemplates);
      setProjects(projectItems);
      setSelectedProjectId((current) => (
        current && projectItems.some((item) => item.id === current)
          ? current
          : current
      ));
      const nextTemplates = unifiedTemplates.length > 0 ? mergeVideoTemplateOptions(unifiedTemplates) : TEMPLATE_OPTIONS;
      setVideoTemplates(nextTemplates);
      setSelectedTemplate((current) =>
        nextTemplates.some((item) => item.key === current)
          ? current
          : (nextTemplates[0]?.key ?? 'custom'),
      );
      if (videoModels.length > 0) {
        setModelKey((current) =>
          videoModels.some((item) => item.key === current)
            ? current
            : ((videoModels[0].key as VideoModelKey) ?? 'sora2'),
        );
      }
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.setItem(
            cacheKey,
            JSON.stringify({
              ts: Date.now(),
              videoModels: videoModels.length > 0 ? videoModels : FALLBACK_VIDEO_MODELS,
              unifiedVideoTemplates: unifiedTemplates,
              ttsCatalog: ttsCatalog
                ? {
                  voices: ttsCatalog.voices.length > 0 ? ttsCatalog.voices : VOICE_OPTIONS,
                  languages: ttsCatalog.languages.length > 0 ? ttsCatalog.languages : LANGUAGE_OPTIONS,
                }
                : null,
              userImages,
              userVideos,
            }),
          );
        } catch {
          // ignore cache write issues
        }
      }
    }).finally(() => {
      if (!cancelled) {
        setModelsLoading(false);
        setTemplatesLoading(false);
        setProjectsLoading(false);
        setInitialLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [cacheKey, userId]);

  const createProjectFromCurrentDraft = async () => {
    setProjectCreating(true);
    try {
      const project = await api.createProject(
        {
          user_id: userId,
          title: title.trim() || topic.trim() || selectedHeroTemplate?.title || template.label || 'Untitled project',
          script: script.trim() || templateFlowPreview?.scriptPreview || template.scriptHint || '',
          language,
          voice,
          template: selectedHeroTemplate?.id || template.key,
        },
        userId,
      );
      setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
      setSelectedProjectId(project.id);
      show({ title: 'Project created', message: `${project.title} is now tracking this workflow.` });
      return project.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create a project right now.';
      show({ title: 'Project unavailable', message, variant: 'error' });
      return null;
    } finally {
      setProjectCreating(false);
    }
  };

  const ensureProjectForVideoRun = async () => {
    if (selectedProjectId) return selectedProjectId;
    if (selectedHeroTemplate && appliedHeroTemplateId) {
      return createProjectFromCurrentDraft();
    }
    return null;
  };

  useEffect(() => {
    setTemplateFlowInputs(buildInitialTemplateInputs(activeTemplateFlow));
    setTemplateFlowPromptOverride('');
    setTemplateFlowModelOverride(
      activeTemplateFlow?.generation_defaults?.model_key || activeTemplateFlow?.recommended_model?.internal_model_key || '',
    );
    setTemplateFlowPreview(null);
  }, [activeTemplateFlow]);

  useEffect(() => {
    if (!templateFlowOpen || !activeTemplateFlow) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setTemplateFlowPreviewLoading(true);
      void api
        .previewTemplate(
          {
            templateId: activeTemplateFlow.id,
            inputs: templateFlowInputs,
            promptOverride: templateFlowPromptOverride || undefined,
            modelKey: templateFlowModelOverride || undefined,
          },
          userId,
        )
        .then((result) => {
          if (!cancelled) setTemplateFlowPreview(result);
        })
        .catch((error) => {
          if (cancelled) return;
          setTemplateFlowPreview(null);
          show(error instanceof Error ? error.message : 'Failed to preview template.');
        })
        .finally(() => {
          if (!cancelled) setTemplateFlowPreviewLoading(false);
        });
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTemplateFlow, show, templateFlowInputs, templateFlowModelOverride, templateFlowOpen, templateFlowPromptOverride, userId]);

  useEffect(() => {
    const availableVoices = filteredVoiceOptions.length > 0 ? filteredVoiceOptions : voiceOptions;
    if (!availableVoices.some((item) => item.key === voice) && availableVoices[0]) {
      setVoice(availableVoices[0].key);
    }
  }, [filteredVoiceOptions, voiceOptions, voice]);

  useEffect(() => {
    if (visibleModels.length === 0) return;
    if (!visibleModels.some((item) => item.key === modelKey) && visibleModels[0]) {
      setModelKey(visibleModels.find((item) => item.enabled !== false)?.key as VideoModelKey ?? visibleModels[0].key as VideoModelKey);
    }
  }, [visibleModels, modelKey]);

  useEffect(() => {
    if (!languageOptions.some((item) => item.label === language) && languageOptions[0]) {
      setLanguage(languageOptions[0].label);
    }
  }, [languageOptions, language]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(draftKey);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (parsed.version !== DRAFT_VERSION) return;
      if (typeof parsed.selectedTemplate === 'string') setSelectedTemplate(parsed.selectedTemplate);
      if (typeof parsed.title === 'string') setTitle(parsed.title);
      if (typeof parsed.topic === 'string') setTopic(parsed.topic);
      if (typeof parsed.script === 'string') setScript(parsed.script);
      if (Array.isArray(parsed.scriptTags)) setScriptTags(sanitizeTags(parsed.scriptTags.map(String)));
      if (typeof parsed.language === 'string') setLanguage(parsed.language);
      if (typeof parsed.voice === 'string') setVoice(parsed.voice);
      if (typeof parsed.audioSampleRateHz === 'number') setAudioSampleRateHz(parsed.audioSampleRateHz);
      if (typeof parsed.voicePreviewText === 'string') setVoicePreviewText(parsed.voicePreviewText);
      if (typeof parsed.videoLane === 'string') setVideoLane(parsed.videoLane as VideoLaneKey);
      if (typeof parsed.modelKey === 'string') setModelKey(parsed.modelKey as VideoModelKey);
      if (Array.isArray(parsed.selectedImageUrls)) setSelectedImageUrls(parsed.selectedImageUrls.map(String));
      if (typeof parsed.referenceImageUrlInput === 'string') setReferenceImageUrlInput(parsed.referenceImageUrlInput);
      if (typeof parsed.musicMode === 'string') setMusicMode(parsed.musicMode as 'none' | 'library' | 'upload');
      if (typeof parsed.selectedTrackId === 'string') setSelectedTrackId(parsed.selectedTrackId);
      if (typeof parsed.uploadedMusicUrl === 'string') setUploadedMusicUrl(parsed.uploadedMusicUrl);
      if (typeof parsed.musicVolume === 'number') setMusicVolume(parsed.musicVolume);
      if (typeof parsed.ducking === 'boolean') setDucking(parsed.ducking);
      if (typeof parsed.aspectRatio === 'string') setAspectRatio(parsed.aspectRatio as '9:16' | '16:9' | '1:1');
      if (typeof parsed.resolution === 'string') setResolution(parsed.resolution as '720p' | '1080p');
      if (typeof parsed.quality === 'string') setQuality(parsed.quality as 'standard' | 'high');
      if (typeof parsed.durationMode === 'string') setDurationMode(parsed.durationMode as 'auto' | 'custom');
      if (typeof parsed.durationSeconds === 'string') setDurationSeconds(parsed.durationSeconds);
      if (typeof parsed.captionsEnabled === 'boolean') setCaptionsEnabled(parsed.captionsEnabled);
      if (typeof parsed.narrationEnabled === 'boolean') setNarrationEnabled(parsed.narrationEnabled);
      if (typeof parsed.captionStyle === 'string') setCaptionStyle(parsed.captionStyle);
    } catch {
      window.localStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const payload = {
      version: DRAFT_VERSION,
      selectedTemplate,
      title,
      topic,
      script,
      scriptTags,
      language,
      voice,
      audioSampleRateHz,
      voicePreviewText,
      videoLane,
      modelKey,
      selectedImageUrls,
      referenceImageUrlInput,
      musicMode,
      selectedTrackId,
      uploadedMusicUrl,
      musicVolume,
      ducking,
      aspectRatio,
      resolution,
      quality,
      durationMode,
      durationSeconds,
      captionsEnabled,
      narrationEnabled,
      captionStyle,
    };
    window.localStorage.setItem(draftKey, JSON.stringify(payload));
  }, [
    draftKey,
    selectedTemplate,
    title,
    topic,
    script,
    scriptTags,
    language,
    voice,
    audioSampleRateHz,
    voicePreviewText,
    videoLane,
    modelKey,
    selectedImageUrls,
    referenceImageUrlInput,
    musicMode,
    selectedTrackId,
    uploadedMusicUrl,
    musicVolume,
    ducking,
    aspectRatio,
    resolution,
    quality,
    durationMode,
    durationSeconds,
    captionsEnabled,
    narrationEnabled,
    captionStyle,
  ]);

  useEffect(() => {
    if (!script.trim() || script.trim() === lastTaggedScriptRef.current) return;
    const timeout = window.setTimeout(async () => {
      try {
        const result = await api.extractScriptTags({ script: script.trim() }, userId);
        setScriptTags(result.tags);
        lastTaggedScriptRef.current = script.trim();
      } catch {
        // Avoid noisy UI on background tagging.
      }
    }, 900);
    return () => window.clearTimeout(timeout);
  }, [script, userId]);

  useEffect(() => {
    if (!jobResponseId) return;
    let cancelled = false;
    let interval: number | null = null;
    let consecutiveFailures = 0;

    const statusToVideo = (status: AIVideoStatusResponse): Video => ({
      id: status.id,
      user_id: userId,
      title: title || 'Untitled Video',
      template: template.label,
      language,
      script,
      voice,
      aspect_ratio: status.aspectRatio,
      resolution: status.resolution,
      duration_mode: 'custom',
      duration_seconds: status.durationSeconds,
      captions_enabled: captionsEnabled,
      narration_enabled: narrationEnabled,
      caption_style: captionStyle,
      audio_sample_rate_hz: audioSampleRateHz,
      status:
        status.status === 'success'
          ? 'completed'
          : status.status === 'timed_out'
            ? 'timed_out'
            : status.status === 'provider_failed'
              ? 'provider_failed'
              : status.status === 'failed'
                ? 'failed'
                : 'processing',
      progress: status.progress ?? (status.status === 'success' ? 100 : 50),
      image_urls: selectedImageUrls,
      selected_model: status.modelKey,
      provider_name: status.provider ?? status.modelLabel,
      tts_provider: status.ttsProvider,
      tts_resolved_voice: status.ttsResolvedVoice,
      tts_provider_message: status.ttsProviderMessage,
      tts_fallback_used: status.ttsFallbackUsed,
      source_image_url: selectedImageUrls[0] ?? null,
      reference_images: selectedImageUrls,
      music_mode: musicMode,
      music_track_id: selectedTrackId || null,
      music_file_url: uploadedMusicUrl || null,
      music_volume: musicVolume,
      duck_music: ducking,
      thumbnail_url: status.thumbnailUrl,
      output_url: status.videoUrl,
      error_message: status.errorMessage,
      is_public_inspiration: false,
      moderation_status: 'draft',
      inspiration_score: 0,
      like_count: 0,
      auto_tags: status.tags,
      user_tags: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const poll = async () => {
      try {
        const status = await api.getAIVideoStatus(jobResponseId, userId);
        if (cancelled) return;
        consecutiveFailures = 0;
        setJobStatus(status);
        setSubmitError(null);
        if (status.status === 'queued') {
          setRenderSessionPhase('queued');
        } else if (status.status === 'processing') {
          setRenderSessionPhase('processing');
        }
        if (status.status === 'success') {
          setRenderSessionPhase('success');
          setUiRenderProgress(100);
          setJob((current) => current ?? statusToVideo(status));
          try {
            const fullVideo = await api.getVideo(jobResponseId, userId);
            if (!cancelled) {
              setJob(fullVideo);
              const refreshedVideos = await api.listVideos(userId).catch(() => null);
              if (!cancelled && refreshedVideos) setVideos(refreshedVideos);
            }
          } catch {
            if (!cancelled) {
              setJob((current) => current ?? statusToVideo(status));
            }
          }
          if (completionToastRef.current !== `success:${status.id}`) {
            completionToastRef.current = `success:${status.id}`;
            show({
              title: 'Your video is ready',
              message: 'Video generated successfully.',
              variant: 'success',
              actionLabel: 'View video',
              onAction: () => {
                if (typeof window !== 'undefined') {
                  window.location.href = `/videos/${status.id}`;
                }
              },
              durationMs: 4200,
            });
          }
          window.setTimeout(() => {
            if (!cancelled) setRenderSessionPhase('idle');
          }, 450);
          if (interval) window.clearInterval(interval);
        } else if (status.status === 'failed' || status.status === 'timed_out' || status.status === 'provider_failed') {
          setRenderSessionPhase('failed');
          setJob((current) => current ?? statusToVideo(status));
          const terminalMessage =
            status.errorMessage ||
            (status.status === 'timed_out'
              ? 'Generation timed out before completion.'
              : status.status === 'provider_failed'
                ? 'Video provider failed to complete generation.'
                : 'Generation failed.');
          setSubmitError(terminalMessage);
          if (completionToastRef.current !== `${status.status}:${status.id}`) {
            completionToastRef.current = `${status.status}:${status.id}`;
            show({
              title: status.status === 'timed_out' ? 'Generation timed out' : 'Video generation failed',
              message: terminalMessage,
              variant: 'error',
              durationMs: 4200,
            });
          }
          window.setTimeout(() => {
            if (!cancelled) setRenderSessionPhase('idle');
          }, 250);
          if (interval) window.clearInterval(interval);
        }
      } catch (error) {
        if (cancelled) return;
        consecutiveFailures += 1;
        if (consecutiveFailures >= 3) {
          const message = normalizeVideoCreateError(error);
          setSubmitError(message || 'Failed to refresh job status.');
          setRenderSessionPhase('failed');
          if (completionToastRef.current !== `poll:${jobResponseId}`) {
            completionToastRef.current = `poll:${jobResponseId}`;
            show({
              title: 'Unable to refresh status',
              message: message || 'Failed to refresh job status.',
              variant: 'error',
            });
          }
          window.setTimeout(() => {
            if (!cancelled) setRenderSessionPhase('idle');
          }, 250);
        }
      }
    };

    void poll();
    interval = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
    };
  }, [
    jobResponseId,
    userId,
    title,
    template.label,
    language,
    script,
    voice,
    captionsEnabled,
    captionStyle,
    audioSampleRateHz,
    selectedImageUrls,
    musicMode,
    selectedTrackId,
    uploadedMusicUrl,
    musicVolume,
    ducking,
  ]);

  useEffect(() => {
    setDurationMode('custom');
    const currentSeconds = Number(durationSeconds);
    if (hasReferenceImages && seededDuration) {
      if (currentSeconds !== seededDuration) {
        setDurationSeconds(String(seededDuration));
      }
      return;
    }

    if (durationRule.minSeconds !== undefined && durationRule.maxSeconds !== undefined) {
      const minimum = klingMinDuration ?? 3;
      const maximum = klingMaxDuration ?? 10;
      if (!Number.isFinite(currentSeconds) || currentSeconds < minimum || currentSeconds > maximum) {
        setDurationSeconds(String(durationRule.defaultSeconds));
      }
      return;
    }

    if (!availableDurations.includes(currentSeconds)) {
      setDurationSeconds(String(durationRule.defaultSeconds));
    }
  }, [modelKey, hasReferenceImages, durationSeconds, availableDurations, durationRule]);

  useEffect(() => {
    if (!availableAspectRatios.some((option) => option.value === aspectRatio)) {
      setAspectRatio(availableAspectRatios[0]?.value ?? '9:16');
    }
  }, [availableAspectRatios, aspectRatio]);

  useEffect(() => {
    if (!availableResolutions.some((option) => option.value === resolution)) {
      setResolution(availableResolutions[0]?.value ?? '1080p');
    }
  }, [availableResolutions, resolution]);

  useEffect(() => {
    if (musicMode !== 'library') return;
    if (tracks.length > 0 || tracksLoading) return;
    setTracksLoading(true);
    void api.listMusicTracks()
      .then((items) => {
        setTracks(items);
        if (!selectedTrackId && items[0]) setSelectedTrackId(items[0].id);
      })
      .catch(() => {
        setMusicPreviewError('Music library is unavailable right now.');
      })
      .finally(() => setTracksLoading(false));
  }, [musicMode, selectedTrackId, tracks, tracksLoading]);

  useEffect(() => {
    const player = previewAudioRef.current;
    if (!player) return;
    player.pause();
    player.currentTime = 0;
    setMusicPlaying(false);
  }, [selectedTrackId, musicMode]);

  const applyTemplate = (templateId: string) => {
    const unifiedTemplate = unifiedVideoTemplates.find((item) => item.id === templateId || (item.legacy_mappings || []).includes(templateId));
    if (unifiedTemplate) {
      setActiveTemplateFlow(unifiedTemplate);
      setTemplateFlowOpen(true);
      setSubmitError(null);
      setScriptError(null);
      return;
    }

    const next = videoTemplates.find((item) => item.key === templateId);
    if (!next) return;
    setAppliedHeroTemplateId(null);
    setAppliedHeroTemplateInputs({});
    setAppliedHeroTemplatePromptOverride('');
    setAppliedHeroTemplateModelOverride('');

    const previousTemplate = videoTemplates.find((item) => item.key === selectedTemplate);
    const topicLooksTemplateDriven =
      !topic.trim() || topic === previousTemplate?.topicHint || topic === previousTemplate?.label;
    const scriptLooksTemplateDriven =
      !script.trim() || script === previousTemplate?.scriptHint;

    setSelectedTemplate(next.key);

    if (next.key === 'custom') {
      setTopic('');
      setScript('');
      setTitle('');
    } else {
      if (topicLooksTemplateDriven) {
        setTopic(next.topicHint);
      }
      if (scriptLooksTemplateDriven) {
        setScript(next.scriptHint);
      }
      if (!title.trim() || title === previousTemplate?.topicHint) {
        setTitle(next.topicHint);
      }
    }

    if (next.defaultModelKey) {
      setModelKey(next.defaultModelKey as VideoModelKey);
    }

    setSubmitError(null);
    setScriptError(null);
  };

  const openTemplateBrowser = () => {
    const mappedSelectedTemplate = unifiedVideoTemplates.find(
      (item) => item.id === selectedTemplate || (item.legacy_mappings || []).includes(selectedTemplate),
    );
    const nextTemplate = activeTemplateFlow ?? selectedHeroTemplate ?? mappedSelectedTemplate ?? unifiedVideoTemplates[0] ?? null;

    if (!nextTemplate) {
      show({
        title: 'Templates still loading',
        message: 'Please wait a moment and try again.',
        variant: 'error',
      });
      return;
    }

    setActiveTemplateFlow(nextTemplate);
    setTemplateFlowOpen(true);
  };

  const activeTemplateEstimatePayload = defaultTemplateEstimatePayload(
    activeTemplateFlow,
    templateFlowInputs,
    templateFlowModelOverride,
  );
  const { estimates: templateFlowEstimates } = useCreditEstimator(
    activeTemplateEstimatePayload
      ? [{ key: 'templateCreate', action: activeTemplateEstimatePayload.action, payload: activeTemplateEstimatePayload.payload }]
      : [],
    { currentCredits: creditWallet?.currentCredits ?? 0 },
  );
  const templateFlowEstimate = templateFlowEstimates.templateCreate ?? null;

  const previewAppliedHeroTemplate = async (scriptOverride?: string) => {
    if (!selectedHeroTemplate || !appliedHeroTemplateId) return null;
    return api.previewTemplate(
      {
        templateId: appliedHeroTemplateId,
        inputs: appliedHeroTemplateInputs,
        promptOverride: (scriptOverride ?? appliedHeroTemplatePromptOverride) || undefined,
        modelKey: appliedHeroTemplateModelOverride || undefined,
      },
      userId,
    );
  };

  const applyStructuredTemplateFlow = () => {
    if (!activeTemplateFlow) return;
    if (templateFlowMissingRequired.length > 0) {
      show({
        title: 'Complete template inputs',
        message: `Fill ${templateFlowMissingRequired.map((field) => field.label).join(', ')} before applying this workflow.`,
        variant: 'error',
      });
      return;
    }
    if (!templateFlowPreview?.scriptPreview && !templateFlowPreview?.videoPrompt && !templateFlowPreview?.prompt) {
      show({
        title: 'Preview not ready',
        message: 'Wait for the guided preview to assemble before applying this template.',
        variant: 'error',
      });
      return;
    }
    const next = videoTemplates.find((item) => item.key === activeTemplateFlow.id) ?? mapUnifiedTemplateToVideoOption(activeTemplateFlow);
    const derivedTopic =
      templateFlowInputs.topic ||
      templateFlowInputs.productOrService ||
      templateFlowInputs.speakerName ||
      templateFlowInputs.subjectName ||
      templateFlowInputs.businessType ||
      activeTemplateFlow.topic_hint ||
      activeTemplateFlow.title ||
      activeTemplateFlow.name;
    const derivedLanguage =
      templateFlowInputs.language || activeTemplateFlow.generation_defaults?.language || language;
    const derivedVoice =
      templateFlowInputs.voiceStyle || activeTemplateFlow.generation_defaults?.voice || voice;
    const assembledScript =
      templateFlowPromptOverride ||
      templateFlowPreview?.scriptPreview ||
      templateFlowPreview?.videoPrompt ||
      templateFlowPreview?.prompt ||
      '';

    setSelectedTemplate(next.key);
    setTopic(derivedTopic);
    if (!title.trim() || title === template.topicHint || title === template.label) {
      setTitle(derivedTopic);
    } else {
      setTitle(derivedTopic);
    }
    setScript(assembledScript);
    setLanguage(derivedLanguage);
    setVoice(derivedVoice);

    const recommendedModelKey =
      templateFlowModelOverride ||
      activeTemplateFlow.generation_defaults?.model_key ||
      activeTemplateFlow.recommended_model?.internal_model_key ||
      next.defaultModelKey;
    if (recommendedModelKey) {
      setModelKey(recommendedModelKey as VideoModelKey);
    }

    if (activeTemplateFlow.generation_defaults?.resolution && RESOLUTION_OPTIONS.some((item) => item.value === activeTemplateFlow.generation_defaults?.resolution)) {
      setResolution(activeTemplateFlow.generation_defaults.resolution as '720p' | '1080p');
    }
    if (activeTemplateFlow.generation_defaults?.quality && ['standard', 'high'].includes(activeTemplateFlow.generation_defaults.quality)) {
      setQuality(activeTemplateFlow.generation_defaults.quality as 'standard' | 'high');
    }
    if (
      activeTemplateFlow.generation_defaults?.aspect_ratio &&
      ['9:16', '16:9', '1:1'].includes(activeTemplateFlow.generation_defaults.aspect_ratio)
    ) {
      setAspectRatio(activeTemplateFlow.generation_defaults.aspect_ratio as '9:16' | '16:9' | '1:1');
    }
    if (activeTemplateFlow.generation_defaults?.duration_seconds) {
      setDurationSeconds(String(activeTemplateFlow.generation_defaults.duration_seconds));
    }

    setAppliedHeroTemplateId(activeTemplateFlow.id);
    setAppliedHeroTemplateInputs(templateFlowInputs);
    setAppliedHeroTemplatePromptOverride(templateFlowPromptOverride);
    setAppliedHeroTemplateModelOverride(templateFlowModelOverride);
    setTemplateFlowOpen(false);
    setActiveTemplateFlow(null);
    show({
      title: 'Guided template applied',
      message: `${activeTemplateFlow.title || activeTemplateFlow.name} is now driving the script and defaults in this studio.`,
      variant: 'success',
    });
  };

  const generateScript = async () => {
    const hasScriptInput = script.trim().length > 0;
    const effectiveTemplate = selectedTemplate === 'custom' ? 'General' : template.label;
    const effectiveTopic = topic.trim() || (selectedTemplate === 'custom' ? 'General creator video concept' : template.topicHint);

    setScriptLoading(true);
    setScriptError(null);
    try {
      if (selectedHeroTemplate && appliedHeroTemplateId) {
        const preview = await previewAppliedHeroTemplate(hasScriptInput ? script.trim() : undefined);
        if (!preview) throw new Error('Template preview unavailable.');
        const nextScript = preview.scriptPreview || preview.videoPrompt || preview.prompt;
        if (!nextScript?.trim()) throw new Error('Template preview returned no script.');
        setScript(nextScript);
        setScriptTags(sanitizeTags([selectedHeroTemplate.category, selectedHeroTemplate.subcategory || '', ...(selectedHeroTemplate.suggested_platforms || [])]));
        setTitle(preview.title || effectiveTopic);
        return;
      }
      const result = hasScriptInput
        ? await api.enhanceScriptV2(
          {
            script: script.trim(),
            template: effectiveTemplate,
            language,
          },
          userId,
        )
        : await api.generateScriptV2(
          {
            template: effectiveTemplate,
            topic: effectiveTopic,
            language,
          },
          userId,
        );
      setScript(result.script);
      setScriptTags(result.tags);
      if (topic.trim()) {
        setTitle(topic.trim());
      } else if (!title.trim()) {
        setTitle(effectiveTopic);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate script.';
      setScriptError(message);
      show({ title: 'Script generation failed', message, variant: 'error', durationMs: 5200 });
    } finally {
      setScriptLoading(false);
    }
  };

  const enhanceScript = async () => {
    if (!script.trim()) {
      setScriptError('Write a script first.');
      return;
    }
    setScriptLoading(true);
    setScriptError(null);
    try {
      if (selectedHeroTemplate && appliedHeroTemplateId) {
        const preview = await previewAppliedHeroTemplate(script.trim());
        if (!preview) throw new Error('Template preview unavailable.');
        const nextScript = preview.scriptPreview || preview.videoPrompt || preview.prompt;
        if (!nextScript?.trim()) throw new Error('Template preview returned no script.');
        setScript(nextScript);
        setScriptTags(sanitizeTags([selectedHeroTemplate.category, selectedHeroTemplate.subcategory || '', ...(selectedHeroTemplate.suggested_platforms || [])]));
        if (preview.title) setTitle(preview.title);
        return;
      }
      const result = await api.enhanceScriptV2({ script: script.trim(), template: template.label, language }, userId);
      setScript(result.script);
      setScriptTags(result.tags);
      if (topic.trim()) setTitle(topic.trim());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to enhance script.';
      setScriptError(message);
      show({ title: 'Script enhancement failed', message, variant: 'error', durationMs: 5200 });
    } finally {
      setScriptLoading(false);
    }
  };

  const previewVoice = async (previewVoiceKey?: string) => {
    const activeVoice = previewVoiceKey ?? voice;
    const previewText = voicePreviewText.trim();
    const player = voicePreviewAudioRef.current;
    const scrollToVoicePreviewControls = () => {
      if (!voicePreviewControlsRef.current) return;
      voicePreviewControlsRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    if (!previewText) {
      const message = 'Please add some text in Preview Text before trying voice preview.';
      setVoicePreviewError(message);
      setVoicePreviewMessage(null);
      show(message);
      return;
    }
    if (previewVoiceKey && previewVoiceKey !== voice) {
      setVoice(previewVoiceKey);
    }
    if (
      player &&
      voicePreviewUrl &&
      voicePreviewVoiceKey === activeVoice &&
      !voicePreviewing
    ) {
      try {
        await player.play();
        setVoicePreviewing(true);
        setVoicePreviewError(null);
        setVoicePreviewMessage(null);
        return;
      } catch (playError) {
        const message = playError instanceof Error
          ? `Preview is ready. Tap play below if your browser blocks autoplay. ${playError.message}`
          : 'Preview is ready. Tap play below if your browser blocks autoplay.';
        setVoicePreviewError(null);
        setVoicePreviewMessage(message);
        show(message);
      }
    }
    if (voicePreviewing) {
      player?.pause();
      if (player) player.currentTime = 0;
      setVoicePreviewing(false);
      if (!previewVoiceKey || activeVoice === voice) {
        return;
      }
    }
    setVoicePreviewError(null);
    setVoicePreviewProvider(null);
    setVoicePreviewResolvedVoice(null);
    setVoicePreviewMessage(null);
    setVoicePreviewUrl(null);
    setVoicePreviewVoiceKey(null);
    setVoicePreviewLoadingKey(activeVoice);
    try {
      const response = await api.previewTts(
        {
          text: previewText,
          language,
          voice: activeVoice,
          sample_rate_hz: audioSampleRateHz,
        },
        userId,
      );
      const player = voicePreviewAudioRef.current;
      if (!player) return;
      const nextPreviewUrl = response.preview_url.startsWith('http') ? response.preview_url : `${API_URL}${response.preview_url}`;
      setVoicePreviewUrl(nextPreviewUrl);
      setVoicePreviewVoiceKey(activeVoice);
      player.pause();
      player.removeAttribute('src');
      player.load();
      player.src = nextPreviewUrl;
      player.currentTime = 0;
      player.load();
      setVoicePreviewProvider(response.provider);
      setVoicePreviewResolvedVoice(response.resolved_voice);
      setVoicePreviewCached(response.cached);
      setVoicePreviewLimit(response.preview_limit);
      setVoicePreviewMessage(
        response.provider_message ??
        (response.provider === 'Fallback TTS'
          ? 'Sarvam preview was not used for this sample. Check the API server log or provider configuration.'
          : null),
      );
      if (response.provider === 'Fallback TTS' && response.provider_message) {
        show(response.provider_message);
      }
      if (typeof response.remaining_credits === 'number' && creditWallet) {
        applyWallet({ ...creditWallet, currentCredits: response.remaining_credits });
      }
      if (response.applied_credits > 0) {
        show(`Created! Credits Used: ${response.applied_credits} · Remaining Balance: ${response.remaining_credits ?? creditWallet?.currentCredits ?? 0}`);
      }
      window.setTimeout(scrollToVoicePreviewControls, 60);
      try {
        const playResult = player.play();
        if (playResult instanceof Promise) {
          await playResult;
        }
        setVoicePreviewing(true);
        setVoicePreviewMessage(null);
      } catch (playError) {
        const message = playError instanceof Error
          ? `Preview audio is ready. Tap play below if autoplay was blocked. ${playError.message}`
          : 'Preview audio is ready. Tap play below if autoplay was blocked.';
        setVoicePreviewError(null);
        setVoicePreviewMessage(message);
        show(message);
        setVoicePreviewing(false);
        window.setTimeout(scrollToVoicePreviewControls, 60);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Voice preview failed.';
      setVoicePreviewError(message);
      setVoicePreviewLimit('20 uncached previews / 10 min · 280 chars max');
      setVoicePreviewing(false);
      show({ title: 'Voice preview failed', message, variant: 'error', durationMs: 5200 });
    } finally {
      setVoicePreviewLoadingKey(null);
    }
  };

  const handleVoiceChange = (nextVoice: string) => {
    setVoice(nextVoice);
  };

  const handleLanguageChange = async (nextLanguage: string) => {
    if (nextLanguage === language) return;
    const previousLanguage = language;
    const sourceText = voicePreviewText.trim();
    setLanguage(nextLanguage);
    if (!sourceText) return;
    setVoiceTranslationLoading(true);
    setVoicePreviewError(null);
    setVoicePreviewMessage(null);
    try {
      const result = await api.translateScriptText(
        {
          text: sourceText,
          target_language: nextLanguage,
        },
        userId,
      );
      const translated = (result.text || '').trim();
      if (!translated) {
        setVoicePreviewError('Translation returned empty text. Please try again.');
        setLanguage(previousLanguage);
        return;
      }
      setVoicePreviewText(translated);
      if (translated.toLowerCase() === sourceText.toLowerCase()) {
        const unchangedMessage = `Preview text stayed unchanged after translation to ${nextLanguage}.`;
        setVoicePreviewMessage(unchangedMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Preview text translation failed.';
      setVoicePreviewError(message);
      show({ title: 'Preview text translation failed', message, variant: 'error', durationMs: 5200 });
      setLanguage(previousLanguage);
    } finally {
      setVoiceTranslationLoading(false);
    }
  };

  const playExistingVoicePreview = async () => {
    const player = voicePreviewAudioRef.current;
    if (!player || !voicePreviewUrl) return;
    try {
      const playResult = player.play();
      if (playResult instanceof Promise) {
        await playResult;
      }
      setVoicePreviewing(true);
      setVoicePreviewError(null);
      setVoicePreviewMessage(null);
    } catch (error) {
      const message = error instanceof Error
        ? `Preview is ready, but playback is still blocked. Use the audio controls directly. ${error.message}`
        : 'Preview is ready, but playback is still blocked. Use the audio controls directly.';
      setVoicePreviewError(null);
      setVoicePreviewMessage(message);
      show(message);
    }
  };

  const toggleImageSelection = (url: string) => {
    setSelectedImageUrls((current) => current.includes(url) ? current.filter((item) => item !== url) : [...current, url]);
  };

  const moveImage = (index: number, direction: 'up' | 'down') => {
    setSelectedImageUrls((current) => {
      const target = direction === 'up' ? index - 1 : index + 1;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const addReferenceImageUrl = () => {
    const value = referenceImageUrlInput.trim();
    if (!value) return;
    setSelectedImageUrls((current) => current.includes(value) ? current : [...current, value]);
    setReferenceImageUrlInput('');
  };

  const toggleMusicPreview = async () => {
    const player = previewAudioRef.current;
    if (!player) return;
    if (musicPlaying) {
      player.pause();
      player.currentTime = 0;
      setMusicPlaying(false);
      return;
    }
    try {
      await player.play();
      setMusicPlaying(true);
      setMusicPreviewError(null);
    } catch {
      setMusicPreviewError('Preview could not be played.');
      setMusicPlaying(false);
    }
  };

  const validate = () => {
    if (!script.trim()) return 'Script is required.';
    if (!voice) return 'Voice is required.';
    if (durationError) return durationError;
    if (musicMode === 'library' && !selectedTrackId) return 'Select a library track.';
    if (musicMode === 'upload' && !uploadedMusicUrl.trim()) return 'Provide a hosted music URL.';
    return null;
  };

  const normalizeVideoCreateError = (error: unknown): string => {
    if (error instanceof Error) {
      const lowered = error.message.toLowerCase();
      if (lowered.includes('authentication required') || lowered.includes('invalid or expired auth token')) {
        return 'Session expired. Please log in again.';
      }
      if (lowered.includes('timed out') || lowered.includes('timeout')) {
        return 'Generation timed out. Please try again.';
      }
      if (lowered.includes('provider') || lowered.includes('moderation') || lowered.includes('openai') || lowered.includes('gemini') || lowered.includes('kling')) {
        return `Provider failed: ${error.message}`;
      }
      if (lowered.includes('network request failed')) {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          return 'Network issue detected. Please check your internet connection.';
        }
        return 'Network issue while creating the video job. Please retry.';
      }
      return error.message;
    }
    return 'Failed to create video job.';
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      show({ title: 'Check your inputs', message: validationError, variant: 'error' });
      return;
    }
    if (!window.confirm('Generate this video now? Credits will be charged only if generation succeeds.')) {
      return;
    }

    setSubmitting(true);
    setSubmitStartedAt(Date.now());
    setUiRenderProgress(12);
    setRenderSessionPhase('preparing');
    setSubmitError(null);
    setJob(null);
    setJobStatus(null);
    completionToastRef.current = null;

    try {
      const projectId = await ensureProjectForVideoRun();
      const result = await api.createAIVideo({
        template: template.label,
        templateId: selectedHeroTemplate?.id || appliedHeroTemplateId || undefined,
        script: script.trim(),
        tags: scriptTags,
        modelKey,
        modeId: videoLane,
        projectId: projectId || undefined,
        language,
        voice,
        imageUrls: selectedImageUrls,
        music: {
          type: musicMode,
          url: musicMode === 'library'
            ? (selectedTrack?.preview_url ?? null)
            : musicMode === 'upload'
              ? uploadedMusicUrl.trim()
              : null,
        },
        audioSettings: {
          volume: musicVolume,
          ducking,
          sampleRateHz: audioSampleRateHz,
        },
        aspectRatio,
        resolution,
        quality,
        durationMode: 'custom',
        durationSeconds: Number(durationSeconds),
        captionsEnabled,
        narrationEnabled,
        captionStyle: captionStyle.toLowerCase(),
      }, userId);
      if (typeof result.remainingCredits === 'number') {
        if (creditWallet) {
          applyWallet({ ...creditWallet, currentCredits: result.remainingCredits });
        } else {
          void refreshCredits();
        }
      }
      setRenderSessionPhase('queued');
      show({
        title: 'Render started',
        message: `Credits reserved: ${result.appliedCredits}. Remaining balance: ${result.remainingCredits ?? creditWallet?.currentCredits ?? 0}.`,
        variant: 'info',
        durationMs: 3200,
      });
      setJobResponseId(result.id);
    } catch (error) {
      const message = normalizeVideoCreateError(error);
      setSubmitError(message);
      setRenderSessionPhase('failed');
      show({ title: 'Could not start video generation', message, variant: 'error', durationMs: 4200 });
      window.setTimeout(() => setRenderSessionPhase('idle'), 250);
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    if (!jobResponseId) return;
    setJob(null);
    setJobStatus(null);
    void submit();
  };

  const toAssetUrl = (url: string | null | undefined) => {
    if (!url) return null;
    return url.startsWith('http://') || url.startsWith('https://') ? url : `${API_URL}${url}`;
  };

  const downloadVideo = async (videoItem: Video) => {
    const videoUrl = toAssetUrl(videoItem.output_url);
    if (!videoUrl) return;
    const safeName = (videoItem.title || 'video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'video';
    const link = document.createElement('a');
    link.href = `/api/download?url=${encodeURIComponent(videoUrl)}&filename=${encodeURIComponent(`${safeName}.mp4`)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const togglePublishVideo = async (videoItem: Video) => {
    setPublishingVideoId(videoItem.id);
    try {
      const next = await api.publishInspiration('video', videoItem.id, !videoItem.is_public_inspiration, userId);
      setVideos((current) =>
        current.map((item) =>
          item.id === videoItem.id
            ? {
              ...item,
              is_public_inspiration: next.is_public_inspiration,
              moderation_status: next.moderation_status,
              inspiration_score: next.inspiration_score,
              like_count: next.like_count,
            }
            : item,
        ),
      );
      show(
        next.is_public_inspiration
          ? `Submitted to inspiration. Moderation: ${next.moderation_status.replace('_', ' ')}`
          : 'Removed from inspiration.',
      );
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to update inspiration visibility.');
    } finally {
      setPublishingVideoId(null);
    }
  };

  return (
    <div className="rangmanch-page-stack">
      <LoadingOverlay
        open={overlayVisible}
        title={overlayTitle}
        description={overlayDescription}
        stepLabel={overlayStepLabel}
        accentLabel={overlayAccentLabel}
        progress={overlayProgress ?? undefined}
      />

      <StudioPageHeader
        eyebrow="Video Studio"
        title="Create videos in one compact studio"
        description="Write, guide, and render from the same workspace. Daily reels, creator outputs, references, and final preview stay connected."
        actions={
          <>
            <Badge variant="outline" className="px-3 py-2 text-xs">
              {creditWallet?.currentCredits ?? 0} credits
              {creditsRefreshing ? ' · refreshing' : ''}
            </Badge>
            <Badge variant="outline" className="px-3 py-2 text-xs">
              {getVideoLaneDefinition(videoLane).label}
            </Badge>
          </>
        }
      />
      {activeProject ? (
        <ActiveProjectBar
          project={activeProject}
          description="This video workflow is attached to the active project. New renders, prompt changes, and guided template runs will stay grouped there."
        />
      ) : null}

      {selectedHeroTemplate && appliedHeroTemplateId ? (
        <Card className="border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-elevated)/0.22)] px-4 py-3 shadow-soft backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Guided workflow active</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-text">{selectedHeroTemplate.title || selectedHeroTemplate.name}</p>
                {Object.values(appliedHeroTemplateInputs)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((value) => (
                    <span
                      key={value}
                      className="inline-flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.52)] px-2.5 py-1 text-[11px] font-medium text-muted"
                    >
                      {value}
                    </span>
                  ))}
              </div>
              <p className="mt-1 text-xs text-muted">This template assembled your script and defaults. You can still edit the script, model, and output settings below.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  setActiveTemplateFlow(selectedHeroTemplate);
                  setTemplateFlowInputs(appliedHeroTemplateInputs);
                  setTemplateFlowPromptOverride(appliedHeroTemplatePromptOverride);
                  setTemplateFlowModelOverride(appliedHeroTemplateModelOverride);
                  setTemplateFlowOpen(true);
                }}
              >
                Edit questions
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setAppliedHeroTemplateId(null);
                  setAppliedHeroTemplateInputs({});
                  setAppliedHeroTemplatePromptOverride('');
                  setAppliedHeroTemplateModelOverride('');
                }}
              >
                Clear template
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="rounded-[28px] border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.34)] p-3.5 shadow-soft backdrop-blur-md sm:p-4 md:p-5">
      <div className="grid gap-3.5 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <div className="min-w-0 space-y-3">
          {isDailyLane ? (
            <>
              <SectionCard
                title="Prompt"
                description="Describe the reel scene, motion, and vibe."
                icon={<Wand2 className="h-5 w-5" />}
                compact
              >
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Prompt</label>
                  <Textarea
                    value={script}
                    onChange={(event) => setScript(event.target.value)}
                    placeholder={activeLanePromptPlaceholder}
                    rows={6}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title="Video Lane & Model"
                description="Quick reel settings"
                icon={<Sparkles className="h-5 w-5" />}
                compact
                action={(
                  <Button variant="ghost" type="button" onClick={() => setShowDailyAdvanced((current) => !current)} className="text-xs">
                    {showDailyAdvanced ? 'Hide advanced' : 'Show advanced'}
                  </Button>
                )}
              >
                <div className="space-y-4">
                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Lane</label>
                      <Dropdown value={videoLane} onChange={(event) => handleVideoLaneChange(event.target.value as VideoLaneKey)}>
                        {VIDEO_LANES.map((lane) => (
                          <option key={lane.key} value={lane.key}>
                            {lane.label}
                          </option>
                        ))}
                      </Dropdown>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Model</label>
                      <Dropdown value={modelKey} onChange={(event) => setModelKey(event.target.value)}>
                        {visibleModels.map((model) => (
                          <option key={model.key} value={model.key} disabled={model.enabled === false}>
                            {model.shortLabel ?? model.label}
                          </option>
                        ))}
                      </Dropdown>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Duration</label>
                      <Dropdown value={durationSeconds} onChange={(event) => setDurationSeconds(event.target.value)}>
                        {(availableDurations.filter((value) => value === 5 || value === 8).length > 0
                          ? availableDurations.filter((value) => value === 5 || value === 8)
                          : availableDurations
                        ).map((duration) => (
                          <option key={duration} value={String(duration)}>
                            {duration}s
                          </option>
                        ))}
                      </Dropdown>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Format</label>
                      <Dropdown value={aspectRatio} onChange={(event) => setAspectRatio(event.target.value as '9:16' | '16:9' | '1:1')}>
                        {availableAspectRatios.map((aspect) => (
                          <option key={aspect.value} value={aspect.value}>
                            {aspect.label}
                          </option>
                        ))}
                      </Dropdown>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Resolution</label>
                      <Dropdown value={resolution} onChange={(event) => setResolution(event.target.value as '720p' | '1080p')}>
                        {availableResolutions.map((res) => (
                          <option key={res.value} value={res.value}>
                            {res.label}
                          </option>
                        ))}
                      </Dropdown>
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setNarrationEnabled((current) => !current)}
                      className={`rounded-[14px] border px-3 py-2 text-left text-xs font-medium transition ${
                        narrationEnabled
                          ? 'border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.14)] text-text'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] text-muted'
                      }`}
                    >
                      Voice {narrationEnabled ? 'AI voice' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptionsEnabled((current) => !current)}
                      className={`rounded-[14px] border px-3 py-2 text-left text-xs font-medium transition ${
                        captionsEnabled
                          ? 'border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.14)] text-text'
                          : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] text-muted'
                      }`}
                    >
                      Captions {captionsEnabled ? 'Auto captions' : 'Off'}
                    </button>
                  </div>

                  <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.56)] p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Estimate</p>
                    <div className="mt-2 space-y-1.5 text-sm">
                      <div className="flex items-center justify-between text-text">
                        <span>Base generation</span>
                        <span>{baseGenerationCredits} credits</span>
                      </div>
                      {narrationEnabled ? (
                        <div className="flex items-center justify-between text-muted">
                          <span>AI voice</span>
                          <span>{narrationCredits} credits</span>
                        </div>
                      ) : null}
                      {captionsEnabled ? (
                        <div className="flex items-center justify-between text-muted">
                          <span>Captions</span>
                          <span>{captionCredits} credits</span>
                        </div>
                      ) : null}
                      {selectedImageUrls.length > 0 ? (
                        <div className="flex items-center justify-between text-muted">
                          <span>Reference image consistency</span>
                          <span>{referenceCredits} credits</span>
                        </div>
                      ) : null}
                      <div className="flex items-center justify-between text-muted">
                        <span>Auto tag</span>
                        <span>{autoTagCredits} credits</span>
                      </div>
                      <div className="mt-1 flex items-center justify-between border-t border-[hsl(var(--color-border)/0.7)] pt-2 font-semibold text-text">
                        <span>Total</span>
                        <span>{displayVideoEstimateCredits} credits</span>
                      </div>
                    </div>
                  </div>
                  {estimateError ? (
                    <p className="text-xs text-amber-600">
                      Live estimate sync is delayed. Showing fallback estimate from current settings.
                    </p>
                  ) : null}
                </div>
              </SectionCard>
            </>
          ) : null}


          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Content Template"
            description="Template"
            icon={<Film className="h-5 w-5" />}
            compact
            action={(
              <Button variant="secondary" type="button" onClick={openTemplateBrowser} className="gap-2 px-3 py-2 text-xs">
                <GalleryVerticalEnd className="h-3.5 w-3.5" />
                Browse
              </Button>
            )}
          >
            <TemplateSelector
              loading={templatesLoading}
              templates={visibleTemplates}
              selectedTemplate={selectedTemplate}
              onSelect={applyTemplate}
            />
          </SectionCard>
          ) : null}

          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Project"
            description="Save output"
            icon={<GalleryVerticalEnd className="h-5 w-5" />}
            compact
            action={projectsLoading ? <Spinner /> : null}
            defaultOpen={false}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-text">Save into project</label>
                <Dropdown value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                  <option value="">Auto-create when needed</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.title}
                    </option>
                  ))}
                </Dropdown>
                <p className="text-xs text-muted">Leave empty to auto-create.</p>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" onClick={() => void createProjectFromCurrentDraft()} disabled={projectCreating}>
                  {projectCreating ? 'Creating...' : 'New project'}
                </Button>
              </div>
            </div>
          </SectionCard>
          ) : null}

          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Script Editor & AI Assist"
            description="Write or refine"
            icon={<Wand2 className="h-5 w-5" />}
            compact
          >
            <ScriptEditor
              topic={topic}
              onTopicChange={setTopic}
              topicPlaceholder={template.topicHint || activeLaneTopicPlaceholder}
              script={script}
              onScriptChange={setScript}
              scriptPlaceholder={template.scriptHint || activeLanePromptPlaceholder}
              onGenerate={() => void generateScript()}
              onEnhance={() => void enhanceScript()}
              loading={scriptLoading}
              error={scriptError}
              tags={scriptTags}
              generateCredits={scriptGenerateEstimate?.estimatedCredits ?? null}
              enhanceCredits={scriptEnhanceEstimate?.estimatedCredits ?? null}
            />
          </SectionCard>
          ) : null}

          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Video Lane & Model"
            description="Lane + model"
            icon={<Sparkles className="h-5 w-5" />}
            compact
            action={modelsLoading ? <Spinner /> : null}
          >
            <div className="space-y-5">
              <VideoLaneSelector lane={videoLane} onChange={handleVideoLaneChange} />
              <ModelDropdown
                models={visibleModels}
                selectedModel={modelKey}
                onChange={(value) => setModelKey(value as VideoModelKey)}
                title={`${selectedLane.label} models`}
                description="Pick a model for this lane."
              />
              <div className="grid gap-2.5 sm:grid-cols-3">
                <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.64)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Lane</p>
                  <p className="mt-1 text-sm font-semibold text-text">{selectedLane.label}</p>
                </div>
                <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.64)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Selected engine</p>
                  <p className="mt-1 text-sm font-semibold text-text">{selectedModel?.shortLabel ?? selectedModel?.label ?? 'Choose model'}</p>
                </div>
                <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.64)] px-3 py-2.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Available now</p>
                  <p className="mt-1 text-sm font-semibold text-text">
                    {visibleModels.filter((item) => item.enabled !== false).length}/{visibleModels.length} models
                  </p>
                </div>
              </div>
              {laneHasOnlyGatedModels ? (
                <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.42)] px-4 py-3 text-sm text-muted">
                  Visible in studio, not enabled for generation yet.
                </div>
              ) : null}
            </div>
          </SectionCard>
          ) : null}

          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Voice & Language"
            description="Narration"
            icon={<Mic2 className="h-5 w-5" />}
            compact
            defaultOpen={false}
          >
            <VoiceSelector
              languageOptions={languageOptions}
              voiceOptions={filteredVoiceOptions.length > 0 ? filteredVoiceOptions : voiceOptions}
              language={language}
              onLanguageChange={(value) => void handleLanguageChange(value)}
              voice={voice}
              onVoiceChange={handleVoiceChange}
              sampleRateHz={audioSampleRateHz}
              onSampleRateHzChange={setAudioSampleRateHz}
              previewText={voicePreviewText}
              onPreviewTextChange={setVoicePreviewText}
              onPreview={previewVoice}
              previewing={voicePreviewing}
              previewLoadingKey={voicePreviewLoadingKey}
              previewProvider={voicePreviewProvider}
              resolvedVoice={voicePreviewResolvedVoice}
              previewCached={voicePreviewCached}
              previewLimit={voicePreviewLimit}
              previewError={voicePreviewError}
              previewMessage={voicePreviewMessage}
              translating={voiceTranslationLoading}
              estimatedCredits={voiceEstimate?.estimatedCredits}
              currentBalance={voiceEstimate?.currentCredits ?? premiumVoiceEstimate?.currentCredits ?? creditWallet?.currentCredits ?? null}
              insufficientCredits={Boolean(voiceEstimate && !voiceEstimate.sufficient)}
              onOpenLowBalance={() => openLowBalanceModal(voiceEstimate?.estimatedCredits)}
              voiceCreditMap={voiceCreditMap}
            />
            <div ref={voicePreviewControlsRef} className="space-y-2">
              {voicePreviewUrl ? (
                <div className="space-y-2">
                  <audio
                    ref={voicePreviewAudioRef}
                    src={voicePreviewUrl}
                    controls
                    preload="auto"
                    className="w-full"
                    onEnded={() => setVoicePreviewing(false)}
                    onPause={() => setVoicePreviewing(false)}
                    onPlay={() => setVoicePreviewing(true)}
                    onError={() => {
                      const message = 'Preview audio could not be loaded. Please try another voice or retry.';
                      setVoicePreviewError(message);
                      setVoicePreviewing(false);
                      show(message);
                    }}
                  />
                  {!voicePreviewing ? (
                    <button
                      type="button"
                      onClick={() => void playExistingVoicePreview()}
                      className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.8)] px-3 py-2 text-xs font-semibold text-text transition hover:border-[hsl(var(--color-accent))] hover:text-[hsl(var(--color-accent))]"
                    >
                      <Mic2 className="h-3.5 w-3.5" />
                      Play preview
                    </button>
                  ) : null}
                </div>
              ) : (
                <audio ref={voicePreviewAudioRef} onEnded={() => setVoicePreviewing(false)} onPause={() => setVoicePreviewing(false)} />
              )}
              {voicePreviewUrl ? (
                <p className="text-xs text-muted">
                  If autoplay does not start, use the built-in audio controls to play the preview manually.
                </p>
              ) : null}
            </div>
          </SectionCard>
          ) : null}

          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Reference Images"
            description="Optional"
            icon={<Film className="h-5 w-5" />}
            compact
            defaultOpen={false}
          >
            <ReferenceImagePicker
              generatedImages={generatedImages}
              selectedImageUrls={selectedImageUrls}
              onToggle={toggleImageSelection}
              pastedUrl={referenceImageUrlInput}
              onPastedUrlChange={setReferenceImageUrlInput}
              onAddUrl={addReferenceImageUrl}
              onMove={moveImage}
              onRemove={(url) => setSelectedImageUrls((current) => current.filter((item) => item !== url))}
            />
          </SectionCard>
          ) : null}
{/*
          <SectionCard
            title="Background Audio"
            description="Music (optional)"
            icon={<Mic2 className="h-5 w-5" />}
            defaultOpen={false}
          >
            <MusicSelector
              mode={musicMode}
              onModeChange={setMusicMode}
              tracks={tracks}
              tracksLoading={tracksLoading}
              selectedTrackId={selectedTrackId}
              onTrackChange={setSelectedTrackId}
              uploadUrl={uploadedMusicUrl}
              onUploadUrlChange={setUploadedMusicUrl}
              onTogglePreview={() => void toggleMusicPreview()}
              isPlaying={musicPlaying}
              volume={musicVolume}
              onVolumeChange={setMusicVolume}
              ducking={ducking}
              onDuckingChange={setDucking}
              error={musicPreviewError}
            />
            {selectedTrack?.preview_url ? <audio ref={previewAudioRef} src={selectedTrack.preview_url.startsWith('http') ? selectedTrack.preview_url : `${API_URL}${selectedTrack.preview_url}`} onEnded={() => setMusicPlaying(false)} /> : null}
          </SectionCard>
*/}
          {(!isDailyLane || showDailyAdvanced) ? (
          <SectionCard
            title="Output Settings"
            description="Format + quality"
            icon={<Settings2 className="h-5 w-5" />}
            compact
            defaultOpen={false}
          >
            <OutputSettings
              modelLabel={selectedModel.label}
              aspectRatio={aspectRatio}
              availableAspectRatios={availableAspectRatios}
              selectedAspectDescription={selectedAspectDescription}
              onAspectRatioChange={setAspectRatio}
              resolution={resolution}
              onResolutionChange={setResolution}
              availableResolutions={availableResolutions}
              resolutionDisplayOptions={RESOLUTION_DISPLAY_OPTIONS}
              selectedResolutionDimensions={selectedResolutionDimensions}
              quality={quality}
              onQualityChange={setQuality}
              durationSeconds={durationSeconds}
              onDurationSecondsChange={setDurationSeconds}
              availableDurations={availableDurations}
              supportsCustomDuration={durationRule.minSeconds !== undefined && durationRule.maxSeconds !== undefined}
              minDuration={klingMinDuration}
              maxDuration={klingMaxDuration}
              durationHelperText={hasReferenceImages && seededDuration
                ? 'Image-seeded clips are currently fixed to 8 seconds for this model.'
                : durationRule.helperText}
              durationError={durationError}
              captionsEnabled={captionsEnabled}
              onCaptionsEnabledChange={setCaptionsEnabled}
              captionStyle={captionStyle}
              onCaptionStyleChange={setCaptionStyle}
            />
          </SectionCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-3 xl:sticky xl:top-24">
          <div className="space-y-3 rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-elevated)/0.3)] p-3.5 shadow-soft backdrop-blur-md sm:p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Output</p>
                <h2 className="mt-1 text-base font-semibold text-text sm:text-lg">Preview & Generate</h2>
              </div>
              <span className="rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-3 py-1 text-xs font-semibold text-text">
                {selectedModel?.shortLabel ?? selectedModel?.label ?? 'Model'}
              </span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-2">
              <div className={`rounded-[16px] border px-3 py-2.5 ${selectedLane.accentClassName}`}>
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Category</p>
                <p className="mt-1 text-sm font-semibold text-text">{selectedLane.label}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.64)] px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Format</p>
                <p className="mt-1 text-sm font-semibold text-text">{aspectRatio} • {selectedResolutionDimensions || resolution}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.64)] px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Voice</p>
                <p className="mt-1 text-sm font-semibold text-text">{narrationEnabled ? `${voice} • ${language}` : 'Off'}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.64)] px-3 py-2.5">
                <p className="text-xs uppercase tracking-[0.14em] text-muted">Mode</p>
                <p className="mt-1 text-sm font-semibold text-text">{selectedImageUrls.length > 0 ? 'Image to Video' : 'Text to Video'}</p>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3">
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Estimated credits</p>
                <p className="mt-1 text-base font-semibold text-text">{displayVideoEstimateCredits}</p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Approx cost</p>
                <p className="mt-1 inline-flex items-center gap-1 text-base font-semibold text-text">
                  <BadgeIndianRupee className="h-4 w-4" />
                  {estimatedInr ?? 0}
                </p>
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] px-3 py-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">Estimate mode</p>
                <p className="mt-1 text-base font-semibold text-text">{estimateError ? 'Fallback' : 'Shared engine'}</p>
              </div>
            </div>

            <GenerateButton
              onClick={() => void submit()}
              loading={renderSessionPhase === 'preparing'}
              estimatedCredits={displayVideoEstimateCredits}
              estimatedTime={estimatedTime}
              currentBalance={creditEstimate?.currentCredits ?? creditWallet?.currentCredits ?? null}
              disabled={Boolean(durationError) || selectedModelDisabled || laneHasOnlyGatedModels}
              insufficientCredits={Boolean(creditEstimate && !creditEstimate.sufficient)}
              onOpenLowBalance={() => openLowBalanceModal(displayVideoEstimateCredits)}
              helperText={
                laneHasOnlyGatedModels
                  ? `${selectedLane.label} is visible for planning, but none of its models are enabled for generation yet.`
                  : selectedModelDisabled
                    ? `${selectedModel?.shortLabel ?? selectedModel?.label ?? 'This model'} is visible in the studio but backend routing is not enabled yet.`
                    : creditEstimate
                      ? `Audio quality: ${AUDIO_QUALITY_OPTIONS.find((item) => item.value === audioSampleRateHz)?.label ?? '22 kHz'} · estimated remaining balance ${creditEstimate.remainingCredits} credits`
                      : isEstimating
                        ? 'Estimating credits for selected settings.'
                        : `${selectedLane.shortLabel} estimate uses the shared pricing engine. Final validation happens on submit.`
              }
            />
            {selectedModelDisabled ? (
              <p className="text-xs text-muted">Feature-gated for now. Enable backend routing before allowing generation.</p>
            ) : null}
            {estimateError ? (
              <p className="text-xs text-amber-600">Could not estimate credits right now. Final validation happens during generation.</p>
            ) : null}
            {!estimateError && isUsingFallback ? (
              <p className="text-xs text-muted">Using estimated credits based on current settings.</p>
            ) : null}

            {submitError ? (
              <div className="rounded-[18px] border border-[hsl(var(--color-danger))] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm text-[hsl(var(--color-danger))]">{submitError}</p>
                  {submitError.toLowerCase().includes('insufficient credits') ? (
                    <Link href="/billing" className="text-sm font-semibold text-[hsl(var(--color-accent))]">
                      Top up credits
                    </Link>
                  ) : null}
                </div>
              </div>
            ) : null}
            <VideoPreview
              job={job}
              loading={renderSessionPhase === 'preparing' || renderSessionPhase === 'queued' || renderSessionPhase === 'processing'}
              error={
                submitError ??
                (jobStatus?.status === 'failed' || jobStatus?.status === 'timed_out' || jobStatus?.status === 'provider_failed'
                  ? jobStatus.errorMessage ?? 'Generation failed.'
                  : null)
              }
              onRetry={retry}
            />
          </div>

          <SectionCard
            title="Studio Feed"
            description="Recent videos"
            icon={<Film className="h-5 w-5" />}
            compact
            defaultOpen={false}
          >
            {videos.length === 0 ? (
              <p className="text-sm text-muted">No videos generated yet. Your latest video jobs will appear here.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                {videos.map((videoItem) => {
                  const videoUrl = toAssetUrl(videoItem.output_url);
                  const thumbUrl = toAssetUrl(videoItem.thumbnail_url) ?? toAssetUrl(videoItem.source_image_url);
                  return (
                    <div key={videoItem.id} className="overflow-hidden rounded-[18px] border border-border bg-bg">
                      {videoUrl ? (
                        <video src={videoUrl} poster={thumbUrl ?? undefined} className="h-40 w-full bg-black object-cover" />
                      ) : thumbUrl ? (
                        <img src={thumbUrl} alt={videoItem.title ?? 'Video thumbnail'} className="h-40 w-full object-cover" />
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-[hsl(var(--color-elevated))] text-sm text-muted">Processing preview</div>
                      )}
                      <div className="space-y-2.5 p-3">
                        <div>
                          <p className="line-clamp-1 text-sm font-semibold text-text">{videoItem.title ?? 'Untitled video'}</p>
                          <p className="mt-0.5 text-[11px] text-muted">{videoItem.provider_name ?? videoItem.selected_model ?? 'Video job'} • {videoItem.resolution}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">{videoItem.status}</span>
                          <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">{videoItem.aspect_ratio}</span>
                          {videoItem.duration_seconds ? <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">{videoItem.duration_seconds}s</span> : null}
                          {videoItem.is_public_inspiration ? <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">Inspiration · {videoItem.moderation_status}</span> : null}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Link href={`/videos/${videoItem.id}`} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm font-semibold text-text">
                            Open
                          </Link>
                          {videoUrl ? (
                            <button type="button" onClick={() => void downloadVideo(videoItem)} className="inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-3 py-2 text-sm font-semibold text-[hsl(var(--color-accent-contrast))]">
                              <Download className="h-4 w-4" />
                              Download
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => void togglePublishVideo(videoItem)}
                            disabled={publishingVideoId === videoItem.id}
                            className="inline-flex items-center gap-2 rounded-[var(--radius-md)] border border-border px-3 py-2 text-sm font-semibold text-text disabled:opacity-60"
                          >
                            {publishingVideoId === videoItem.id
                              ? 'Updating...'
                              : videoItem.is_public_inspiration
                                ? 'Unpublish'
                                : 'Publish'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
      </Card>
      <Modal
        open={templateFlowOpen}
        onClose={() => {
          setTemplateFlowOpen(false);
          setActiveTemplateFlow(null);
        }}
      >
        {activeTemplateFlow ? (
          <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
            <div className="space-y-3">
              <div className="overflow-hidden rounded-[24px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.42)]">
                {activeTemplateFlow.preview_image_url || activeTemplateFlow.thumbnail_url ? (
                  <img
                    src={activeTemplateFlow.preview_image_url || activeTemplateFlow.thumbnail_url}
                    alt={activeTemplateFlow.title || activeTemplateFlow.name}
                    className="aspect-[5/4] w-full object-cover"
                  />
                ) : (
                  <div className="flex aspect-[5/4] items-center justify-center bg-[hsl(var(--color-bg)/0.72)] text-sm text-muted">
                    Template preview
                  </div>
                )}
              </div>
              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.38)] p-4">
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text">Video</span>
                  {activeTemplateFlow.badge ? (
                    <span className="inline-flex rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text">
                      {activeTemplateFlow.badge}
                    </span>
                  ) : null}
                  {activeTemplateFlow.is_featured || activeTemplateFlow.featured ? (
                    <span className="inline-flex rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-accent)/0.12)] px-3 py-1 text-xs font-semibold text-[hsl(var(--color-accent))]">
                      Featured
                    </span>
                  ) : null}
                </div>
                <h3 className="mt-3 text-2xl font-bold text-text">{activeTemplateFlow.title || activeTemplateFlow.name}</h3>
                <p className="mt-2 text-sm text-muted">{activeTemplateFlow.description || activeTemplateFlow.short_description}</p>
                <div className="mt-4 rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recommended model</p>
                  <p className="mt-2 text-sm font-semibold text-text">
                    {templateFlowPreview?.recommendedModel?.label || activeTemplateFlow.recommended_model?.label || 'Included'}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {templateFlowPreview?.recommendedModel?.description || activeTemplateFlow.recommended_model?.description || 'No complex prompt writing needed.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.38)] p-4.5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Template inputs</p>
                    <p className="mt-1 text-sm text-muted">Answer a few questions. RangManch will assemble the script and defaults for you.</p>
                  </div>
                  {templateFlowEstimate ? (
                    <span className="inline-flex rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text">
                      {templateFlowEstimate.estimatedCredits} credits
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 space-y-3">
                  {primarySubtypeField ? (
                    <div className="space-y-2 rounded-[16px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.62)] p-3.5">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Step 1</p>
                        <p className="mt-1 text-sm font-semibold text-text">{primarySubtypeField.label}</p>
                        <p className="mt-1 text-xs text-muted">Choose the exact workflow first. The preview will adapt around this choice.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {normalizeTemplateOptions(primarySubtypeField).map((option) => {
                          const active = (templateFlowInputs[primarySubtypeField.key] || '') === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setTemplateFlowInputs((current) => ({ ...current, [primarySubtypeField.key]: option.value }))}
                              className={`rounded-full px-3 py-2 text-xs font-semibold transition ${active
                                  ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                                  : 'border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.42)] text-muted hover:text-text'
                                }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                  {remainingTemplateFlowFields.map((field) => {
                    const options = normalizeTemplateOptions(field);
                    const value = templateFlowInputs[field.key] || '';
                    return (
                      <div key={field.key} className="space-y-1.5">
                        <label className="text-sm font-medium text-text">{field.label}</label>
                        {field.type === 'select' ? (
                          <Dropdown
                            value={value}
                            onChange={(e) => setTemplateFlowInputs((current) => ({ ...current, [field.key]: e.target.value }))}
                          >
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Dropdown>
                        ) : field.type === 'textarea' ? (
                          <Textarea
                            value={value}
                            onChange={(e) => setTemplateFlowInputs((current) => ({ ...current, [field.key]: e.target.value }))}
                            placeholder={field.placeholder || ''}
                          />
                        ) : (
                          <Input
                            value={value}
                            onChange={(e) => setTemplateFlowInputs((current) => ({ ...current, [field.key]: e.target.value }))}
                            placeholder={field.placeholder || ''}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.38)] p-4.5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-text">Model override</label>
                    <Input
                      value={templateFlowModelOverride}
                      onChange={(e) => setTemplateFlowModelOverride(e.target.value)}
                      placeholder={activeTemplateFlow.recommended_model?.internal_model_key || activeTemplateFlow.generation_defaults?.model_key || 'Leave blank to use recommended'}
                    />
                  </div>
                  <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.7)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Prompt mode</p>
                    <p className="mt-2 text-sm font-semibold text-text">
                      {templateFlowPreview?.recommendedModelMode || activeTemplateFlow.default_model_mode || 'Smart default'}
                    </p>
                    <p className="mt-1 text-sm text-muted">You can still edit the assembled output before generating.</p>
                  </div>
                </div>

                <div className="mt-4 space-y-1.5">
                  <label className="text-sm font-medium text-text">Project</label>
                  <Dropdown value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                    <option value="">Auto-create a project when this template is applied</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.title}
                      </option>
                    ))}
                  </Dropdown>
                  <p className="text-xs text-muted">Serious guided workflows are easier to revisit when their prompt, script, and outputs stay grouped together.</p>
                </div>

                <div className="mt-4 space-y-1.5">
                  <label className="text-sm font-medium text-text">Prompt / script override</label>
                  <Textarea
                    value={templateFlowPromptOverride}
                    onChange={(e) => setTemplateFlowPromptOverride(e.target.value)}
                    placeholder="Optional. Override the assembled prompt or script if you want more control."
                    rows={5}
                  />
                </div>
              </div>

              <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.38)] p-4.5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Preview</p>
                    <p className="mt-1 text-sm text-muted">Review the assembled output before applying it to the studio.</p>
                  </div>
                  {templateFlowPreviewLoading ? <Spinner /> : null}
                </div>
                {templateFlowMissingRequired.length > 0 ? (
                  <p className="mt-3 text-xs text-muted">
                    Fill {templateFlowMissingRequired.map((field) => field.label).join(', ')} to generate the guided preview.
                  </p>
                ) : null}
                <div className="mt-4 space-y-3">
                  <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Topic title</p>
                    <p className="mt-2 text-sm font-semibold text-text">
                      {templateFlowPreview?.title || activeTemplateFlow.topic_hint || activeTemplateFlow.title || activeTemplateFlow.name}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Script preview</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">
                      {templateFlowPreview?.scriptPreview || templateFlowPreview?.videoPrompt || templateFlowPreview?.prompt || activeTemplateFlow.script_hint || 'Preview will appear after you answer a few questions.'}
                    </p>
                  </div>
                </div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setTemplateFlowOpen(false);
                      setActiveTemplateFlow(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={applyStructuredTemplateFlow} disabled={!canApplyStructuredTemplateFlow}>
                    Apply to studio
                  </Button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
