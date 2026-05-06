'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  AudioLines,
  CheckCircle2,
  Clapperboard,
  Copy,
  Download,
  Expand,
  Image as ImageIcon,
  Music4,
  Pause,
  Play,
  Plus,
  SlidersHorizontal,
  Sparkles,
  Wand2,
} from 'lucide-react';

import { useCredits } from '@/components/credits/CreditContext';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Dropdown } from '@/components/ui/Dropdown';
import { PacmanLoader } from '@/components/ui/PacmanLoader';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AIVideoStatusResponse, MusicTrack, TTSLanguageOption, TTSVoiceOption, Video, VideoStudioChatMessage } from '@/types/api';

type Props = {
  userId: string;
  videoId: string;
};

type AssetTab = 'visual' | 'bgm' | 'speech';

const VOICE_PREVIEW_SAMPLES: Record<string, string> = {
  'en-IN': 'This is a preview of the selected narration voice for your video.',
  'hi-IN': 'यह चुनी गई आवाज़ का एक छोटा नमूना है, ताकि आप नैरेशन का टोन सुन सकें।',
  'hi-IN-x-hinglish': 'Yeh selected voice ka ek chhota sample hai, taaki aap narration ka tone sun sakein.',
};

function toAbsoluteUrl(url: string | null) {
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${API_URL}${url}`;
}

function formatClock(seconds: number | null | undefined) {
  const safeSeconds = Math.max(0, Math.floor(seconds ?? 0));
  const mins = String(Math.floor(safeSeconds / 60)).padStart(2, '0');
  const secs = String(safeSeconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function formatLongDuration(seconds: number | null | undefined) {
  const safeSeconds = Math.max(0, Number(seconds ?? 0));
  return safeSeconds % 1 === 0 ? `${safeSeconds.toFixed(0)}s` : `${safeSeconds.toFixed(1)}s`;
}

function getStage(progress: number, status: Video['status']) {
  if (status === 'draft') {
    return {
      label: 'Queueing render',
      detail: 'Preparing recipe steps, assets, and render slots.',
    };
  }
  if (progress < 35) {
    return {
      label: 'Building scenes',
      detail: 'Arranging scenes, references, and the first clip plan.',
    };
  }
  if (progress < 70) {
    return {
      label: 'Generating visuals',
      detail: 'Rendering the main clips and aligning motion for the final edit.',
    };
  }
  return {
    label: 'Finishing audio and export',
    detail: 'Balancing music, finalizing captions, and encoding the final file.',
  };
}

function progressDone(progress: number, threshold: number) {
  return progress >= threshold;
}

function getStageTodos(video: Video) {
  const visualLabel =
    video.reference_images.length > 0 || video.source_image_url
      ? 'Generate video using the attached reference image'
      : 'Generate video scenes from the prompt and selected model';
  const bgmLabel =
    video.music_mode !== 'none'
      ? `Prepare ${video.music_mode === 'library' ? 'selected' : video.music_mode} music for the final mix`
      : 'Skip music layer for this render';
  const timelineLabel = `Assemble timeline at ${video.aspect_ratio} · ${video.resolution}`;

  const status = video.status;
  if (status === 'completed') {
    return [
      { label: visualLabel, complete: true },
      { label: bgmLabel, complete: true },
      { label: timelineLabel, complete: true },
    ];
  }
  if (status === 'failed' || status === 'provider_failed' || status === 'timed_out') {
    return [
      { label: visualLabel, complete: progressDone(video.progress, 35) },
      { label: bgmLabel, complete: progressDone(video.progress, 70) },
      { label: timelineLabel, complete: false },
    ];
  }
  return [
    { label: visualLabel, complete: progressDone(video.progress, 35) },
    { label: bgmLabel, complete: progressDone(video.progress, 70) },
    { label: timelineLabel, complete: progressDone(video.progress, 92) },
  ];
}

function pillToneClass(value: React.ReactNode) {
  if (value === 'Text to Video') {
    return 'border border-sky-400/30 bg-sky-500/10 text-sky-700 dark:text-sky-100';
  }
  if (value === 'Image to Video') {
    return 'border border-emerald-400/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-100';
  }
  if (value === 'Reference to Video') {
    return 'border border-amber-400/35 bg-amber-500/12 text-amber-700 dark:text-amber-100';
  }
  return 'bg-[hsl(var(--color-bg-soft))] text-muted';
}

function SoftPill({ children }: { children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] ${pillToneClass(children)}`}>
      {children}
    </span>
  );
}

function inferGenerationType(video: Video) {
  const selectedModel = String(video.selected_model || '').toLowerCase();
  const providerName = String(video.provider_name || '').toLowerCase();
  const recipeId = String(video.recipe_id || '').toLowerCase();
  const hasSourceImage = Boolean(video.source_image_url || video.image_urls?.length || video.reference_images?.length);

  if (
    selectedModel.includes('reference')
    || providerName.includes('reference')
    || recipeId.includes('reference')
    || recipeId === 'anime_lofi_reel'
    || recipeId === 'avatar_product'
  ) {
    return 'Reference to Video';
  }

  if (hasSourceImage) {
    return 'Image to Video';
  }

  return 'Text to Video';
}

