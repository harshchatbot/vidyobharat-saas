'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BadgeIndianRupee, CheckCircle2, Clapperboard, Download, Film, GalleryVerticalEnd, Mic2, PlayCircle, Settings2, Share2, Sparkles, Wallet, Wand2 } from 'lucide-react';

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
import { describeVideoEstimate } from '@/lib/pricingEstimates';
import type { AIVideoModel, AIVideoStatusResponse, CreditEstimateResponse, GeneratedImage, MusicTrack, Project, TTSLanguageOption, TTSVoiceOption, Video, Template as UnifiedTemplate, TemplateInputField, TemplatePreviewResponse } from '@/types/api';

import { ASPECT_OPTIONS, AUDIO_QUALITY_OPTIONS, FALLBACK_VIDEO_MODELS, LANGUAGE_OPTIONS, RESOLUTION_DISPLAY_OPTIONS, RESOLUTION_OPTIONS, TEMPLATE_OPTIONS, VIDEO_DURATION_RULES, VIDEO_OUTPUT_RULES, VOICE_OPTIONS, type TemplateOption } from './constants';
import { GenerateButton } from './GenerateButton';
import { ModelDropdown } from './ModelDropdown';
import { MusicSelector } from './MusicSelector';
import { OutputSettings } from './OutputSettings';
import { ReferenceImagePicker } from './ReferenceImagePicker';
import { ScriptEditor } from './ScriptEditor';
import { ScriptQualityPanel } from './ScriptQualityPanel';
import { SectionCard } from './SectionCard';
import { TemplateSelector } from './TemplateSelector';
import { VideoPreview } from './VideoPreview';
import { evaluateScriptQuality } from './scriptQuality';
import { getVideoLaneDefinition, VIDEO_LANES, type VideoLaneKey } from './videoLanes';

const DRAFT_VERSION = 2;
const FREE_VOICE_KEYS = new Set(['Aarav', 'Mira', 'Dev', 'Shubh', 'Priya']);
const VIDEO_STUDIO_CACHE_TTL_MS = 2 * 60 * 1000;

function formatVoiceOptionLabel(option: TTSVoiceOption) {
  return FREE_VOICE_KEYS.has(option.key) ? `${option.label} - Free` : option.label;
}

function sanitizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

type VideoModelKey = string;
type RenderSessionPhase = 'idle' | 'preparing' | 'queued' | 'processing' | 'success' | 'failed';
type CreatorIntentKey = 'viral_reel' | 'story_reel' | 'ad_reel' | 'explainer_reel' | 'character_reel' | 'cute_fun_clip';
type VideoQuickStartPreset = {
  title: string;
  description: string;
  preferredTemplateKeys: string[];
  lane: VideoLaneKey;
  modelKey: string;
  aspectRatio: '9:16' | '16:9' | '1:1';
  resolution: '720p' | '1080p';
  quality: 'standard' | 'high';
  durationSeconds: string;
  captionsEnabled: boolean;
  topic: string;
  script: string;
};
type VideoTemplateQuickApplyPreset = {
  title: string;
  script: string;
  inputDefaults?: Record<string, string>;
  captionsEnabled?: boolean;
  narrationEnabled?: boolean;
};

function estimateInrFromCredits(credits: number) {
  if (credits <= 0) return null;
  return Math.max(0, Math.ceil(credits * 2.5));
}