function formatEventStamp(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function eventStateTone(state?: string) {
  if (state === 'failed' || state === 'error') {
    return 'bg-[hsl(var(--color-danger)/0.12)] text-[hsl(var(--color-danger))]';
  }
  if (state === 'pending' || state === 'running' || state === 'processing') {
    return 'bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))]';
  }
  return 'bg-[hsl(var(--color-success)/0.12)] text-[hsl(var(--color-success))]';
}

function buildVoicePreviewText(languageCode: string, narrationScript: string) {
  const trimmed = narrationScript.trim();
  if (!trimmed) {
    return VOICE_PREVIEW_SAMPLES[languageCode] ?? VOICE_PREVIEW_SAMPLES['en-IN'];
  }
  if (languageCode === 'en-IN') {
    return trimmed.slice(0, 240);
  }
  const looksAsciiHeavy = /^[\x00-\x7F\s.,!?'"()\-:;]+$/.test(trimmed);
  if (looksAsciiHeavy) {
    return VOICE_PREVIEW_SAMPLES[languageCode] ?? VOICE_PREVIEW_SAMPLES['en-IN'];
  }
  return trimmed.slice(0, 240);
}

function safelyCloseAudioContext(audioContext: AudioContext | null | undefined) {
  if (!audioContext) return;
  if (audioContext.state === 'closed') return;
  void audioContext.close().catch(() => undefined);
}

function mergeVideoWithStatus(video: Video, status: AIVideoStatusResponse): Video {
  const normalizedStatus: Video['status'] =
    status.status === 'success'
      ? 'completed'
      : status.status === 'timed_out'
        ? 'timed_out'
        : status.status === 'provider_failed'
          ? 'provider_failed'
          : status.status === 'failed'
            ? 'failed'
            : status.status === 'queued'
              ? 'draft'
              : 'processing';

  return {
    ...video,
    status: normalizedStatus,
    progress: typeof status.progress === 'number' ? status.progress : video.progress,
    output_url: status.videoUrl ?? video.output_url,
    thumbnail_url: status.thumbnailUrl ?? video.thumbnail_url,
    error_message: status.errorMessage ?? video.error_message,
    selected_model: status.modelKey ?? video.selected_model,
    provider_name: status.provider ?? status.modelLabel ?? video.provider_name,
    resolution: status.resolution || video.resolution,
    aspect_ratio: status.aspectRatio || video.aspect_ratio,
    duration_seconds: status.durationSeconds ?? video.duration_seconds,
    auto_tags: Array.isArray(status.tags) ? status.tags : video.auto_tags,
    tts_provider: status.ttsProvider ?? video.tts_provider,
    tts_resolved_voice: status.ttsResolvedVoice ?? video.tts_resolved_voice,
    tts_provider_message: status.ttsProviderMessage ?? video.tts_provider_message,
    tts_fallback_used: typeof status.ttsFallbackUsed === 'boolean' ? status.ttsFallbackUsed : video.tts_fallback_used,
    pipeline_metadata: (status.pipelineMetadata as Video['pipeline_metadata'] | null | undefined) ?? video.pipeline_metadata,
  };
}

async function decodeWaveformFromUrl(sourceUrl: string, audioContext: AudioContext) {
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Could not load waveform source: ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
  const channelData = audioBuffer.getChannelData(0);
  const sampleCount = 56;
  const blockSize = Math.max(1, Math.floor(channelData.length / sampleCount));

  return Array.from({ length: sampleCount }, (_, index) => {
    const start = index * blockSize;
    const end = Math.min(channelData.length, start + blockSize);
    let sum = 0;

    for (let cursor = start; cursor < end; cursor += 1) {
      sum += Math.abs(channelData[cursor] || 0);
    }

    const average = sum / Math.max(1, end - start);
    return Math.max(0.12, Math.min(1, average * 3.2));
  });
}


export function VideoDetailClient({ userId, videoId }: Props) {
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusRefreshWarning, setStatusRefreshWarning] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [assetTab, setAssetTab] = useState<AssetTab>('visual');
  const [sharing, setSharing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>([]);
  const [languageOptions, setLanguageOptions] = useState<TTSLanguageOption[]>([]);
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null);
  const [voicePreviewing, setVoicePreviewing] = useState(false);
  const [applyingVoice, setApplyingVoice] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState('en-IN');
  const [translatedScripts, setTranslatedScripts] = useState<Record<string, string>>({});
  const [translatingScript, setTranslatingScript] = useState(false);
  const [voicePreviewMessage, setVoicePreviewMessage] = useState<string | null>(null);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<VideoStudioChatMessage[]>([]);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [todoOverrides, setTodoOverrides] = useState<Record<string, boolean>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const { wallet, refreshing } = useCredits();
  const { show } = useToast();
  const terminalToastRef = useRef<string | null>(null);

  const loadBase = async () => {
    try {
      const [current, musicTracks] = await Promise.all([
        api.getVideo(videoId, userId),
        api.listMusicTracks().catch(() => [] as MusicTrack[]),
      ]);
      setVideo(current);
      setTracks(musicTracks);
      void api
        .getTtsCatalog(userId)
        .then((catalog) => {
          setVoiceOptions(catalog.voices);
          setLanguageOptions(catalog.languages);
          if (catalog.languages[0]) {
            setSelectedLanguage((currentLanguage) => currentLanguage || catalog.languages[0].code);
          }
        })
        .catch(() => null);
      setError(null);
      setStatusRefreshWarning(null);
    } catch {
      setError('Unable to load video status.');
    } finally {
      setLoading(false);
    }
  };

  const refreshStatus = async () => {
    const currentVideo = video;
    if (!currentVideo) return;
    try {
      const status = await api.getAIVideoStatus(videoId, userId);
      setVideo((previous) => (previous ? mergeVideoWithStatus(previous, status) : previous));
      setStatusRefreshWarning(null);
    } catch {
      setStatusRefreshWarning('Status refresh delayed. We’ll retry automatically.');
    }
  };

  useEffect(() => {
    void loadBase();
  }, [videoId, userId]);

  useEffect(() => {
    if (!video) return;
    void refreshStatus();
  }, [video?.id]);

  useEffect(() => {
    if (!video) return;
    if (video.status === 'completed' || video.status === 'failed' || video.status === 'provider_failed' || video.status === 'timed_out') {
      return;
    }

    const interval = setInterval(() => {
      void refreshStatus();
    }, 3000);

    return () => clearInterval(interval);
  }, [video?.status]);

  useEffect(() => {
    if (!video) return;
    if (!terminalToastRef.current && (video.status === 'completed' || video.status === 'failed' || video.status === 'provider_failed' || video.status === 'timed_out')) {
      terminalToastRef.current = `${video.id}:${video.status}`;
      if (video.status === 'completed') {
        show({
          title: 'Video ready',
          message: 'Your video finished rendering and is ready to preview.',
          variant: 'success',
        });
      } else {
        show({
          title: video.status === 'timed_out' ? 'Generation timed out' : 'Video generation failed',
          message: video.error_message || 'The render did not complete successfully.',
          variant: 'error',
        });
      }
      return;
    }
    if (video.status !== 'completed' && video.status !== 'failed' && video.status !== 'provider_failed' && video.status !== 'timed_out') {
      terminalToastRef.current = null;
    }
  }, [show, video]);

  const posterUrl = useMemo(() => {
    if (!video) return null;
    return toAbsoluteUrl(video.thumbnail_url) ?? toAbsoluteUrl(video.source_image_url) ?? toAbsoluteUrl(video.reference_images[0] ?? null);
  }, [video]);
  const displayPosterUrl = posterUrl;

  const outputUrl = useMemo(() => (video ? toAbsoluteUrl(video.output_url) : null), [video]);
  const narrationScript = useMemo(() => {
    const pipelineNarration = video?.pipeline_metadata?.narration_script;
    if (typeof pipelineNarration === 'string' && pipelineNarration.trim()) {
      return pipelineNarration.trim();
    }
    return video?.script?.trim() || '';
  }, [video]);
  const narrationSourceType = useMemo(() => {
    const source = video?.pipeline_metadata?.narration_source_type;
    return typeof source === 'string' ? source : null;
  }, [video]);
  const narrationSourceLabel = useMemo(() => {
    if (narrationSourceType === 'openai_explainer_script') {
      return 'AI narration script';
    }
    if (narrationSourceType === 'fallback_template') {
      return 'Fallback narration';
    }
    return 'Render script';
  }, [narrationSourceType]);
  const selectedLanguageLabel = useMemo(
    () => languageOptions.find((option) => option.code === selectedLanguage)?.label ?? selectedLanguage,
    [languageOptions, selectedLanguage],
  );
  const displayedNarrationScript = useMemo(() => {
    if (selectedLanguage === 'en-IN') {
      return narrationScript;
    }
    return translatedScripts[selectedLanguage] || narrationScript;
  }, [narrationScript, selectedLanguage, translatedScripts]);

  const referenceImages = useMemo(() => {
    if (!video) return [];
    const candidates = [video.source_image_url, ...video.reference_images, ...video.image_urls]
      .filter(Boolean)
      .map((url) => toAbsoluteUrl(url as string))
      .filter(Boolean) as string[];
    return Array.from(new Set(candidates));
  }, [video]);
  const visualAssets = useMemo(() => {
    const items: Array<{ kind: 'output' | 'reference'; label: string; url: string }> = [];
    if (displayPosterUrl) {
      items.push({ kind: 'output', label: 'Generated output', url: displayPosterUrl });
    }
    referenceImages.forEach((url, index) => {
      items.push({ kind: 'reference', label: `Reference ${index + 1}`, url });
    });
    return items;
  }, [displayPosterUrl, referenceImages]);

  const selectedTrack = useMemo(
    () => (video?.music_track_id ? tracks.find((track) => track.id === video.music_track_id) ?? null : null),
    [tracks, video?.music_track_id],
  );
  const selectedVoiceOption = useMemo(
    () => voiceOptions.find((voice) => voice.key === selectedVoice) ?? voiceOptions[0] ?? null,
    [selectedVoice, voiceOptions],
  );
  const bgmPreviewUrl = useMemo(
    () => toAbsoluteUrl(selectedTrack?.preview_url ?? null) ?? toAbsoluteUrl(video?.music_file_url ?? null),
    [selectedTrack?.preview_url, video?.music_file_url],
  );
  const pipelineEvents = useMemo(
    () =>
    ((video?.pipeline_metadata?.events as Array<{
      id: string;
      kind: string;
      title: string;
      detail: string;
      state?: string;
      created_at?: string;
    }>) || []),
    [video?.pipeline_metadata],
  );
  const sortedPipelineEvents = useMemo(
    () =>
      [...pipelineEvents].sort((left, right) => {
        const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
        const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
        return leftTime - rightTime;
      }),
    [pipelineEvents],
  );
  const deepScenePlan = useMemo(
    () => video?.pipeline_metadata?.deep_scene_plan ?? [],
    [video?.pipeline_metadata],
  );
  const ugcScenePlan = useMemo(
    () => video?.pipeline_metadata?.ugc_scene_plan ?? [],
    [video?.pipeline_metadata],
  );
  const plannerScenePlan = deepScenePlan.length > 0 ? deepScenePlan : ugcScenePlan;
  const plannerQaEntries = useMemo(
    () =>
      plannerScenePlan
        .map((scene) => {
          const flags = Array.isArray(scene?.qa_flags)
            ? scene.qa_flags.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0)
            : [];
          if (flags.length === 0) return null;
          return {
            sceneId: typeof scene?.scene_id === 'string' ? scene.scene_id : 'scene',
            stageLabel: typeof scene?.stage_label === 'string' ? scene.stage_label : 'Scene',
            shotArchetype: typeof scene?.shot_archetype === 'string' ? scene.shot_archetype : null,
            flags,
          };
        })
        .filter((entry): entry is { sceneId: string; stageLabel: string; shotArchetype: string | null; flags: string[] } => Boolean(entry)),
    [plannerScenePlan],
  );
  const ugcAvatarDebug = useMemo(() => {
    const metadata = video?.pipeline_metadata;
    if (!metadata) return null;
    const source = typeof metadata.resolved_avatar_source === 'string' ? metadata.resolved_avatar_source : null;
    const avatarId = typeof metadata.resolved_avatar_id === 'string' ? metadata.resolved_avatar_id : null;
    const avatarName = typeof metadata.resolved_avatar_name === 'string' ? metadata.resolved_avatar_name : null;
    const requestedVoice = typeof metadata.requested_voice === 'string' ? metadata.requested_voice : null;
    const requestedLanguage = typeof metadata.requested_language === 'string' ? metadata.requested_language : null;
    const syncedVoice = typeof metadata.avatar_synced_voice === 'string' ? metadata.avatar_synced_voice : null;
    const syncedLanguage = typeof metadata.avatar_synced_language === 'string' ? metadata.avatar_synced_language : null;
    const resolvedVoice = typeof metadata.resolved_talking_voice === 'string' ? metadata.resolved_talking_voice : null;
    const resolvedLanguage = typeof metadata.resolved_talking_language === 'string' ? metadata.resolved_talking_language : null;
    const runtimeRows = Array.isArray(metadata.ugc_talking_scene_debug)
      ? metadata.ugc_talking_scene_debug
          .map((row) => {
            const sceneId = typeof row?.scene_id === 'string' ? row.scene_id : null;
            const provider = typeof row?.talking_provider === 'string' ? row.talking_provider : null;
            const providerLabel = typeof row?.talking_provider_label === 'string' ? row.talking_provider_label : null;
            const fallbackReason = typeof row?.talking_fallback_reason === 'string' ? row.talking_fallback_reason : null;
            if (!sceneId && !provider && !providerLabel && !fallbackReason) return null;
            return { sceneId, provider, providerLabel, fallbackReason };
          })
          .filter((row): row is { sceneId: string | null; provider: string | null; providerLabel: string | null; fallbackReason: string | null } => Boolean(row))
      : [];
    const watchouts = Array.isArray(metadata.intro_outro_watchouts)
      ? metadata.intro_outro_watchouts
          .map((row) => ({
            sceneId: typeof row?.scene_id === 'string' ? row.scene_id : 'scene',
            stage: typeof row?.stage_name === 'string' ? row.stage_name : 'stage',
            flags: Array.isArray(row?.flags)
              ? row.flags.filter((flag): flag is string => typeof flag === 'string' && flag.trim().length > 0)
              : [],
          }))
          .filter((row) => row.flags.length > 0)
      : [];
    const hasCore = Boolean(source || avatarId || avatarName || requestedVoice || resolvedVoice || runtimeRows.length > 0 || watchouts.length > 0);
    if (!hasCore) return null;
    return {
      source,
      avatarId,
      avatarName,
      requestedVoice,
      requestedLanguage,
      syncedVoice,
      syncedLanguage,
      resolvedVoice,
      resolvedLanguage,
      runtimeRows,
      watchouts,
    };
  }, [video?.pipeline_metadata]);

  const stage = video ? getStage(video.progress, video.status) : null;
  const isGenerationActive = video?.status === 'draft' || video?.status === 'processing';
  const todoItems = useMemo(() => (video ? getStageTodos(video) : []), [video]);

  const createdSummary = useMemo(() => {
    if (!video) return '';
    if (video.status === 'completed') {
      return `Created a ${formatLongDuration(video.duration_seconds)} ${video.aspect_ratio} video using ${video.selected_model || 'the selected model'} with ${video.music_mode !== 'none' ? 'an attached music layer' : 'no background music'} and export-ready playback.`;
    }
    return `Preparing a ${video.aspect_ratio} video using ${video.selected_model || 'the selected model'}${referenceImages.length > 0 ? ` with ${referenceImages.length} visual reference${referenceImages.length === 1 ? '' : 's'}` : ''}.`;
  }, [referenceImages.length, video]);

  const effectiveTodoItems = useMemo(
    () => todoItems.map((item) => ({ ...item, complete: item.complete || Boolean(todoOverrides[item.label]) })),
    [todoItems, todoOverrides],
  );

  const togglePlayback = () => {
    const player = videoRef.current;
    if (!player) return;
    if (player.paused) {
      void player.play();
      return;
    }
    player.pause();
  };

  const openFullscreen = async () => {
    const player = videoRef.current;
    if (!player) return;
    if (typeof player.requestFullscreen === 'function') {
      await player.requestFullscreen();
    }
  };

  const pushAssistantMessage = (role: 'user' | 'assistant', text: string) => {
    setAssistantMessages((current) => [...current, { role, text }]);
  };

  const sendAssistantPrompt = async (promptText: string) => {
    const prompt = promptText.trim();
    if (!prompt) return;

    pushAssistantMessage('user', prompt);
    setAssistantInput('');
    setAssistantBusy(true);

    if (/asset|reference|image/i.test(prompt)) {
      setAssetTab('visual');
    } else if (/music|bgm|audio/i.test(prompt)) {
      setAssetTab('bgm');
    }

    try {
      const response = await api.videoStudioChat(
        {
          videoId,
          message: prompt,
          chatHistory: assistantMessages.slice(-6),
        },
        userId,
      );
      if (/todo|run|execute|complete/i.test(prompt)) {
        setTodoOverrides(Object.fromEntries(todoItems.map((item) => [item.label, true])));
      }
      pushAssistantMessage('assistant', response.reply);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Studio AI could not respond right now.';
      show({
        title: 'Studio AI unavailable',
        message,
        variant: 'error',
      });
      pushAssistantMessage(
        'assistant',
        `I hit a temporary issue reaching Studio AI. Right now the studio is at "${stage?.label ?? 'processing'}" and the current summary is: ${createdSummary}`,
      );
    } finally {
      setAssistantBusy(false);
    }
  };

  const runAssistantAction = (action: 'explain' | 'assets' | 'notes') => {
    if (assistantBusy) return;
    if (action === 'assets') {
      setAssetTab('visual');
      void sendAssistantPrompt('Show me the current visual assets and reference context for this render.');
      return;
    }
    if (action === 'notes') {
      void sendAssistantPrompt('Give me concise export notes and the final status for this render.');
      return;
    }
    void sendAssistantPrompt('Explain the current render status and the next best edit step.');
  };

  const submitAssistantPrompt = () => {
    if (assistantBusy) return;
    void sendAssistantPrompt(assistantInput);
  };

  useEffect(() => {
    if (!selectedVoice && voiceOptions.length > 0) {
      const preferred =
        voiceOptions.find((voice) => voice.provider_voice === video?.tts_resolved_voice) ??
        voiceOptions.find((voice) => voice.key === video?.voice) ??
        voiceOptions[0];
      if (preferred) {
        setSelectedVoice(preferred.key);
      }
    }
  }, [selectedVoice, video?.tts_resolved_voice, video?.voice, voiceOptions]);

  useEffect(() => {
    if (!languageOptions.length) return;
    const currentLanguage = video?.language;
    if (!currentLanguage) return;
    const exact = languageOptions.find((option) => option.code === currentLanguage);
    const loose =
      languageOptions.find((option) => option.label.toLowerCase() === currentLanguage.toLowerCase()) ??
      languageOptions.find((option) => option.native_label.toLowerCase() === currentLanguage.toLowerCase());
    const nextLanguage = exact?.code ?? loose?.code;
    if (nextLanguage) {
      setSelectedLanguage(nextLanguage);
    }
  }, [languageOptions, video?.language]);

  useEffect(() => {
    setTranslatedScripts({});
  }, [video?.id, narrationScript]);

  useEffect(() => {
    if (!narrationScript.trim()) return;
    if (selectedLanguage === 'en-IN') return;
    if (translatedScripts[selectedLanguage]) return;

    let cancelled = false;
    setTranslatingScript(true);
    void api
      .translateScriptText(
        {
          text: narrationScript,
          target_language: selectedLanguageLabel,
        },
        userId,
      )
      .then((response) => {
        if (cancelled) return;
        setTranslatedScripts((current) => ({ ...current, [selectedLanguage]: response.text.trim() || narrationScript }));
      })
      .catch(() => {
        if (cancelled) return;
        setTranslatedScripts((current) => ({ ...current, [selectedLanguage]: narrationScript }));
      })
      .finally(() => {
        if (!cancelled) {
          setTranslatingScript(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [narrationScript, selectedLanguage, selectedLanguageLabel, translatedScripts, userId]);

  useEffect(() => {
    if (!isPlaying) return;

    let rafId = 0;

    const tick = () => {
      if (videoRef.current) {
        setPlaybackTime(videoRef.current.currentTime || 0);
      }
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [isPlaying]);

  const previewVoice = async () => {
    if (!selectedVoiceOption) return;
    setVoicePreviewing(true);
    setVoicePreviewMessage(null);
    try {
      const response = await api.previewTts(
        {
          voice: selectedVoiceOption.key,
          language: selectedLanguage,
          sample_rate_hz: 22050,
          text: buildVoicePreviewText(selectedLanguage, displayedNarrationScript),
        },
        userId,
      );
      setVoicePreviewUrl(toAbsoluteUrl(response.preview_url));
      setVoicePreviewMessage(
        `${response.provider}${response.resolved_voice ? ` · ${response.resolved_voice}` : ''}${response.cached ? ' · cached' : ''}`,
      );
    } catch (error) {
      setVoicePreviewMessage(error instanceof Error ? error.message : 'Unable to preview this voice right now.');
    } finally {
      setVoicePreviewing(false);
    }
  };

  const applyVoiceAndRerender = async () => {
    if (!selectedVoiceOption) return;
    setApplyingVoice(true);
    try {
      const response = await api.retryVideo(
        videoId,
        userId,
        {
          voice: selectedVoiceOption.key,
          language: selectedLanguage,
          script: displayedNarrationScript,
          audio_sample_rate_hz: 48000,
        },
      );
      show({
        title: 'Rerender started',
        message: `The video is rerendering with ${selectedVoiceOption.label}.`,
        variant: 'success',
      });
      pushAssistantMessage(
        'assistant',
        `Voice updated to ${selectedVoiceOption.label}. I queued a fresh render pass so narration, captions, and the final mix can rebuild with the new voice.`,
      );
      setVoicePreviewMessage(`Rerender queued · ${response.status}`);
      await loadBase();
    } catch (error) {
      show({
        title: 'Could not rerender',
        message: error instanceof Error ? error.message : 'Please try again.',
        variant: 'error',
      });
    } finally {
      setApplyingVoice(false);
    }
  };

  const downloadVideo = async () => {
    if (!video) return;
    const url = outputUrl;
    if (!url) return;

    setDownloading(true);
    const safeName = (video.title || 'video').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase() || 'video';
    const link = document.createElement('a');
    link.href = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(`${safeName}.mp4`)}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => setDownloading(false), 600);
  };

  const shareVideo = async () => {
    if (!video) return;
    setSharing(true);
    try {
      const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/videos/${video.id}` : `/videos/${video.id}`;
      await navigator.clipboard.writeText(shareUrl);
      show({
        title: 'Link copied',
        message: 'You can now share this video workspace link.',
        variant: 'success',
      });
    } catch {
      show({
        title: 'Could not copy link',
        message: 'Please copy the URL from the browser address bar.',
        variant: 'error',
      });
    } finally {
      setSharing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <PacmanLoader centered size="md" label="Loading video..." />
      </Card>
    );
  }

  if (error || !video || !stage) {
    return (
      <Card>
        <p className="text-sm text-[hsl(var(--color-danger))]">{error ?? 'Video not found'}</p>
      </Card>
    );
  }

  const currentVideo: Video = video;
  const generationTypeLabel = inferGenerationType(currentVideo);

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--color-bg))] font-sans text-[13px] text-text">
      <div className="border-b border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-bg))] px-5 py-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                  return;
                }
                router.push('/library');
              }}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-transparent bg-transparent text-text transition hover:bg-[hsl(var(--color-bg-soft))]"
              aria-label="Go back"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>

            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight text-text sm:text-lg">
                {currentVideo.title || 'Untitled Video'}
              </h1>
              <p className="mt-0.5 text-xs text-muted">Studio workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border-soft)/0.3)] bg-transparent px-3 py-1.5 text-xs text-muted">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
              <span>{wallet?.currentCredits ?? 0} credits{refreshing ? ' · refreshing' : ''}</span>
            </div>

            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border-soft)/0.3)] bg-transparent px-3 py-1.5 text-xs text-muted">
              <span>{currentVideo.status}</span>
              {currentVideo.selected_model ? <span className="text-text">{currentVideo.selected_model}</span> : null}
            </div>

            <Button
              variant="secondary"
              className="h-10 rounded-[14px] border border-transparent bg-[hsl(var(--color-accent))] px-5 text-[hsl(var(--color-accent-contrast))] shadow-none hover:opacity-95"
              onClick={() => void shareVideo()}
              disabled={sharing}
            >
              <Copy className="mr-2 h-4 w-4" />
              {sharing ? 'Copying…' : 'Share'}
            </Button>

            <Button
              className="h-10 rounded-[14px] bg-black px-5 text-white shadow-none hover:opacity-95"
              onClick={() => void downloadVideo()}
              disabled={!outputUrl || downloading}
            >
              <Download className="mr-2 h-4 w-4" />
              {downloading ? 'Exporting…' : 'Export'}
            </Button>
          </div>
        </div>
        {statusRefreshWarning ? (
          <div className="mt-3 rounded-[14px] border border-[hsl(var(--color-accent)/0.24)] bg-[hsl(var(--color-accent)/0.08)] px-3 py-2 text-xs font-medium text-[hsl(var(--color-accent))]">
            {statusRefreshWarning}
          </div>
        ) : null}
      </div>

      <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-4 pb-6 pt-4 lg:px-6">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_380px] 2xl:grid-cols-[minmax(0,1.55fr)_400px]">
          <div className="min-w-0 space-y-4">
            <section className="overflow-hidden rounded-[26px] bg-[hsl(var(--color-surface))] shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.24)]">
              <div className="border-b border-[hsl(var(--color-border-soft)/0.22)] px-5 py-5 sm:px-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
                      <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                      Render Workspace
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold tracking-tight text-text sm:text-xl">Preview</h2>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
                        Review the current export, monitor render progress, and make voice or asset decisions without the extra editing chrome.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <SoftPill>{currentVideo.aspect_ratio}</SoftPill>
                    <SoftPill>{currentVideo.resolution}</SoftPill>
                    {currentVideo.duration_seconds ? <SoftPill>{formatLongDuration(currentVideo.duration_seconds)}</SoftPill> : null}
                    <SoftPill>{generationTypeLabel}</SoftPill>
                    <SoftPill>{currentVideo.selected_model || 'No model selected'}</SoftPill>
                  </div>
                </div>
              </div>

              <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(300px,360px)_minmax(0,1fr)] lg:px-6">
                <div className="mx-auto flex w-full max-w-[360px] items-center justify-center">
                  <div className="relative w-full overflow-hidden rounded-[22px] bg-[linear-gradient(180deg,hsl(var(--color-bg-soft)),hsl(var(--color-surface)))] px-4 py-4 shadow-inner">
                    {video.status === 'completed' && outputUrl ? (
                      <div className="relative flex min-h-[420px] items-center justify-center">
                        {!isPlaying && displayPosterUrl ? (
                          <img
                            src={displayPosterUrl}
                            alt={video.title || 'Poster frame'}
                            className="absolute inset-0 m-auto h-full w-full rounded-[18px] object-cover"
                            style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}
                          />
                        ) : null}
                        <video
                          ref={videoRef}
                          src={outputUrl}
                          poster={displayPosterUrl ?? undefined}
                          className={`relative h-full w-full rounded-[18px] bg-transparent object-contain ${!isPlaying && displayPosterUrl ? 'opacity-0' : 'opacity-100'}`}
                          style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}
                          onLoadedMetadata={(event) => setPlaybackDuration(event.currentTarget.duration || 0)}
                          onTimeUpdate={(event) => setPlaybackTime(event.currentTarget.currentTime || 0)}
                          onPlay={() => setIsPlaying(true)}
                          onPause={() => setIsPlaying(false)}
                          onEnded={() => setIsPlaying(false)}
                        />
                      </div>
                    ) : displayPosterUrl ? (
                      <div className="relative flex min-h-[420px] items-center justify-center">
                        <img
                          src={displayPosterUrl}
                          alt={video.title || 'Video preview'}
                          className="h-full w-full rounded-[18px] object-cover opacity-90"
                          style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/30 backdrop-blur">
                            {video.status === 'completed' ? <Play className="ml-1 h-6 w-6 fill-current text-white" /> : <Spinner />}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex min-h-[420px] items-center justify-center text-muted">
                        <div className="flex aspect-[9/16] w-full animate-pulse items-center justify-center rounded-[18px] bg-[hsl(var(--color-bg-soft))]">
                          <Clapperboard className="h-10 w-10" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex min-w-0 flex-col justify-between gap-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Playback</p>
                      <p className="mt-2 text-base font-semibold text-text">
                        {formatClock(playbackTime)} / {formatClock(playbackDuration || currentVideo.duration_seconds || 0)}
                      </p>
                      <p className="mt-1 text-xs text-muted">Current export length and scrub position.</p>
                    </div>
                    <div className="rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Audio stack</p>
                      <p className="mt-2 text-base font-semibold text-text">
                        {video.narration_enabled ? 'Narration on' : 'Narration off'}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {video.music_mode !== 'none' ? `BGM ${Math.round(video.music_volume * 100)}%` : 'No background music'}
                      </p>
                    </div>
                    <div className="rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Pipeline</p>
                      <p className="mt-2 text-base font-semibold text-text">{stage.label}</p>
                      <p className="mt-1 text-xs text-muted">{stage.detail}</p>
                    </div>
                    <div className="rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Export</p>
                      <p className="mt-2 text-base font-semibold text-text">Final output</p>
                      <p className="mt-1 text-xs text-muted">{createdSummary}</p>
                    </div>
                  </div>

                  <div className="rounded-[22px] bg-[hsl(var(--color-bg-soft))] p-4 sm:p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={togglePlayback}
                          disabled={currentVideo.status !== 'completed' || !outputUrl}
                          className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label={isPlaying ? 'Pause video' : 'Play video'}
                        >
                          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                        </button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="h-11 rounded-[14px]"
                          onClick={() => void openFullscreen()}
                          disabled={video.status !== 'completed' || !outputUrl}
                        >
                          <Expand className="mr-2 h-4 w-4" />
                          Fullscreen
                        </Button>
                      </div>

                      <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Selected format</p>
                          <p className="mt-1 text-sm font-medium text-text">{video.template || video.template_id || 'Freeform render'}</p>
                        </div>
                        <div>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Model path</p>
                          <p className="mt-1 text-sm font-medium text-text">{video.selected_model || 'Provider-managed'}</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            <SoftPill>{generationTypeLabel}</SoftPill>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(320px,1.05fr)]">
              <section className="min-w-0">
                <div className="flex h-full min-h-[520px] flex-col rounded-[24px] bg-[hsl(var(--color-surface))] shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.24)]">
                  <div className="flex items-center justify-between px-5 py-5">
                    <div>
                      <p className="text-lg font-semibold text-text">Assets</p>
                      <p className="mt-1 text-sm text-muted">Reference visuals, music, and speech settings for this render.</p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-transparent text-muted transition hover:bg-[hsl(var(--color-bg-soft))] hover:text-text"
                      aria-label="Filter assets"
                    >
                      <SlidersHorizontal className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  <div className="px-4 pb-4">
                    <div className="grid grid-cols-2 rounded-[14px] bg-[hsl(var(--color-bg-soft))] p-1">
                      <button type="button" className="rounded-[10px] bg-white px-4 py-2 text-sm font-medium text-text shadow-none">
                        Media
                      </button>
                      <button type="button" className="rounded-[10px] px-4 py-2 text-sm font-medium text-muted">
                        Docs
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 px-4">
                    {([
                      ['visual', 'Visual', ImageIcon],
                      ['bgm', 'BGM', Music4],
                      ['speech', 'Speech', AudioLines],
                    ] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAssetTab(key)}
                        className={`rounded-[12px] px-3 py-2 text-sm font-medium transition ${assetTab === key ? 'bg-[hsl(var(--color-bg-soft))] text-text' : 'bg-transparent text-muted hover:text-text'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="mt-5 flex-1 px-4 pb-4">
                    {assetTab === 'visual' ? (
                      <div className="space-y-3">
                        {video.template || video.template_id ? (
                          <div className="rounded-[16px] bg-[hsl(var(--color-bg-soft))] p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Recipe / format</p>
                            <p className="mt-1 text-sm font-semibold text-text">{video.template || video.template_id}</p>
                            <div className="mt-2 flex flex-wrap gap-2">
                              <SoftPill>{currentVideo.aspect_ratio}</SoftPill>
                              <SoftPill>{generationTypeLabel}</SoftPill>
                              <SoftPill>{video.selected_model || 'Selected model'}</SoftPill>
                            </div>
                          </div>
                        ) : null}

                        {visualAssets.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {visualAssets.slice(0, 4).map((asset, index) => (
                              <div key={`${asset.url}-${index}`} className="overflow-hidden rounded-[16px] bg-[hsl(var(--color-bg-soft))]">
                                <img
                                  src={asset.url}
                                  alt={asset.label}
                                  className={`${asset.kind === 'output' ? 'aspect-[16/10] max-h-[160px]' : 'aspect-[4/5]'} w-full object-cover`}
                                />
                                <div className="px-3 py-2">
                                  <p className="text-xs font-medium text-text">{asset.label}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="flex min-h-[260px] items-center justify-center rounded-[16px] bg-[hsl(var(--color-bg-soft))] text-sm text-muted">No visuals yet</div>
                        )}
                      </div>
                    ) : null}

                    {assetTab === 'bgm' ? (
                      <div className="space-y-3">
                        {selectedTrack || video.music_file_url ? (
                          <div className="rounded-[16px] bg-[hsl(var(--color-bg-soft))] p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex h-12 w-12 items-center justify-center rounded-[12px] bg-[hsl(var(--color-surface))]">
                                <Music4 className="h-5 w-5 text-[hsl(var(--color-accent))]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-1 text-sm font-semibold text-text">
                                  {selectedTrack?.name || (video.music_mode === 'upload' ? 'Uploaded music track' : 'Applied background music')}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  {video.music_mode === 'library'
                                    ? 'Selected from the RangManch music library'
                                    : video.music_mode === 'upload'
                                      ? 'Uploaded by you for this render'
                                      : video.music_mode === 'generated'
                                        ? 'Generated music asset for this video'
                                        : 'Music layer attached to the final export'}
                                </p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  <SoftPill>{video.music_mode}</SoftPill>
                                  <SoftPill>Vol {Math.round(video.music_volume * 100)}%</SoftPill>
                                  {selectedTrack?.duration_sec ? <SoftPill>{formatLongDuration(selectedTrack.duration_sec)}</SoftPill> : null}
                                </div>
                              </div>
                            </div>
                            {selectedTrack?.preview_url ? (
                              <audio className="mt-3 w-full" controls src={toAbsoluteUrl(selectedTrack.preview_url) ?? undefined} />
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex min-h-[260px] items-center justify-center rounded-[16px] bg-[hsl(var(--color-bg-soft))] text-sm text-muted">No BGM yet</div>
                        )}
                      </div>
                    ) : null}

                    {assetTab === 'speech' ? (
                      <div className="space-y-3">
                        {video.narration_enabled ? (
                          <div className="rounded-[16px] bg-[hsl(var(--color-bg-soft))] p-3">
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-semibold text-text">Speech / voice</p>
                              <SoftPill>{video.narration_enabled ? 'On' : 'Off'}</SoftPill>
                            </div>
                            <p className="mt-2 text-xs text-muted">
                              {`Voice provider: ${video.tts_provider || 'Configured'}${video.tts_resolved_voice ? ` · ${video.tts_resolved_voice}` : ''}`}
                            </p>
                            {video.tts_provider_message ? (
                              <p className="mt-3 rounded-[12px] bg-[hsl(var(--color-surface))] px-3 py-2 text-xs text-muted">
                                {video.tts_provider_message}
                              </p>
                            ) : null}

                            {voiceOptions.length > 0 ? (
                              <div className="mt-4 space-y-4 rounded-[12px] bg-[hsl(var(--color-surface))] p-3 sm:p-4">
                                <div className="grid gap-3">
                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Language</span>
                                    <Dropdown value={selectedLanguage} onChange={(event) => setSelectedLanguage(event.target.value)}>
                                      {languageOptions.map((option, index) => (
                                        <option key={`${option.code}-${option.label}-${index}`} value={option.code}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Dropdown>
                                  </label>
                                  <label className="block">
                                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Voice</span>
                                    <Dropdown value={selectedVoice} onChange={(event) => setSelectedVoice(event.target.value)}>
                                      {voiceOptions.map((option) => (
                                        <option key={option.key} value={option.key}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </Dropdown>
                                  </label>
                                </div>
                                <div className="space-y-3">
                                  <p className="max-w-[26rem] text-xs leading-5 text-muted">
                                    Preview a Sarvam voice, then apply it to queue a new narration pass for this video.
                                  </p>
                                  <div className="flex w-full flex-col gap-2">
                                    <Button type="button" variant="secondary" className="h-9 w-full rounded-[12px]" onClick={() => void previewVoice()} disabled={voicePreviewing || translatingScript}>
                                      {voicePreviewing ? 'Previewing…' : 'Preview voice'}
                                    </Button>
                                    <Button
                                      type="button"
                                      className="h-9 w-full rounded-[12px]"
                                      onClick={() => void applyVoiceAndRerender()}
                                      disabled={applyingVoice || !selectedVoiceOption || translatingScript}
                                    >
                                      {applyingVoice ? 'Applying…' : 'Apply & rerender'}
                                    </Button>
                                  </div>
                                </div>
                                {translatingScript ? <p className="text-xs text-muted">Translating narration script…</p> : null}
                                {voicePreviewMessage ? <p className="text-xs text-muted">{voicePreviewMessage}</p> : null}
                                {voicePreviewUrl ? <audio className="w-full" controls src={voicePreviewUrl} /> : null}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <div className="flex min-h-[260px] items-center justify-center rounded-[16px] bg-[hsl(var(--color-bg-soft))] text-[15px] text-[hsl(var(--color-text-muted))]">
                            No speech yet
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex justify-end px-4 pb-4">
                    <button
                      type="button"
                      className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] bg-[hsl(var(--color-bg-soft))] text-text transition hover:opacity-90"
                      aria-label="Add asset"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </section>

              <section className="min-w-0">
                <div className="flex h-full min-h-[520px] flex-col rounded-[24px] bg-[hsl(var(--color-surface))] p-4 shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.24)]">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted">Audio script</p>
                      <p className="mt-1 text-sm text-muted">Current spoken copy and translation state for this export.</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {narrationSourceType ? (
                        <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1 text-xs text-text">
                          <span>{narrationSourceType === 'openai_explainer_script' ? 'AI narration' : 'Generated narration'}</span>
                        </div>
                      ) : null}
                      <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1 text-xs text-text">
                        <span>Read-only</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex-1 rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4 sm:p-5">
                    {displayedNarrationScript ? (
                      <div className="space-y-3">
                        {selectedLanguage !== 'en-IN' ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <SoftPill>{selectedLanguageLabel}</SoftPill>
                            {translatingScript ? <SoftPill>Translating…</SoftPill> : null}
                          </div>
                        ) : null}
                        <p className="whitespace-pre-wrap break-words text-sm leading-7 text-text [overflow-wrap:anywhere]">{displayedNarrationScript}</p>
                      </div>
                    ) : (
                      <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-muted">No audio script yet</div>
                    )}
                  </div>
                </div>
              </section>
            </div>
          </div>

          <aside className="min-h-0 self-start xl:sticky xl:top-4">
            <div className="flex h-[520px] min-h-[520px] max-h-[520px] flex-col overflow-hidden rounded-[22px] bg-[hsl(var(--color-surface))] p-4 shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.3)] 2xl:px-5">
              <div className="flex items-center justify-between px-1 pb-1">
                <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-2.5 py-1 text-xs font-medium text-text">
                  {referenceImages[0] || displayPosterUrl ? (
                    <img src={referenceImages[0] || displayPosterUrl || undefined} alt="" className="h-5 w-5 rounded-full object-cover" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-[hsl(var(--color-accent))]" />
                  )}
                  Studio AI
                </div>
                <SoftPill>{video.progress}%</SoftPill>
              </div>

              <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain pr-1 2xl:pr-2">
                {referenceImages[0] ? (
                  <div className="ml-auto max-w-[88%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-2.5">
                    <img src={referenceImages[0]} alt="Reference" className="aspect-[4/3] w-full rounded-[14px] object-cover" />
                  </div>
                ) : null}

                <div className="ml-auto max-w-[88%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <SoftPill>{narrationSourceLabel}</SoftPill>
                        {video.narration_enabled ? <SoftPill>Narration on</SoftPill> : <SoftPill>Narration off</SoftPill>}
                      </div>
                    <p className="break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">{displayedNarrationScript || 'Prepare a social-first video from my prompt.'}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <SoftPill>AI video</SoftPill>
                    <SoftPill>{currentVideo.aspect_ratio}</SoftPill>
                  </div>
                </div>

                {sortedPipelineEvents.length > 0
                  ? sortedPipelineEvents.map((event) => (
                    <div key={event.id} className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                          <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                          {event.title}
                        </div>
                        <div className="flex items-center gap-2">
                          {event.created_at ? <span className="text-[11px] text-muted">{formatEventStamp(event.created_at)}</span> : null}
                          {event.state ? (
                            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium ${eventStateTone(event.state)}`}>
                              {event.state}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-3 break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">{event.detail}</p>
                    </div>
                  ))
                  : (
                    <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                        <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                        {stage.label}
                      </div>
                      <p className="mt-3 break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">{stage.detail}</p>
                    </div>
                  )}

                {isGenerationActive ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                      <Spinner />
                      AI is working
                    </div>
                    <p className="mt-3 break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">
                      {sortedPipelineEvents.length > 0
                        ? 'Still generating. The copilot will keep appending pipeline updates here as the render moves through scenes, audio, and final export.'
                        : `${stage.label}. ${stage.detail}`}
                    </p>
                  </div>
                ) : null}

                <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                  <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                    <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(var(--color-success))]" />
                    Workspace loaded
                  </div>
                    <p className="mt-3 break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">{createdSummary}</p>
                  </div>

                <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                  <p className="text-sm font-semibold text-text">Todos</p>
                  <div className="mt-3 space-y-3">
                    {effectiveTodoItems.map((item, index) => (
                      <button
                        key={`${item.label}-${index}`}
                        type="button"
                        onClick={() => setTodoOverrides((current) => ({ ...current, [item.label]: !current[item.label] }))}
                        className="flex w-full gap-3 text-left"
                      >
                        <span
                          className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${item.complete
                            ? 'border-[hsl(var(--color-success)/0.4)] bg-[hsl(var(--color-success)/0.16)] text-[hsl(var(--color-success))]'
                            : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] text-muted'
                            }`}
                        >
                          {item.complete ? <CheckCircle2 className="h-3.5 w-3.5" /> : index + 1}
                        </span>
                        <p className={`text-sm leading-5 ${item.complete ? 'text-text' : 'text-muted'}`}>{item.label}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {plannerQaEntries.length > 0 ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                        <Wand2 className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                        Planner watchouts
                      </div>
                      <SoftPill>{plannerQaEntries.length}</SoftPill>
                    </div>
                    <div className="mt-3 space-y-3">
                      {plannerQaEntries.slice(0, 4).map((entry) => (
                        <div key={entry.sceneId} className="rounded-[14px] bg-[hsl(var(--color-bg))] px-3 py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.05em] text-muted">{entry.stageLabel}</p>
                            {entry.shotArchetype ? <SoftPill>{entry.shotArchetype}</SoftPill> : null}
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {entry.flags.map((flag) => (
                              <span
                                key={flag}
                                className="inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.12)] px-2.5 py-1 text-[11px] font-medium text-[hsl(var(--color-warning))]"
                              >
                                {flag.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="mt-3 text-xs leading-5 text-muted">
                      These are lightweight planner warnings so we can catch repetition or weak scene grounding before expanding the recipe system further.
                    </p>
                  </div>
                ) : null}

                {ugcAvatarDebug ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] p-4">
                    <div className="flex items-center gap-2">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                        <AudioLines className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                        UGC avatar sync
                      </div>
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-text">
                      <p>
                        Avatar: {ugcAvatarDebug.avatarName || '—'} ({ugcAvatarDebug.source || 'unknown'})
                        {ugcAvatarDebug.avatarId ? ` · ${ugcAvatarDebug.avatarId}` : ''}
                      </p>
                      <p>
                        Voice contract: requested {ugcAvatarDebug.requestedVoice || '—'} / {ugcAvatarDebug.requestedLanguage || '—'}
                        {' -> '}synced {ugcAvatarDebug.syncedVoice || '—'} / {ugcAvatarDebug.syncedLanguage || '—'}
                        {' -> '}resolved {ugcAvatarDebug.resolvedVoice || '—'} / {ugcAvatarDebug.resolvedLanguage || '—'}
                      </p>
                    </div>
                    {ugcAvatarDebug.runtimeRows.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {ugcAvatarDebug.runtimeRows.slice(0, 4).map((row, index) => (
                          <div key={`${row.sceneId || 'scene'}-${index}`} className="rounded-[14px] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-muted">
                            <p className="font-semibold text-text">
                              {row.sceneId || 'Talking scene'} · {row.providerLabel || row.provider || 'provider unknown'}
                            </p>
                            {row.fallbackReason ? (
                              <p className="mt-1 text-[hsl(var(--color-warning))]">
                                fallback: {row.fallbackReason}
                              </p>
                            ) : (
                              <p className="mt-1 text-[hsl(var(--color-success))]">Talking provider path succeeded.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {ugcAvatarDebug.watchouts.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {ugcAvatarDebug.watchouts.map((row) => (
                          <div key={`${row.sceneId}-${row.stage}`} className="rounded-[14px] bg-[hsl(var(--color-bg))] px-3 py-2 text-xs text-muted">
                            <p className="font-semibold text-text">{row.stage.replace(/_/g, ' ')}</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                              {row.flags.map((flag) => (
                                <span
                                  key={flag}
                                  className="inline-flex items-center rounded-full bg-[hsl(var(--color-warning)/0.12)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--color-warning))]"
                                >
                                  {flag.replace(/_/g, ' ')}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {assistantMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`${message.role === 'user'
                      ? 'ml-auto max-w-[88%] rounded-[18px] bg-[hsl(var(--color-accent)/0.12)] px-4 py-3'
                      : 'max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3'
                      }`}
                  >
                    <p className="break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">{message.text}</p>
                  </div>
                ))}

                {selectedTrack || video.music_file_url ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                      <Music4 className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                      Updated BGM
                    </div>
                    <p className="mt-3 break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">
                      {selectedTrack?.name || 'Background music attached'} is ready for the final mix at {Math.round(video.music_volume * 100)}%
                      volume.
                    </p>
                  </div>
                ) : null}

                {video.status === 'completed' ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <p className="break-words text-sm leading-6 text-text [overflow-wrap:anywhere]">
                      Your video is ready. The final export is available with the selected aspect ratio, music settings, and playback controls.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 border-t border-[hsl(var(--color-border-soft)/0.3)] bg-[hsl(var(--color-surface))] px-1 pt-4 pb-1">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runAssistantAction('explain')}
                    disabled={assistantBusy}
                    className="rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1.5 text-xs font-medium text-text transition hover:opacity-90"
                  >
                    Explain edit
                  </button>
                  <button
                    type="button"
                    onClick={() => runAssistantAction('assets')}
                    disabled={assistantBusy}
                    className="rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1.5 text-xs font-medium text-text transition hover:opacity-90"
                  >
                    Show assets
                  </button>
                  <button
                    type="button"
                    onClick={() => runAssistantAction('notes')}
                    disabled={assistantBusy}
                    className="rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1.5 text-xs font-medium text-text transition hover:opacity-90"
                  >
                    Export notes
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                  {assistantBusy ? 'Studio AI is thinking…' : 'Ask me anything...'}
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-[16px] bg-[hsl(var(--color-bg-soft))] px-3.5 py-3 text-sm text-muted">
                  <div className="flex min-w-0 items-center gap-3">
                    <Wand2 className="h-4 w-4 shrink-0 text-[hsl(var(--color-accent))]" />
                    <input
                      value={assistantInput}
                      onChange={(event) => setAssistantInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !assistantBusy) {
                          event.preventDefault();
                          submitAssistantPrompt();
                        }
                      }}
                      disabled={assistantBusy}
                      placeholder="Ask about this render, assets, or the next edit step…"
                      className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={submitAssistantPrompt}
                    disabled={assistantBusy || !assistantInput.trim()}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))] shadow-none"
                    aria-label="Send"
                  >
                    {assistantBusy ? <Spinner /> : <Sparkles className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