function normalizeDurationForModel(modelKey: string, durationSeconds: number | null | undefined) {
  const duration = Number(durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  return Math.trunc(duration);
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

function buildTemplateScaffoldValue(field: TemplateInputField): string {
  if (field.type === 'select') {
    return normalizeTemplateOptions(field)[0]?.value || '';
  }
  const label = (field.label || field.key || 'value').trim().toLowerCase();
  return `[Insert ${label} here]`;
}

function buildInitialTemplateInputs(template: UnifiedTemplate | null): Record<string, string> {
  if (!template?.inputs?.length) return {};
  return Object.fromEntries(
    template.inputs.map((field) => [field.key, buildTemplateScaffoldValue(field)]),
  );
}

function sanitizeInitialTitle(initialTitle: string | undefined, initialTemplate: TemplateOption) {
  const trimmed = (initialTitle || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase() === initialTemplate.label.trim().toLowerCase()) return '';
  return trimmed;
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

const CREATOR_INTENT_OPTIONS: Array<{
  key: CreatorIntentKey;
  label: string;
  description: string;
}> = [
  { key: 'viral_reel', label: 'Viral Reel', description: 'Fast-moving, social-first content with strong hooks.' },
  { key: 'story_reel', label: 'Story Reel', description: 'Narrative, top-5, before-after, and scene-based storytelling.' },
  { key: 'ad_reel', label: 'Ad Reel', description: 'Product, brand, and conversion-focused promo content.' },
  { key: 'explainer_reel', label: 'Explainer Reel', description: 'Educational and product explainers with clear structure.' },
  { key: 'character_reel', label: 'Character Reel', description: 'Persona-led or character-led storytelling.' },
  { key: 'cute_fun_clip', label: 'Cute / Fun Clip', description: 'Playful, light, entertaining short-form content.' },
];

const VIDEO_QUICK_START_PRESETS: Record<CreatorIntentKey, VideoQuickStartPreset> = {
  viral_reel: {
    title: 'Viral Reel',
    description: 'Hook-first setup for fast, social storytelling.',
    preferredTemplateKeys: ['music-video', 'storyboard', 'custom'],
    lane: 'creator_pro',
    modelKey: 'fal_ltx23_i2v',
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    durationSeconds: '10',
    captionsEnabled: true,
    topic: 'A cinematic reel about why consistency matters more than talent',
    script: 'Create a short, cinematic reel about why consistency matters more than talent. Start with a frustrated creator, show editing chaos and burnout, then end on a powerful message about showing up every day.',
  },
  story_reel: {
    title: 'Story Reel',
    description: 'A guided narrative setup for before-after and emotional storytelling.',
    preferredTemplateKeys: ['storyboard', 'history', 'custom'],
    lane: 'creator_pro',
    modelKey: 'fal_ltx23_i2v',
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    durationSeconds: '10',
    captionsEnabled: true,
    topic: 'An inspiring creator story about starting with nothing but an idea',
    script: 'Create a story-style reel about a beginner who had ideas but no camera, no editing skills, and no confidence, yet still started creating with AI. Make it emotional, inspiring, and social-first.',
  },
  ad_reel: {
    title: 'Ad Reel',
    description: 'Best-value ad setup for product visuals and conversion-focused pacing.',
    preferredTemplateKeys: ['product', 'startup', 'custom'],
    lane: 'creator_pro',
    modelKey: 'fal_ltx23_i2v',
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    durationSeconds: '6',
    captionsEnabled: false,
    topic: 'A premium short-form ad for a mango drink brand',
    script: 'Create a premium short-form ad for a mango drink bottle with bright summer visuals, clean product framing, lifestyle energy, and conversion-focused pacing.',
  },
  explainer_reel: {
    title: 'Explainer Reel',
    description: 'A guided explainer setup with captions on by default.',
    preferredTemplateKeys: ['explainer-video', 'tech', 'custom'],
    lane: 'creator_pro',
    modelKey: 'fal_ltx23_i2v',
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    durationSeconds: '10',
    captionsEnabled: true,
    topic: 'A character-led explainer about what the human heart does',
    script: 'Create a character-led explainer where the human heart explains what it does for the body in a simple, engaging, and visually memorable way.',
  },
  character_reel: {
    title: 'Character Reel',
    description: 'A strong starting point for persona-led and mythology-style visuals.',
    preferredTemplateKeys: ['character-vlog', 'mythology', 'custom'],
    lane: 'creator_pro',
    modelKey: 'fal_ltx23_i2v',
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    durationSeconds: '10',
    captionsEnabled: true,
    topic: 'A mythology-inspired hero speaking about strength and devotion',
    script: 'Create a cinematic character-led reel featuring a mythology-inspired hero speaking about strength, discipline, and devotion with powerful visuals and social-first pacing.',
  },
  cute_fun_clip: {
    title: 'Cute / Fun Clip',
    description: 'A playful short-form setup for mascot, pet, and loop-friendly content.',
    preferredTemplateKeys: ['music-video', 'asmr-video', 'custom'],
    lane: 'creator_pro',
    modelKey: 'fal_ltx23_i2v',
    aspectRatio: '9:16',
    resolution: '1080p',
    quality: 'standard',
    durationSeconds: '6',
    captionsEnabled: false,
    topic: 'A playful mascot dance clip with shareable energy',
    script: 'Create a cute, loop-friendly reel featuring a playful mascot dancing with smooth movement, family-safe appeal, and high share potential.',
  },
};

const VIDEO_TEMPLATE_QUICK_APPLY_PRESETS: Record<string, VideoTemplateQuickApplyPreset> = {
  character_explainer_reel: {
    title: 'Explain Anything Like a Character',
    script:
      'Create a character-led explainer where the human heart explains what it does for the body in a simple, engaging, and visually memorable way.',
    captionsEnabled: true,
    narrationEnabled: true,
    inputDefaults: {
      speakerType: 'body_organ',
      speakerName: 'The Human Heart',
      topic: 'How the heart pumps blood through the body',
      audience: 'General audience',
      tone: 'Educational',
      language: 'English',
      platform: 'Instagram Reels',
      duration: '12',
      visualStyle: 'Premium Explainer',
      voiceStyle: 'Warm educator',
      textOverlay: 'Animated captions',
      cta: 'Follow for more explainers',
    },
  },
  client_ad_reel: {
    title: 'High-Converting Ad Reel',
    script:
      'Create a premium short-form ad for a mango drink bottle with bright summer visuals, clean product framing, lifestyle energy, and conversion-focused pacing.',
    captionsEnabled: true,
    narrationEnabled: true,
    inputDefaults: {
      businessType: 'product_ad',
      productOrService: 'Mango drink bottle',
      targetAudience: 'Young urban buyers',
      offer: 'Limited summer launch',
      tone: 'Premium',
      platform: 'Instagram Reels',
      duration: '12',
      brandColors: 'Mango yellow and deep green',
      headline: 'Summer in every sip',
      cta: 'Shop now',
    },
  },
  story_slides_reel: {
    title: 'Story / Top 5 / Before-After Reel',
    script:
      'Create a story-style reel about a beginner who had ideas but no camera, no editing skills, and no confidence, yet still started creating with AI. Make it emotional, inspiring, and social-first.',
    captionsEnabled: true,
    narrationEnabled: true,
    inputDefaults: {
      subtype: 'top_5',
      topic: '5 habits of creators who stay consistent',
      audience: 'Creators and founders',
      tone: 'Educational',
      platform: 'Instagram Reels',
      duration: '8',
      cta: 'Follow for more creator systems',
    },
  },
  viral_dance_clip: {
    title: 'Cute Viral Clip',
    script:
      'Create a cute, loop-friendly reel featuring a playful mascot dancing with smooth movement, family-safe appeal, and high share potential.',
    captionsEnabled: false,
    narrationEnabled: false,
    inputDefaults: {
      character: 'Playful panda mascot',
      danceStyle: 'Bhangra-inspired playful groove',
      sceneTheme: 'Colorful festival backdrop with bright lights',
    },
  },
};

const TEMPLATE_OPTIONAL_DETAIL_KEYS = new Set([
  'audience',
  'targetAudience',
  'tone',
  'platform',
  'duration',
  'cta',
  'project',
  'scriptOverride',
  'offer',
  'brandColors',
  'brandName',
  'headline',
  'voiceStyle',
  'visualStyle',
  'textOverlay',
  'danceStyle',
  'sceneTheme',
  'character',
  'speakerType',
  'speakerName',
  'productOrService',
  'businessType',
]);

const TEMPLATE_FIELD_HINTS: Record<string, string> = {
  topic: 'What your video is about',
  tone: 'How the video should feel (optional)',
  audience: 'Who this is for (optional)',
  targetAudience: 'Who this is for (optional)',
  platform: 'Where you plan to publish (optional)',
  duration: 'How long the reel should feel (optional)',
  cta: 'What viewers should do next (optional)',
  project: 'Save into a specific project (optional)',
  scriptOverride: 'Replace the starter script only if you need more control',
};

function firstTemplateOptionValue(field: TemplateInputField): string {
  return normalizeTemplateOptions(field)[0]?.value || '';
}

function getTemplateFieldHint(field: TemplateInputField) {
  return TEMPLATE_FIELD_HINTS[field.key] || null;
}

function ensureSmoothVideoScriptCues(scriptText: string) {
  const trimmed = scriptText.trim();
  if (!trimmed) return trimmed;

  let next = trimmed;
  if (!/opening cue:/i.test(next)) {
    next = `${next}\n\nOpening cue: soft fade in, no abrupt start.`;
  }
  if (!/ending cue:/i.test(next)) {
    next = `${next}\nEnding cue: hold final frame, fade out smoothly.`;
  }
  return next;
}

function deriveSceneStrip(scriptText: string, fallbackTitle: string) {
  const parts = scriptText
    .split(/\n+|(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (parts.length > 0) return parts;
  return [fallbackTitle || 'Opening scene', 'Main moment', 'Closing frame'];
}

function resolveQuickApplyPreset(template: UnifiedTemplate): VideoTemplateQuickApplyPreset {
  return (
    VIDEO_TEMPLATE_QUICK_APPLY_PRESETS[template.id] || {
      title: template.title || template.name,
      script: template.script_hint || template.description || template.topic_hint || 'Create a strong social-first reel with a clear opening, clean pacing, and a memorable ending.',
      captionsEnabled: true,
      narrationEnabled: true,
      inputDefaults: {},
    }
  );
}

function buildQuickApplyTemplateInputs(template: UnifiedTemplate): Record<string, string> {
  const preset = resolveQuickApplyPreset(template);
  const inputs = buildInitialTemplateInputs(template);
  for (const field of template.inputs || []) {
    const presetValue = preset.inputDefaults?.[field.key];
    if (presetValue) {
      inputs[field.key] = presetValue;
      continue;
    }
    if (field.key === 'topic') {
      inputs[field.key] = template.topic_hint || 'Create a strong creator-first reel concept';
      continue;
    }
    if (field.key === 'language') {
      inputs[field.key] = template.generation_defaults?.language || firstTemplateOptionValue(field) || 'English';
      continue;
    }
    if (field.key === 'duration') {
      inputs[field.key] = String(template.generation_defaults?.duration_seconds || firstTemplateOptionValue(field) || '8');
      continue;
    }
    if ((field.type === 'select' || field.required) && (!inputs[field.key] || inputs[field.key].startsWith('[Insert'))) {
      const firstValue = firstTemplateOptionValue(field);
      if (firstValue) {
        inputs[field.key] = firstValue;
      }
    }
  }
  return inputs;
}

function resolveCreatorIntent(template: TemplateOption | null): CreatorIntentKey {
  const haystack = `${template?.key || ''} ${template?.label || ''} ${template?.description || ''} ${template?.helper || ''}`.toLowerCase();
  if (haystack.includes('product') || haystack.includes('ad ') || haystack.includes('promo') || haystack.includes('startup') || haystack.includes('property')) {
    return 'ad_reel';
  }
  if (haystack.includes('explainer') || haystack.includes('tech') || haystack.includes('education') || haystack.includes('organ')) {
    return 'explainer_reel';
  }
  if (haystack.includes('character') || haystack.includes('persona') || haystack.includes('vlog')) {
    return 'character_reel';
  }
  if (haystack.includes('myth') || haystack.includes('history') || haystack.includes('story') || haystack.includes('timeline') || haystack.includes('slides') || haystack.includes('storyboard')) {
    return 'story_reel';
  }
  if (haystack.includes('dance') || haystack.includes('cute') || haystack.includes('fun') || haystack.includes('music') || haystack.includes('asmr')) {
    return 'cute_fun_clip';
  }
  return 'viral_reel';
}

function matchesCreatorIntent(template: TemplateOption, intent: CreatorIntentKey) {
  return resolveCreatorIntent(template) === intent;
}

function pickVideoQuickStartTemplate(
  templates: TemplateOption[],
  intent: CreatorIntentKey,
  preset: VideoQuickStartPreset,
) {
  for (const key of preset.preferredTemplateKeys) {
    const exact = templates.find((template) => template.key === key);
    if (exact) return exact;
  }
  return (
    templates.find((template) => template.key !== 'custom' && matchesCreatorIntent(template, intent)) ??
    templates.find((template) => template.key !== 'custom') ??
    templates[0] ??
    null
  );
}

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
      model: modelOverride || defaults.model_key || template.recommended_model?.internal_model_key || 'fal_ltx23_i2v',
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
  initialLane,
  initialModelKey,
  initialAspectRatio,
  initialResolution,
  initialDurationSeconds,
  initialCaptionsEnabled,
  initialNarrationEnabled,
  embedded = false,
}: {
  userId: string;
  templateKey?: string;
  initialScript?: string;
  initialTitle?: string;
  initialProjectId?: string;
  initialLane?: VideoLaneKey;
  initialModelKey?: string;
  initialAspectRatio?: '9:16' | '16:9' | '1:1';
  initialResolution?: '720p' | '1080p';
  initialDurationSeconds?: string;
  initialCaptionsEnabled?: boolean;
  initialNarrationEnabled?: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const cacheKey = `rangmanch:video-studio:v2:${userId}`;
  const draftKey = `rangmanch-create-draft:${userId}`;
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewControlsRef = useRef<HTMLDivElement | null>(null);
  const composeSectionRef = useRef<HTMLDivElement | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const lastTaggedScriptRef = useRef('');

  const initialTemplate = TEMPLATE_OPTIONS.find((item) => item.key === templateKey) ?? TEMPLATE_OPTIONS[0];
  const sanitizedInitialTitle = sanitizeInitialTitle(initialTitle, initialTemplate);

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
  const [title, setTitle] = useState(sanitizedInitialTitle);
  const [topic, setTopic] = useState(sanitizedInitialTitle);
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
  const [voicePreviewSignature, setVoicePreviewSignature] = useState<string | null>(null);
  const [voicePreviewText, setVoicePreviewText] = useState(
    'Welcome to RangManch AI. Let us create something amazing for your audience today.',
  );
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>(VOICE_OPTIONS);
  const [languageOptions, setLanguageOptions] = useState<TTSLanguageOption[]>(LANGUAGE_OPTIONS);
  const previousLaneRef = useRef<VideoLaneKey>('creator_pro');
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
  const [videoLane, setVideoLane] = useState<VideoLaneKey>(initialLane ?? 'creator_pro');
  const [modelKey, setModelKey] = useState<VideoModelKey>(initialModelKey ?? 'fal_ltx23_i2v');
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

  const [aspectRatio, setAspectRatio] = useState<'9:16' | '16:9' | '1:1'>(initialAspectRatio ?? '9:16');
  const [resolution, setResolution] = useState<'720p' | '1080p'>(initialResolution ?? '720p');
  const [quality, setQuality] = useState<'standard' | 'high'>('standard');
  const [durationMode, setDurationMode] = useState<'auto' | 'custom'>('custom');
  const [durationSeconds, setDurationSeconds] = useState(initialDurationSeconds ?? '8');
  const [captionsEnabled, setCaptionsEnabled] = useState(initialCaptionsEnabled ?? false);
  const [narrationEnabled, setNarrationEnabled] = useState(initialNarrationEnabled ?? false);
  const [captionStyle, setCaptionStyle] = useState('Classic');
  const [quickStartFeedback, setQuickStartFeedback] = useState<{ title: string; description: string } | null>(null);
  const [templateApplyLoadingKey, setTemplateApplyLoadingKey] = useState<string | null>(null);
  const [activeTemplateState, setActiveTemplateState] = useState<'ready' | 'customized' | null>(null);

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
  const guidedLaunchOpenedRef = useRef(false);
  const sharedModelMap = useMemo(() => getVideoModelMap(), []);
  const prefersUnifiedComposer = !embedded && !(initialScript ?? '').trim() && !(initialTitle ?? '').trim();
  const visibleTemplates = videoTemplates.filter((item) => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.label} ${item.description}`.toLowerCase().includes(query);
  });
  const selectedIntent = resolveCreatorIntent(template ?? null);
  const visibleIntentOptions = CREATOR_INTENT_OPTIONS.filter((intent) =>
    visibleTemplates.some((item) => matchesCreatorIntent(item, intent.key)),
  );
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const laneModels = useMemo(
    () => models.filter((model) => (sharedModelMap[model.key]?.lane ?? 'creator_pro') === videoLane),
    [models, sharedModelMap, videoLane],
  );
  const visibleModels = laneModels.length > 0 ? laneModels : models;
  const selectedModel = visibleModels.find((model) => model.key === modelKey) ?? visibleModels.find((model) => model.enabled !== false) ?? visibleModels[0];
  const selectedModelDisabled = selectedModel?.enabled === false;
  const selectedLane = getVideoLaneDefinition(videoLane);
  const recommendedEngineCopy = `${selectedLane.label} · ${selectedModel?.shortLabel ?? selectedModel?.label ?? 'Smart default'}`;
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
  const normalizedDurationSeconds = useMemo(
    () => normalizeDurationForModel(modelKey, Number(durationSeconds) || durationRule.defaultSeconds),
    [durationRule.defaultSeconds, durationSeconds, modelKey],
  );
  const estimateRequests = useMemo(
    () => [
      {
        key: 'videoCreate',
        action: 'video_create',
        payload: {
          model: modelKey,
          resolution,
          durationSeconds: normalizedDurationSeconds || durationRule.defaultSeconds,
          quality,
          captionsEnabled,
          narrationEnabled,
          voice,
          provider: narrationEnabled ? voiceProvider : 'free',
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
      normalizedDurationSeconds,
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
  const localVideoEstimate = estimates.videoCreate ?? null;
  const [serverVideoEstimate, setServerVideoEstimate] = useState<CreditEstimateResponse | null>(null);
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
  const minDuration = durationRule.minSeconds;
  const maxDuration = durationRule.maxSeconds;
  const availableDurations: number[] = hasReferenceImages && seededDuration
    ? [seededDuration]
    : [...durationRule.presetSeconds];
  const availableAspectRatios = ASPECT_OPTIONS.filter((option) =>
    supportedAspects.includes(option.value),
  );
  const availableResolutions = RESOLUTION_OPTIONS.filter((option) =>
    supportedResolutions.includes(option.value),
  );
  const videoEstimatePayload = useMemo(
    () => ({
      model: modelKey,
      resolution,
      durationSeconds: normalizedDurationSeconds || durationRule.defaultSeconds,
      quality,
      captionsEnabled,
      narrationEnabled,
      voice,
      provider: narrationEnabled ? voiceProvider : 'free',
      imageUrls: selectedImageUrls,
      audioSettings: { sampleRateHz: audioSampleRateHz },
    }),
    [
      modelKey,
      resolution,
      normalizedDurationSeconds,
      durationRule.defaultSeconds,
      quality,
      captionsEnabled,
      narrationEnabled,
      voice,
      voiceProvider,
      selectedImageUrls,
      audioSampleRateHz,
    ],
  );
  const videoEstimateFingerprint = useMemo(() => JSON.stringify(videoEstimatePayload), [videoEstimatePayload]);
  const creditEstimate = serverVideoEstimate ?? localVideoEstimate ?? null;
  const selectedAspectDescription =
    availableAspectRatios.find((option) => option.value === aspectRatio)?.description ??
    availableAspectRatios[0]?.description ??
    '';
  const selectedResolutionDimensions =
    outputSizes[aspectRatio]?.[resolution] ??
    outputSizes[availableAspectRatios[0]?.value ?? '']?.[availableResolutions[0]?.value ?? ''] ??
    '';
  const estimatedTime = videoLane === 'premium' ? '2-5 min' : '2-4 min';
  const studioTitle = title.trim() || topic.trim() || selectedHeroTemplate?.title || template.label || 'Video studio';
  const sceneStrip = useMemo(() => deriveSceneStrip(script, studioTitle), [script, studioTitle]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      void api
        .estimateCredits('video_create', videoEstimatePayload, userId)
        .then((result) => {
          if (cancelled) return;
          setServerVideoEstimate(result);
        })
        .catch(() => {
          if (cancelled) return;
          setServerVideoEstimate(null);
        });
    }, 180);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [userId, videoEstimateFingerprint, videoEstimatePayload]);

  const derivedVideoEstimateCredits = useMemo(() => {
    const apiEstimated = creditEstimate?.estimatedCredits;
    if (typeof apiEstimated === 'number' && Number.isFinite(apiEstimated) && apiEstimated > 0) {
      return apiEstimated;
    }
    const aliasMap = (creditEngine.videoModelAliases ?? {}) as Record<string, string>;
    const normalizedModel = aliasMap[String(modelKey).toLowerCase()] ?? 'fal_ltx23_i2v';
    const modelMultiplier = Number((creditEngine.video.modelMultiplier as Record<string, number>)[normalizedModel] ?? 0);
    const resolutionMultiplier = Number((creditEngine.video.resolutionMultiplier as Record<string, number>)[resolution] ?? 1);
    const qualityMultiplier = Number((creditEngine.video.qualityMultiplier as Record<string, number>)[quality] ?? 1);
    const baseCredits = Number(creditEngine.video.baseCredits ?? 0);
    const baseDuration = Number(creditEngine.video.baseDuration ?? 15);
    const duration = Math.max(1, normalizedDurationSeconds || durationRule.defaultSeconds || 8);
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
    normalizedDurationSeconds,
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
  const estimateContextMessage = useMemo(
    () => describeVideoEstimate(modelKey, displayVideoEstimateCredits),
    [modelKey, displayVideoEstimateCredits],
  );
  const addOnCreditsTotal = narrationCredits + captionCredits + referenceCredits + autoTagCredits;
  const baseGenerationCredits = Math.max(0, displayVideoEstimateCredits - addOnCreditsTotal);
  const laneHasOnlyGatedModels = laneModels.length > 0 && laneModels.every((model) => model.enabled === false);
  const submitStateFingerprint = useMemo(
    () => JSON.stringify({
      modelKey,
      resolution,
      durationSeconds,
      normalizedDurationSeconds,
      quality,
      captionsEnabled,
      narrationEnabled,
      voice,
      audioSampleRateHz,
      imageCount: selectedImageUrls.length,
      script: script.trim(),
    }),
    [
      modelKey,
      resolution,
      normalizedDurationSeconds,
      quality,
      captionsEnabled,
      narrationEnabled,
      voice,
      audioSampleRateHz,
      selectedImageUrls.length,
      script,
    ],
  );
  const previousSubmitStateFingerprintRef = useRef(submitStateFingerprint);

  useEffect(() => {
    if (previousSubmitStateFingerprintRef.current === submitStateFingerprint) return;
    previousSubmitStateFingerprintRef.current = submitStateFingerprint;
    if (!submitError) return;
    setSubmitError(null);
  }, [submitError, submitStateFingerprint]);

  useEffect(() => {
    if (!submitError?.toLowerCase().includes('insufficient credits')) return;
    if (creditEstimate?.sufficient) {
      setSubmitError(null);
    }
  }, [creditEstimate?.sufficient, submitError]);

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
    setResolution('720p');
    setDurationMode('custom');
  }, [videoLane]);

  useEffect(() => {
    if (normalizedDurationSeconds === null) return;
    if (Number(durationSeconds) === normalizedDurationSeconds) return;
    setDurationSeconds(String(normalizedDurationSeconds));
  }, [durationSeconds, normalizedDurationSeconds]);

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
  const supportsCustomDuration = durationRule.minSeconds !== undefined && durationRule.maxSeconds !== undefined;
  const durationError =
    supportsCustomDuration
      ? (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) < (minDuration ?? 3) || Number(durationSeconds) > (maxDuration ?? 10)
        ? `Enter a duration between ${minDuration}s and ${maxDuration}s.`
        : null)
      : (!availableDurations.includes(Number(durationSeconds))
        ? `Choose one of the supported ${selectedModel.label} durations: ${availableDurations.map((value) => `${value}s`).join(', ')}.`
        : null);
  const scriptQualityReport = useMemo(
    () =>
      evaluateScriptQuality({
        script,
        durationSeconds: normalizedDurationSeconds || durationRule.defaultSeconds || 8,
        structuredPreferred: true,
      }),
    [durationRule.defaultSeconds, normalizedDurationSeconds, script],
  );
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
    if (guidedLaunchOpenedRef.current || templatesLoading) return;
    if (!templateKey || initialScript?.trim() || sanitizedInitialTitle.trim()) return;
    const guidedTemplate = unifiedVideoTemplates.find(
      (item) => item.id === templateKey || (item.legacy_mappings || []).includes(templateKey),
    );
    if (!guidedTemplate) return;
    guidedLaunchOpenedRef.current = true;
    setTemplateApplyLoadingKey(guidedTemplate.id);
    window.setTimeout(() => {
      setTemplateApplyLoadingKey(null);
      void quickApplyTemplate(guidedTemplate.id);
    }, 0);
  }, [initialScript, sanitizedInitialTitle, templateKey, templatesLoading, unifiedVideoTemplates]);

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
    if (
      initialScript?.trim() ||
      sanitizedInitialTitle.trim() ||
      initialLane ||
      initialModelKey ||
      initialAspectRatio ||
      initialResolution ||
      initialDurationSeconds ||
      typeof initialCaptionsEnabled === 'boolean' ||
      typeof initialNarrationEnabled === 'boolean'
    ) {
      return;
    }
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
  }, [
    draftKey,
    initialAspectRatio,
    initialCaptionsEnabled,
    initialDurationSeconds,
    initialLane,
    initialModelKey,
    initialNarrationEnabled,
    initialResolution,
    initialScript,
    sanitizedInitialTitle,
  ]);

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
              celebrate: true,
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
      const minimum = minDuration ?? 3;
      const maximum = maxDuration ?? 10;
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

  const focusComposeEditor = () => {
    window.setTimeout(() => {
      composeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      scriptTextareaRef.current?.focus();
    }, 80);
  };

  const applyTemplateSelection = (
    templateId: string,
    options?: {
      openGuidedFlow?: boolean;
      topicOverride?: string;
      scriptOverride?: string;
      titleOverride?: string;
    },
  ) => {
    const openGuidedFlow = options?.openGuidedFlow ?? true;
    const unifiedTemplate = unifiedVideoTemplates.find((item) => item.id === templateId || (item.legacy_mappings || []).includes(templateId));
    if (unifiedTemplate && openGuidedFlow) {
      setActiveTemplateFlow(unifiedTemplate);
      setTemplateFlowOpen(true);
      setSubmitError(null);
      setScriptError(null);
      return;
    }

    const next =
      videoTemplates.find((item) => item.key === templateId) ??
      (unifiedTemplate ? mapUnifiedTemplateToVideoOption(unifiedTemplate) : null);
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
      setActiveTemplateState(null);
    }

    if (next.key === 'custom') {
      setTopic(options?.topicOverride ?? '');
      setScript(options?.scriptOverride ?? '');
      setTitle(options?.titleOverride ?? '');
    } else {
      if (options?.topicOverride !== undefined) {
        setTopic(options.topicOverride);
      } else if (topicLooksTemplateDriven) {
        setTopic(next.topicHint);
      }
      if (options?.scriptOverride !== undefined) {
        setScript(options.scriptOverride);
      } else if (scriptLooksTemplateDriven) {
        setScript(next.scriptHint);
      }
      if (options?.titleOverride !== undefined) {
        setTitle(options.titleOverride);
      } else if (!title.trim() || title === previousTemplate?.topicHint) {
        setTitle(next.topicHint);
      }
    }

    if (next.defaultModelKey) {
      const recommendedLane = sharedModelMap[next.defaultModelKey]?.lane as VideoLaneKey | undefined;
      if (recommendedLane) {
        setVideoLane(recommendedLane);
      }
      setModelKey(next.defaultModelKey as VideoModelKey);
    }

    setSubmitError(null);
    setScriptError(null);
  };

  const customizeTemplate = (templateId: string) => {
    setTemplateApplyLoadingKey(null);
    setQuickStartFeedback(null);
    applyTemplateSelection(templateId, { openGuidedFlow: true });
  };

  const applyTemplatePresetState = (
    heroTemplate: UnifiedTemplate,
    nextTemplate: TemplateOption,
    nextInputs: Record<string, string>,
  ) => {
    const preset = resolveQuickApplyPreset(heroTemplate);
    const derivedTopic =
      nextInputs.topic ||
      nextInputs.productOrService ||
      nextInputs.speakerName ||
      nextInputs.character ||
      heroTemplate.topic_hint ||
      heroTemplate.title ||
      heroTemplate.name;
    const assembledScript = preset.script || heroTemplate.script_hint || heroTemplate.description || derivedTopic;
    const nextLanguage = nextInputs.language || heroTemplate.generation_defaults?.language || language;
    const nextVoice = heroTemplate.generation_defaults?.voice || voice;
    const recommendedModelKey =
      heroTemplate.generation_defaults?.model_key ||
      heroTemplate.recommended_model?.internal_model_key ||
      nextTemplate.defaultModelKey;

    setSelectedTemplate(nextTemplate.key);
    setAppliedHeroTemplateId(heroTemplate.id);
    setAppliedHeroTemplateInputs(nextInputs);
    setAppliedHeroTemplatePromptOverride(assembledScript);
    setAppliedHeroTemplateModelOverride('');
    setTopic(derivedTopic);
    setTitle(derivedTopic);
    setScript(assembledScript);
    setLanguage(nextLanguage);
    setVoice(nextVoice);
    if (recommendedModelKey) {
      const recommendedLane = sharedModelMap[recommendedModelKey]?.lane as VideoLaneKey | undefined;
      if (recommendedLane) setVideoLane(recommendedLane);
      setModelKey(recommendedModelKey as VideoModelKey);
    }
    if (
      heroTemplate.generation_defaults?.aspect_ratio &&
      ['9:16', '16:9', '1:1'].includes(heroTemplate.generation_defaults.aspect_ratio)
    ) {
      setAspectRatio(heroTemplate.generation_defaults.aspect_ratio as '9:16' | '16:9' | '1:1');
    }
    if (
      heroTemplate.generation_defaults?.resolution &&
      RESOLUTION_OPTIONS.some((item) => item.value === heroTemplate.generation_defaults?.resolution)
    ) {
      setResolution(heroTemplate.generation_defaults.resolution as '720p' | '1080p');
    }
    if (heroTemplate.generation_defaults?.quality && ['standard', 'high'].includes(heroTemplate.generation_defaults.quality)) {
      setQuality(heroTemplate.generation_defaults.quality as 'standard' | 'high');
    }
    if (heroTemplate.generation_defaults?.duration_seconds) {
      const normalizedDuration = normalizeDurationForModel(
        recommendedModelKey || modelKey,
        heroTemplate.generation_defaults.duration_seconds,
      );
      setDurationSeconds(String(normalizedDuration || heroTemplate.generation_defaults.duration_seconds));
    }
    setCaptionsEnabled(preset.captionsEnabled ?? true);
    setNarrationEnabled(preset.narrationEnabled ?? true);
    setSubmitError(null);
    setScriptError(null);
    setActiveTemplateState('ready');
    setQuickStartFeedback({
      title: 'Recommended settings already applied',
      description: 'Start with a ready setup. You can refine it if needed before generating.',
    });
    focusComposeEditor();
  };

  const quickApplyTemplate = async (templateId: string) => {
    setTemplateApplyLoadingKey(templateId);
    const unifiedTemplate = unifiedVideoTemplates.find((item) => item.id === templateId || (item.legacy_mappings || []).includes(templateId));
    const nextTemplate =
      videoTemplates.find((item) => item.key === templateId) ??
      (unifiedTemplate ? mapUnifiedTemplateToVideoOption(unifiedTemplate) : null);

    if (!unifiedTemplate || !nextTemplate) {
      applyTemplateSelection(templateId, { openGuidedFlow: false });
      setActiveTemplateState(templateId === 'custom' ? null : 'ready');
      setQuickStartFeedback({
        title: 'Recommended settings already applied',
        description: 'You can tweak the script, output settings, or advanced controls any time.',
      });
      focusComposeEditor();
      setTemplateApplyLoadingKey(null);
      return;
    }

    const nextInputs = buildQuickApplyTemplateInputs(unifiedTemplate);
    applyTemplatePresetState(unifiedTemplate, nextTemplate, nextInputs);
    setTemplateApplyLoadingKey(null);
  };

  const applyQuickStartPreset = (intent: CreatorIntentKey) => {
    const preset = VIDEO_QUICK_START_PRESETS[intent];
    const nextTemplate = pickVideoQuickStartTemplate(videoTemplates, intent, preset);
    const preferredLaneModels = models.filter(
      (model) => (sharedModelMap[model.key]?.lane ?? 'creator_pro') === preset.lane && model.enabled !== false,
    );
    const nextModel =
      preferredLaneModels.find((model) => model.key === preset.modelKey) ??
      preferredLaneModels[0] ??
      models.find((model) => model.enabled !== false) ??
      models[0];

    if (nextModel) {
      const nextLane = (sharedModelMap[nextModel.key]?.lane ?? preset.lane) as VideoLaneKey;
      setVideoLane(nextLane);
      setModelKey(nextModel.key as VideoModelKey);
    } else {
      setVideoLane(preset.lane);
    }

    setAspectRatio(preset.aspectRatio);
    setResolution(preset.resolution);
    setQuality(preset.quality);
    setDurationMode('custom');
    setDurationSeconds(preset.durationSeconds);
    setCaptionsEnabled(preset.captionsEnabled);
    setNarrationEnabled(false);
    setSubmitError(null);
    setScriptError(null);
    setQuickStartFeedback({
      title: 'Recommended setup applied',
      description: 'Starter settings are loaded. You can tweak everything below before generating.',
    });

    if (nextTemplate) {
      applyTemplateSelection(nextTemplate.key, {
        openGuidedFlow: false,
        topicOverride: preset.topic,
        scriptOverride: preset.script,
        titleOverride: preset.title,
      });
    } else {
      setTopic(preset.topic);
      setScript(preset.script);
      setTitle(preset.title);
    }

    focusComposeEditor();
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
    setActiveTemplateState('customized');
    show({
      title: 'Guided template applied',
      message: `${activeTemplateFlow.title || activeTemplateFlow.name} is now driving the script and defaults in this studio.`,
      variant: 'success',
    });
  };

  const generateScript = async () => {
    const effectiveTemplate = selectedTemplate === 'custom' ? 'General' : template.label;
    const effectiveTopic = topic.trim() || (selectedTemplate === 'custom' ? 'General creator video concept' : template.topicHint);
    const durationForScript = normalizedDurationSeconds || durationRule.defaultSeconds;
    const scriptContext = {
      tone: template.description || selectedLane.description,
      lane: selectedLane.label,
      modelKey,
      modelLabel: selectedModel?.label,
      aspectRatio: aspectRatio,
      resolution,
      quality,
      durationSeconds: durationForScript,
      scriptHint: template.scriptHint,
      topicHint: template.topicHint,
      narrationEnabled,
      captionsEnabled,
    };

    setScriptLoading(true);
    setScriptError(null);
    try {
      if (selectedHeroTemplate && appliedHeroTemplateId) {
        const preview = await previewAppliedHeroTemplate(undefined);
        if (!preview) throw new Error('Template preview unavailable.');
        const nextScript = preview.scriptPreview || preview.videoPrompt || preview.prompt;
        if (!nextScript?.trim()) throw new Error('Template preview returned no script.');
        setScript(nextScript);
        setScriptTags(sanitizeTags([selectedHeroTemplate.category, selectedHeroTemplate.subcategory || '', ...(selectedHeroTemplate.suggested_platforms || [])]));
        setTitle(preview.title || effectiveTopic);
        return;
      }
      const result = await api.generateScriptV2(
        {
          template: effectiveTemplate,
          topic: effectiveTopic,
          language,
          ...scriptContext,
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
      show({
        title: script.trim() ? 'Fresh script generated' : 'Script draft ready',
        message: script.trim()
          ? 'We replaced the current draft with a new generated script. You can still edit it below.'
          : 'A creator-ready script draft is loaded. You can refine it below.',
        variant: 'success',
      });
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
      const durationForScript = normalizedDurationSeconds || durationRule.defaultSeconds;
      const scriptContext = {
        tone: template.description || selectedLane.description,
        lane: selectedLane.label,
        modelKey,
        modelLabel: selectedModel?.label,
        aspectRatio,
        resolution,
        quality,
        durationSeconds: durationForScript,
        scriptHint: template.scriptHint,
        topicHint: template.topicHint,
        narrationEnabled,
        captionsEnabled,
      };
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
      const result = await api.enhanceScriptV2({ script: script.trim(), template: template.label, language, ...scriptContext }, userId);
      setScript(result.script);
      setScriptTags(result.tags);
      if (topic.trim()) setTitle(topic.trim());
      show({
        title: 'Script improved',
        message: 'We rewrote the current draft to improve structure, cues, pacing, and CTA strength.',
        variant: 'success',
      });
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
    const previewSignature = JSON.stringify({
      text: previewText,
      language,
      voice: activeVoice,
      sampleRateHz: audioSampleRateHz,
    });
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
      voicePreviewSignature === previewSignature &&
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
    setVoicePreviewSignature(null);
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
      setVoicePreviewSignature(previewSignature);
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
      const preparedScript = ensureSmoothVideoScriptCues(script.trim());
      if (preparedScript !== script.trim()) {
        setScript(preparedScript);
      }
      const freshWallet = await api.getCreditWallet(userId);
      applyWallet(freshWallet);
      if (freshWallet.currentCredits < displayVideoEstimateCredits) {
        const message = `You need ${displayVideoEstimateCredits} credits, but only ${freshWallet.currentCredits} are available right now.`;
        setSubmitError(message);
        setRenderSessionPhase('idle');
        openLowBalanceModal(displayVideoEstimateCredits);
        show({ title: 'Not enough credits', message, variant: 'error', durationMs: 4200 });
        return;
      }
      const projectId = await ensureProjectForVideoRun();
      const result = await api.createAIVideo({
        template: template.label,
        templateId: selectedHeroTemplate?.id || appliedHeroTemplateId || undefined,
        script: preparedScript,
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
        durationSeconds: normalizedDurationSeconds || durationRule.defaultSeconds,
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

  const workflowSteps = useMemo(() => {
    const progress = jobStatus?.progress ?? uiRenderProgress;
    const isSuccess = renderSessionPhase === 'success' || jobStatus?.status === 'success';
    const isFailed = renderSessionPhase === 'failed' || jobStatus?.status === 'failed' || jobStatus?.status === 'provider_failed' || jobStatus?.status === 'timed_out';
    const referenceDone = selectedImageUrls.length === 0 ? true : progress >= 24 || isSuccess;
    const scenePlanDone = script.trim().length > 0 && (progress >= 36 || isSuccess);
    const sceneGenerationDone = progress >= 72 || isSuccess;
    const finalizingDone = progress >= 92 || isSuccess;
    return [
      {
        label: 'Script prepared',
        detail: script.trim() ? `${Math.max(1, sceneStrip.length)} scene beats ready` : 'Waiting for script',
        status: script.trim() ? 'done' : renderSessionPhase === 'idle' ? 'pending' : 'active',
      },
      {
        label: 'Reference inputs',
        detail: selectedImageUrls.length > 0 ? `${selectedImageUrls.length} image${selectedImageUrls.length === 1 ? '' : 's'} attached` : 'Using text-only guidance',
        status: referenceDone ? 'done' : renderSessionPhase === 'idle' ? 'pending' : 'active',
      },
      {
        label: 'Scene generation',
        detail: isSuccess ? `${sceneStrip.length} scenes completed` : progress > 0 ? `Progress ${Math.max(1, Math.round(progress))}%` : 'Waiting to start',
        status: isFailed ? 'failed' : sceneGenerationDone ? 'done' : renderSessionPhase === 'processing' || renderSessionPhase === 'queued' || renderSessionPhase === 'preparing' ? 'active' : 'pending',
      },
      {
        label: 'Finalize render',
        detail: narrationEnabled ? 'Voice and captions pass' : captionsEnabled ? 'Captions pass' : 'Final output pass',
        status: isFailed ? 'failed' : finalizingDone ? 'done' : renderSessionPhase === 'processing' && progress >= 72 ? 'active' : 'pending',
      },
    ] as const;
  }, [captionsEnabled, jobStatus?.progress, jobStatus?.status, narrationEnabled, renderSessionPhase, sceneStrip.length, script, selectedImageUrls.length, uiRenderProgress]);

  const createdSummary = useMemo(() => {
    if (!script.trim()) {
      return 'Add a script or start from a recipe to let RangManch plan and generate the reel.';
    }
    const lead = topic.trim() || title.trim() || 'Your current concept';
    const workflow = selectedImageUrls.length > 0 ? 'reference-led' : 'text-led';
    return `${lead} is set up as a ${workflow} ${aspectRatio} reel using ${selectedModel?.label ?? 'the selected model'} at ${resolution}.`;
  }, [aspectRatio, resolution, script, selectedImageUrls.length, selectedModel?.label, title, topic]);

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

      {!embedded ? (
        <StudioPageHeader
          eyebrow="Video Studio"
          title="Video workspace"
          description={prefersUnifiedComposer ? 'Start the idea in Create, then use this workspace for script refinement, voice preview, and output controls.' : 'Refine the script, voice, and output settings from one guided video workspace.'}
          actions={
            <>
              <Link href="/create">
                <Button variant="secondary" type="button" className="h-10 gap-2 rounded-[12px] px-4 text-sm">
                  <Sparkles className="h-4 w-4" />
                  Open Create
                </Button>
              </Link>
              <Badge variant="outline" className="px-3 py-2 text-xs">
                {creditWallet?.currentCredits ?? 0} credits
                {creditsRefreshing ? ' · refreshing' : ''}
              </Badge>
              <Badge variant="outline" className="px-3 py-2 text-xs">
                {CREATOR_INTENT_OPTIONS.find((item) => item.key === selectedIntent)?.label ?? 'Creator workflow'}
              </Badge>
            </>
          }
        />
      ) : null}
      {activeProject ? (
        <ActiveProjectBar
          project={activeProject}
          description="This video workflow is attached to the active project. New renders, prompt changes, and guided template runs will stay grouped there."
        />
      ) : null}

      {prefersUnifiedComposer ? (
        <Card className="border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-surface)/0.22)] px-4 py-4 backdrop-blur-md">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-text">Start in the unified composer</p>
              <p className="mt-1 text-xs text-muted">Use `/create` to provide the idea or prompt. This page now works best for refining scripts, voice, templates, and output settings after the concept is already set.</p>
            </div>
            <Link href="/create">
              <Button type="button" className="w-full sm:w-auto">Go to Create</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      {selectedHeroTemplate && appliedHeroTemplateId ? (
        <Card className="border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-elevated)/0.22)] px-4 py-3 backdrop-blur-md">
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
                  setActiveTemplateState(null);
                }}
              >
                Clear template
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className="space-y-5">
        {!embedded ? (
          <div className="rangmanch-studio-panel rounded-[var(--radius-xl)] border border-[hsl(var(--color-border-soft)/0.3)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.9),hsl(var(--color-elevated)/0.82))] px-4 py-4 backdrop-blur-xl sm:px-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.history.length > 1) {
                      router.back();
                      return;
                    }
                    router.push('/create');
                  }}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg)/0.68)] text-text transition hover:shadow-[0_0_0_1px_hsl(var(--color-hero-glow)/0.18)] hover:text-[hsl(var(--color-accent))]"
                  aria-label="Go back"
                >
                  <ArrowLeft className="h-4.5 w-4.5" />
                </button>
                <div className="min-w-0">
                  <p className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted">AI video studio</p>
                  <h1 className="mt-1 truncate text-2xl font-semibold tracking-tight text-text sm:text-[2rem]">{studioTitle}</h1>
                  <p className="mt-1 text-sm text-muted">Focused creation workspace for script refinement, generation, and output review.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="px-3 py-2 text-xs">
                  {creditWallet?.currentCredits ?? 0} credits
                  {creditsRefreshing ? ' · refreshing' : ''}
                </Badge>
                <Link href="/library">
                  <Button variant="secondary" className="gap-2 rounded-full px-4">
                    <Clapperboard className="h-4 w-4" />
                    Library
                  </Button>
                </Link>
                {job?.output_url ? (
                  <Button variant="secondary" onClick={() => void downloadVideo(job)} className="gap-2 rounded-full px-4">
                    <Download className="h-4 w-4" />
                    Export
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        <div className="grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)_320px] 2xl:grid-cols-[340px_minmax(0,1fr)_340px]">
          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            {activeProject ? (
              <ActiveProjectBar
                project={activeProject}
                description="This workflow is attached to the active project. New renders and prompt changes stay grouped there."
              />
            ) : null}

            {prefersUnifiedComposer ? (
              <Card className="border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-surface)/0.22)] px-4 py-4 backdrop-blur-md">
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-text">Start in the unified composer</p>
                  <p className="text-xs leading-6 text-muted">Use `/create` to provide the idea first. This studio is now optimized for video refinement, preview, and generation status.</p>
                  <Link href="/create">
                    <Button type="button" className="mt-1 rounded-full px-4">Go to Create</Button>
                  </Link>
                </div>
              </Card>
            ) : null}

            {selectedHeroTemplate && appliedHeroTemplateId ? (
              <Card className="border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-elevated)/0.22)] px-4 py-4 backdrop-blur-md">
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Guided workflow active</p>
                    <p className="mt-1 text-sm font-semibold text-text">{selectedHeroTemplate.title || selectedHeroTemplate.name}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">This recipe assembled your script and defaults. You can still refine the script, model, and output settings here.</p>
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
                      Edit recipe
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setAppliedHeroTemplateId(null);
                        setAppliedHeroTemplateInputs({});
                        setAppliedHeroTemplatePromptOverride('');
                        setAppliedHeroTemplateModelOverride('');
                        setActiveTemplateState(null);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              </Card>
            ) : null}

            <SectionCard
              title="Recipe / setup"
              description="Keep the setup light. Start from a proven format or tune the engine only if needed."
              icon={<Sparkles className="h-5 w-5" />}
              compact
            >
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text">Quick starts</p>
                    <p className="mt-1 text-xs text-muted">Pick a creator-ready starting point and keep moving.</p>
                  </div>
                  <Button variant="secondary" type="button" onClick={openTemplateBrowser} className="gap-2 rounded-[12px] px-3 text-sm">
                    <GalleryVerticalEnd className="h-3.5 w-3.5" />
                    Recipes
                  </Button>
                </div>
                <div className="grid gap-2">
                  {CREATOR_INTENT_OPTIONS.map((intent) => {
                    const preset = VIDEO_QUICK_START_PRESETS[intent.key];
                    const active = selectedIntent === intent.key && Boolean(quickStartFeedback);
                    return (
                      <button
                        key={`quick-${intent.key}`}
                        type="button"
                        onClick={() => applyQuickStartPreset(intent.key)}
                        className={`rounded-[16px] border px-3 py-3 text-left transition ${
                          active
                            ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.1)] text-text'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.24)] text-muted hover:text-text'
                        }`}
                      >
                        <p className="text-sm font-semibold text-text">{preset.title}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">{preset.description}</p>
                      </button>
                    );
                  })}
                </div>
                {quickStartFeedback ? (
                  <div className="rounded-[16px] border border-[hsl(var(--color-accent)/0.4)] bg-[hsl(var(--color-accent)/0.08)] px-3 py-2.5">
                    <p className="text-sm font-semibold text-text">{quickStartFeedback.title}</p>
                    <p className="mt-1 text-xs text-muted">{quickStartFeedback.description}</p>
                  </div>
                ) : null}
                <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-surface)/0.2)] px-3 py-2.5 text-xs text-muted">
                  Recommended now: <span className="font-semibold text-text">{recommendedEngineCopy}</span>
                </div>
                <VideoLaneSelector lane={videoLane} onChange={handleVideoLaneChange} />
                <ModelDropdown
                  models={visibleModels}
                  selectedModel={modelKey}
                  onChange={(value) => setModelKey(value as VideoModelKey)}
                  title="Engine"
                  description="Change only if you want to override the recommended engine."
                />
              </div>
            </SectionCard>

            <div ref={composeSectionRef}>
              <SectionCard
                title="Script & inputs"
                description="Keep the idea clear, add references if needed, and only preview voice when it helps."
                icon={<Film className="h-5 w-5" />}
                compact
              >
                <div className="space-y-4">
                  {prefersUnifiedComposer && !script.trim() && !topic.trim() ? (
                    <div className="rounded-[18px] border border-dashed border-[hsl(var(--color-border)/0.85)] bg-[hsl(var(--color-bg)/0.28)] p-5 text-sm text-muted">
                      Your video idea and script will appear here after you start from the unified composer.
                    </div>
                  ) : (
                    <div className="rounded-[18px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.24)] p-4">
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
                        qualityReport={scriptQualityReport}
                        scriptTextareaRef={scriptTextareaRef}
                      />
                    </div>
                  )}

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

                  <details className="rounded-[18px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.24)] p-4" open={narrationEnabled}>
                    <summary className="cursor-pointer list-none text-sm font-semibold text-text">Voice preview</summary>
                    <p className="mt-1 text-xs text-muted">Optional. Preview narration only when you need it.</p>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setNarrationEnabled((current) => !current)}
                        className={`rounded-[14px] border px-3 py-2 text-left text-xs font-medium transition ${
                          narrationEnabled
                            ? 'border-[hsl(var(--color-accent)/0.45)] bg-[hsl(var(--color-accent)/0.14)] text-text'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] text-muted'
                        }`}
                      >
                        Voice {narrationEnabled ? 'On' : 'Off'}
                      </button>
                    </div>
                    {narrationEnabled ? (
                      <>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Language</span>
                            <Dropdown value={language} onChange={(event) => void handleLanguageChange(event.target.value)} disabled={voiceTranslationLoading}>
                              {languageOptions.map((option) => (
                                <option key={`${option.label}-${option.code}`} value={option.label}>{option.label}</option>
                              ))}
                            </Dropdown>
                          </label>
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Voice</span>
                            <Dropdown value={voice} onChange={(event) => handleVoiceChange(event.target.value)}>
                              {(filteredVoiceOptions.length > 0 ? filteredVoiceOptions : voiceOptions).map((option) => (
                                <option key={option.key} value={option.key}>{formatVoiceOptionLabel(option)}</option>
                              ))}
                            </Dropdown>
                          </label>
                        </div>
                        <label className="mt-3 block">
                          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.18em] text-muted">Preview line</span>
                          <Textarea
                            value={voicePreviewText}
                            onChange={(event) => setVoicePreviewText(event.target.value)}
                            rows={3}
                            maxLength={280}
                            className="min-h-[108px] bg-[hsl(var(--color-surface)/0.22)]"
                            placeholder="Add a short line to hear the narration style."
                          />
                        </label>
                        <div ref={voicePreviewControlsRef} className="mt-3 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="secondary"
                              onClick={() => void previewVoice()}
                              disabled={!voicePreviewText.trim() || voiceTranslationLoading || Boolean(voicePreviewLoadingKey)}
                            >
                              {voicePreviewLoadingKey === voice ? <><Spinner className="h-4 w-4" />Preparing preview...</> : <><Mic2 className="h-4 w-4" />Preview narration</>}
                            </Button>
                            {voiceCreditMap ? (
                              <Badge variant="outline" className="px-2.5 py-1 text-[11px]">
                                {(() => {
                                  const voiceCost = voiceCreditMap[voice];
                                  if (typeof voiceCost !== 'number' || voiceCost < 0) return 'Estimating';
                                  if (voiceCost === 0) return 'Free preview';
                                  return `+${voiceCost} credits`;
                                })()}
                              </Badge>
                            ) : null}
                          </div>
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
                              />
                              {!voicePreviewing ? (
                                <button
                                  type="button"
                                  onClick={() => void playExistingVoicePreview()}
                                  className="inline-flex items-center gap-2 rounded-[12px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.8)] px-3 py-2 text-xs font-semibold text-text transition hover:border-[hsl(var(--color-accent))] hover:text-[hsl(var(--color-accent))]"
                                >
                                  <Mic2 className="h-3.5 w-3.5" />
                                  Play preview again
                                </button>
                              ) : null}
                            </div>
                          ) : (
                            <audio ref={voicePreviewAudioRef} onEnded={() => setVoicePreviewing(false)} onPause={() => setVoicePreviewing(false)} />
                          )}
                          {voicePreviewMessage || voicePreviewError ? (
                            <div className="space-y-1 text-xs leading-5 text-muted">
                              {voicePreviewMessage ? <p className="text-[hsl(var(--color-warning))]">{voicePreviewMessage}</p> : null}
                              {voicePreviewError ? <p className="text-[hsl(var(--color-danger))]">{voicePreviewError}</p> : null}
                            </div>
                          ) : null}
                        </div>
                      </>
                    ) : null}
                  </details>

                  <SectionCard
                    title="Output settings"
                    description="Choose the format and quality for the platform you plan to publish on."
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
                      supportsCustomDuration={supportsCustomDuration}
                      minDuration={minDuration}
                      maxDuration={maxDuration}
                      durationHelperText={hasReferenceImages && seededDuration ? 'Image-seeded clips are currently fixed to 8 seconds for this model.' : durationRule.helperText}
                      durationError={durationError}
                      captionsEnabled={captionsEnabled}
                      onCaptionsEnabledChange={setCaptionsEnabled}
                      captionStyle={captionStyle}
                      onCaptionStyleChange={setCaptionStyle}
                    />
                  </SectionCard>
                </div>
              </SectionCard>
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            <Card className="overflow-hidden rounded-[var(--radius-xl)] border border-[hsl(var(--color-border-soft)/0.3)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.84),hsl(var(--color-bg)/0.92))] px-4 py-4 backdrop-blur-xl sm:px-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--color-accent))]">Preview</p>
                  <h2 className="mt-1 font-heading text-xl font-extrabold tracking-tight text-text sm:text-2xl">Portrait-first studio preview</h2>
                  <p className="mt-1 text-sm text-muted">Keep the focus on the reel. This studio stays AI-first, with just enough control around the output.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline" className="px-3 py-2 text-xs">{aspectRatio}</Badge>
                  <Badge variant="outline" className="px-3 py-2 text-xs">{selectedResolutionDimensions || resolution}</Badge>
                  <Badge variant="outline" className="px-3 py-2 text-xs">{selectedModel?.shortLabel ?? selectedModel?.label ?? 'Model'}</Badge>
                </div>
              </div>

              <div className="mt-4 rounded-[28px] border border-[hsl(var(--color-border-soft)/0.3)] bg-[radial-gradient(circle_at_bottom,hsl(var(--color-accent)/0.16),transparent_38%),hsl(var(--color-bg)/0.88)] p-4">
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

              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[18px] border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg)/0.5)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Workflow</p>
                  <p className="mt-1 text-sm font-semibold text-text">{CREATOR_INTENT_OPTIONS.find((item) => item.key === selectedIntent)?.label ?? (selectedImageUrls.length > 0 ? 'Image to video' : 'Text to video')}</p>
                </div>
                <div className="rounded-[18px] border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg)/0.5)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Estimated time</p>
                  <p className="mt-1 text-sm font-semibold text-text">{estimatedTime}</p>
                </div>
                <div className="rounded-[18px] border border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg)/0.5)] px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-muted">Credits</p>
                  <p className="mt-1 text-sm font-semibold text-text">₹{estimatedInr ?? 0} · {displayVideoEstimateCredits}</p>
                </div>
              </div>
            </Card>
          </section>

          <aside className="space-y-4 xl:sticky xl:top-5 xl:self-start">
            <Card className="rounded-[var(--radius-xl)] border border-[hsl(var(--color-border-soft)/0.3)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.88),hsl(var(--color-elevated)/0.82))] px-4 py-4 backdrop-blur-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">AI workflow</p>
                  <h3 className="mt-1 text-lg font-semibold text-text">Generation status</h3>
                  <p className="mt-1 text-sm text-muted">A focused view of what the studio is doing right now.</p>
                </div>
                <Badge variant="outline" className="px-2.5 py-1 text-[11px]">{renderSessionPhase}</Badge>
              </div>

              <div className="mt-4 space-y-3">
                {workflowSteps.map((step) => (
                  <div
                    key={step.label}
                    className={`rounded-[18px] border px-3.5 py-3 ${
                      step.status === 'done'
                        ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.1)]'
                        : step.status === 'active'
                          ? 'border-[hsl(var(--color-border)/0.75)] bg-[hsl(var(--color-surface)/0.34)]'
                          : step.status === 'failed'
                            ? 'border-[hsl(var(--color-danger)/0.45)] bg-[hsl(var(--color-danger)/0.08)]'
                            : 'border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.45)]'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full ${
                        step.status === 'done'
                          ? 'bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                          : step.status === 'active'
                            ? 'bg-[hsl(var(--color-surface))] text-[hsl(var(--color-accent))]'
                            : step.status === 'failed'
                              ? 'bg-[hsl(var(--color-danger))] text-white'
                              : 'bg-[hsl(var(--color-surface))] text-muted'
                      }`}>
                        {step.status === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PlayCircle className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-text">{step.label}</p>
                        <p className="mt-1 text-xs leading-5 text-muted">{step.detail}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-[18px] border border-[hsl(var(--color-border)/0.58)] bg-[hsl(var(--color-bg)/0.45)] px-4 py-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-muted">What was created</p>
                <p className="mt-2 text-sm leading-6 text-text">{createdSummary}</p>
              </div>

              <div className="mt-4">
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
                          ? narrationEnabled
                            ? `Audio quality: ${AUDIO_QUALITY_OPTIONS.find((item) => item.value === audioSampleRateHz)?.label ?? '22 kHz'} · estimated balance after render ${creditEstimate.remainingCredits} credits`
                            : `Estimated balance after render ${creditEstimate.remainingCredits} credits`
                          : isEstimating
                            ? 'Estimating credits for selected settings.'
                            : `${selectedLane.shortLabel} estimate uses the shared pricing engine. Final validation happens on submit.`
                  }
                />
              </div>

              {submitError ? (
                <div className="mt-4 rounded-[18px] border border-[hsl(var(--color-danger))] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3">
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

              <div className="mt-4 flex flex-wrap gap-2">
                <Link href="/library">
                  <Button variant="secondary" className="gap-2 rounded-full px-4">
                    <Clapperboard className="h-4 w-4" />
                    Open library
                  </Button>
                </Link>
                {job?.output_url ? (
                  <Button variant="secondary" onClick={() => void downloadVideo(job)} className="gap-2 rounded-full px-4">
                    <Download className="h-4 w-4" />
                    Download
                  </Button>
                ) : null}
              </div>
            </Card>
          </aside>
        </div>

        <Card className="overflow-hidden rounded-[var(--radius-xl)] border border-[hsl(var(--color-border-soft)/0.3)] bg-[linear-gradient(180deg,hsl(var(--color-surface)/0.84),hsl(var(--color-bg)/0.92))] px-4 py-4 backdrop-blur-xl sm:px-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[hsl(var(--color-accent))]">Timeline</p>
              <h3 className="mt-1 text-lg font-semibold text-text">Scene strip</h3>
              <p className="mt-1 text-sm text-muted">A lightweight visual structure for the reel, without turning this into a full manual editor.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{sceneStrip.length} scenes</Badge>
              <Badge variant="outline">{normalizedDurationSeconds || durationRule.defaultSeconds || 8}s</Badge>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {sceneStrip.map((scene, index) => (
              <div
                key={`${scene}-${index}`}
                className="rounded-[22px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-bg)/0.52)] p-3"
              >
                <div className="relative overflow-hidden rounded-[18px] border border-[hsl(var(--color-border)/0.55)] bg-black">
                  {selectedImageUrls[index] || selectedImageUrls[0] ? (
                    <img
                      src={selectedImageUrls[index] || selectedImageUrls[0]}
                      alt={`Scene ${index + 1}`}
                      className="aspect-[9/16] w-full object-cover opacity-90"
                    />
                  ) : (
                    <div className="flex aspect-[9/16] items-center justify-center bg-[radial-gradient(circle_at_center,hsl(var(--color-accent)/0.16),transparent_46%),hsl(var(--color-surface)/0.75)] text-muted">
                      <Film className="h-7 w-7" />
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                  <span className="absolute left-3 top-3 inline-flex rounded-full border border-white/12 bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
                    Scene {index + 1}
                  </span>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-text">{scene}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
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
              <div className="overflow-hidden rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.28)]">
                {activeTemplateFlow.preview_image_url || activeTemplateFlow.thumbnail_url ? (
                  <img
                    src={activeTemplateFlow.preview_image_url || activeTemplateFlow.thumbnail_url}
                    alt={activeTemplateFlow.title || activeTemplateFlow.name}
                    className="aspect-[5/4] max-h-[220px] w-full object-cover sm:max-h-[280px] xl:max-h-none"
                  />
                ) : (
                  <div className="flex aspect-[5/4] max-h-[220px] items-center justify-center bg-[hsl(var(--color-bg)/0.72)] text-sm text-muted sm:max-h-[280px] xl:max-h-none">
                    Template preview
                  </div>
                )}
              </div>
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.24)] p-4">
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
                <div className="mt-4 rounded-[14px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.45)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Recommended setup</p>
                  <p className="mt-2 text-sm font-semibold text-text">
                    {templateFlowPreview?.recommendedModel?.label || activeTemplateFlow.recommended_model?.label || 'Included'}
                  </p>
                  <p className="mt-1 text-sm text-muted">
                    {templateFlowPreview?.recommendedModel?.description || activeTemplateFlow.recommended_model?.description || 'Use as-is or adjust before applying.'}
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.24)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Start with a prompt. Everything else is optional.</p>
                    <p className="mt-1 text-sm text-muted">Templates are ready-made formats. Recommended settings already applied. You can refine this later.</p>
                  </div>
                  {templateFlowEstimate ? (
                    <span className="inline-flex rounded-full border border-[hsl(var(--color-border))] px-3 py-1 text-xs font-semibold text-text">
                      {templateFlowEstimate.estimatedCredits} credits
                    </span>
                  ) : null}
                </div>
                <div className="mt-4 space-y-3">
                  {(activeTemplateFlow.inputs || [])
                    .filter((field) => field.key === 'topic')
                    .map((field) => {
                      const value = templateFlowInputs[field.key] || '';
                      return (
                        <div key={field.key} className="space-y-1.5">
                          <label className="text-sm font-medium text-text">{field.label}</label>
                          {getTemplateFieldHint(field) ? <p className="text-xs text-muted">{getTemplateFieldHint(field)}</p> : null}
                          <Input
                            value={value}
                            onChange={(e) => setTemplateFlowInputs((current) => ({ ...current, [field.key]: e.target.value }))}
                            placeholder={field.placeholder || `Insert ${field.label.toLowerCase()} here`}
                          />
                        </div>
                      );
                    })}
                  {!((activeTemplateFlow.inputs || []).some((field) => field.key === 'topic')) ? (
                    <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.4)] px-3 py-2.5 text-sm text-muted">
                      This template already has a ready starter setup. You can use the recommended setup as-is or expand the optional details below.
                    </div>
                  ) : null}
                  {canApplyStructuredTemplateFlow ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" onClick={applyStructuredTemplateFlow} className="rounded-full px-4 py-2 text-xs">
                        Use recommended setup
                      </Button>
                      <span className="text-xs text-muted">Recommended settings already applied.</span>
                    </div>
                  ) : null}
                  <details className="rounded-[14px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.4)] p-3">
                    <summary className="cursor-pointer list-none text-sm font-semibold text-text">Optional details</summary>
                    <p className="mt-1 text-xs text-muted">Audience, tone, duration, CTA, project, and any extra context. Keep these blank unless they help.</p>
                    <div className="mt-3 space-y-3">
                      {primarySubtypeField ? (
                        <div className="space-y-2">
                          <label className="text-sm font-medium text-text">Format</label>
                          <p className="text-xs text-muted">Choose the structure you want, like story, top 5, or before-after.</p>
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
                      {remainingTemplateFlowFields
                        .filter((field) => field.key !== 'topic')
                        .filter((field) => TEMPLATE_OPTIONAL_DETAIL_KEYS.has(field.key) || !field.required)
                        .map((field) => {
                          const options = normalizeTemplateOptions(field);
                          const value = templateFlowInputs[field.key] || '';
                          return (
                            <div key={field.key} className="space-y-1.5">
                              <label className="text-sm font-medium text-text">{field.label}</label>
                              {getTemplateFieldHint(field) ? <p className="text-xs text-muted">{getTemplateFieldHint(field)}</p> : null}
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
                                  placeholder={field.placeholder || `Insert ${field.label.toLowerCase()} here`}
                                />
                              ) : (
                                <Input
                                  value={value}
                                  onChange={(e) => setTemplateFlowInputs((current) => ({ ...current, [field.key]: e.target.value }))}
                                  placeholder={field.placeholder || `Insert ${field.label.toLowerCase()} here`}
                                />
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </details>
                </div>
              </div>

              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.24)] p-4">
                <details className="rounded-[14px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.4)] p-3" open={false}>
                  <summary className="cursor-pointer list-none text-sm font-semibold text-text">Advanced settings</summary>
                  <p className="mt-1 text-xs text-muted">Engine override and prompt mode for creators who want extra control.</p>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium text-text">Advanced engine override</label>
                      <Input
                        value={templateFlowModelOverride}
                        onChange={(e) => setTemplateFlowModelOverride(e.target.value)}
                        placeholder={activeTemplateFlow.recommended_model?.internal_model_key || activeTemplateFlow.generation_defaults?.model_key || 'Leave blank to use recommended'}
                      />
                    </div>
                    <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-bg)/0.45)] px-4 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Prompt mode</p>
                      <p className="mt-2 text-sm font-semibold text-text">
                        {templateFlowPreview?.recommendedModelMode || activeTemplateFlow.default_model_mode || 'Smart default'}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <label className="text-sm font-medium text-text">Project</label>
                    <p className="text-xs text-muted">Optional. Save this workflow into a specific project.</p>
                    <Dropdown value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
                      <option value="">Auto-create a project when this template is applied</option>
                      {projects.map((project) => (
                        <option key={project.id} value={project.id}>
                          {project.title}
                        </option>
                      ))}
                    </Dropdown>
                  </div>

                  <div className="mt-4 space-y-1.5">
                    <label className="text-sm font-medium text-text">Script override</label>
                    <p className="text-xs text-muted">Optional. Use this only if you want to replace the starter script completely.</p>
                    <Textarea
                      value={templateFlowPromptOverride}
                      onChange={(e) => setTemplateFlowPromptOverride(e.target.value)}
                      placeholder="Optional. Override the generated script if you want more control."
                      rows={5}
                    />
                  </div>
                </details>
              </div>

              <div className="rounded-[16px] border border-[hsl(var(--color-border)/0.6)] bg-[hsl(var(--color-surface)/0.24)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-text">Preview</p>
                    <p className="mt-1 text-sm text-muted">Review the assembled result before applying it to the studio.</p>
                  </div>
                  {templateFlowPreviewLoading ? <Spinner /> : null}
                </div>
                {templateFlowMissingRequired.length > 0 ? (
                  <p className="mt-3 text-xs text-muted">
                    Fill {templateFlowMissingRequired.map((field) => field.label).join(', ')} to build the guided preview.
                  </p>
                ) : null}
                <div className="mt-4 space-y-3">
                  <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Prompt title</p>
                    <p className="mt-2 text-sm font-semibold text-text">
                      {templateFlowPreview?.title || activeTemplateFlow.topic_hint || activeTemplateFlow.title || activeTemplateFlow.name}
                    </p>
                  </div>
                  <div className="rounded-[18px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.72)] px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Script preview</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-text">
                      {templateFlowPreview?.scriptPreview || templateFlowPreview?.videoPrompt || templateFlowPreview?.prompt || activeTemplateFlow.script_hint || 'Your script preview will appear after you answer a few key questions.'}
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
                    Use recommended setup
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
