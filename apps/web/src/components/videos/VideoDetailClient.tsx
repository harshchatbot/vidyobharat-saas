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
import { Skeleton } from '@/components/ui/Skeleton';
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
  const audioContextRef = useRef<AudioContext | null>(null);
  const { wallet, refreshing } = useCredits();
  const { show } = useToast();
  const terminalToastRef = useRef<string | null>(null);
  const completionToastRef = useRef<string | null>(null);

  const loadBase = async () => {
    try {
      setLoading(true);
      const nextVideo = await api.getVideo(videoId, userId);
      if (!nextVideo) {
        setError('Video not found');
        return;
      }
      setVideo(nextVideo);
      setError(null);

      const catalog = await api.getAvatarProductTtsCatalog(userId);
      setLanguageOptions(catalog.languages);
      setVoiceOptions(catalog.voices);
      if (catalog.voices[0]) setSelectedVoice(catalog.voices[0].key);

      const nextTracks = await api.listMusicTracks();
      setTracks(nextTracks);
    } catch (err) {
      setError('Failed to load video');
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
      setStatusRefreshWarning('Status refresh delayed. We\'ll retry automatically.');
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
    return video.reference_images || video.image_urls || [];
  }, [video]);

  const selectedTrack = useMemo(() => {
    if (!video || !video.music_track_id) return null;
    return tracks.find((t) => t.id === video.music_track_id) || null;
  }, [video, tracks]);

  const selectedVoiceOption = useMemo(
    () => voiceOptions.find((option) => option.key === selectedVoice),
    [voiceOptions, selectedVoice],
  );

  const visualAssets = useMemo(() => {
    if (!video) return [];
    const assets: Array<{ url: string; label: string; kind: string }> = [];
    if (video.source_image_url) {
      const url = toAbsoluteUrl(video.source_image_url);
      if (url) assets.push({ url, label: 'Source image', kind: 'source' });
    }
    if (video.image_urls?.length) {
      video.image_urls.forEach((u, index) => {
        const url = toAbsoluteUrl(u);
        if (url) assets.push({ url, label: `Reference ${index + 1}`, kind: 'reference' });
      });
    }
    if (video.reference_images?.length) {
      video.reference_images.forEach((u, index) => {
        const url = toAbsoluteUrl(u);
        if (url) assets.push({ url, label: `Reference ${index + 1}`, kind: 'reference' });
      });
    }
    if (video.output_url && video.thumbnail_url) {
      const url = toAbsoluteUrl(video.thumbnail_url);
      if (url) assets.push({ url, label: 'Output preview', kind: 'output' });
    }
    return assets;
  }, [video]);

  const stage = useMemo(() => (video ? getStage(video.progress || 0, video.status) : null), [video]);

  const effectiveTodoItems = useMemo(() => {
    if (!video) return [];
    const items = getStageTodos(video);
    return items.map((item) => ({
      ...item,
      complete: item.complete || todoOverrides[item.label],
    }));
  }, [video, todoOverrides]);

  const createdSummary = useMemo(() => {
    if (!video) return '';
    const parts = [];
    if (video.created_at) {
      const date = new Date(video.created_at);
      parts.push(date.toLocaleDateString());
    }
    if (video.duration_seconds) {
      parts.push(`${formatLongDuration(video.duration_seconds)}`);
    }
    return parts.join(' · ');
  }, [video]);

  const sortedPipelineEvents = useMemo(() => {
    if (!video?.pipeline_metadata?.events) return [];
    const events = Array.isArray(video.pipeline_metadata.events) ? video.pipeline_metadata.events : [];
    return events.slice().sort((a, b) => {
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();
      return aTime - bTime;
    });
  }, [video?.pipeline_metadata]);

  const plannerQaEntries = useMemo(() => {
    if (!video?.pipeline_metadata?.planner_qa) return [];
    const entries = Array.isArray(video.pipeline_metadata.planner_qa) ? video.pipeline_metadata.planner_qa : [];
    return entries;
  }, [video?.pipeline_metadata]);

  const ugcAvatarDebug = useMemo(() => {
    if (!video?.pipeline_metadata?.avatar) return null;
    return video.pipeline_metadata.avatar;
  }, [video?.pipeline_metadata]);

  const isGenerationActive = useMemo(() => {
    if (!video) return false;
    return video.status === 'draft' || video.status === 'processing';
  }, [video]);

  const togglePlayback = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        void videoRef.current.play();
      }
    }
  };

  const openFullscreen = async () => {
    if (!videoRef.current) return;
    try {
      if (videoRef.current.requestFullscreen) {
        await videoRef.current.requestFullscreen();
      }
    } catch {
      show({
        title: 'Fullscreen unavailable',
        message: 'Your browser does not support fullscreen mode.',
        variant: 'error',
      });
    }
  };

  const previewVoice = async () => {
    if (!selectedVoiceOption) return;
    try {
      setVoicePreviewing(true);
      setVoicePreviewMessage(null);
      const previewText = buildVoicePreviewText(selectedLanguage, narrationScript);
      const url = await api.previewTts({ text: previewText, voice: selectedVoiceOption.key, language: selectedLanguage, sample_rate_hz: 24000 }, userId);
      setVoicePreviewUrl(url.preview_url);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to preview this voice right now.';
      setVoicePreviewMessage(message);
    } finally {
      setVoicePreviewing(false);
    }
  };

  const applyVoiceAndRerender = async () => {
    if (!video || !selectedVoiceOption) return;
    try {
      setApplyingVoice(true);
      await api.retryVideo(video.id, userId, {
        voice: selectedVoiceOption.key,
        language: selectedLanguage,
      });
      show({
        title: 'Voice applied',
        message: 'A new narration pass is queued for this video.',
        variant: 'success',
      });
      void refreshStatus();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to apply voice.';
      show({
        title: 'Could not apply voice',
        message,
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

  const submitAssistantPrompt = async () => {
    if (!assistantInput.trim() || assistantBusy || !video) return;
    try {
      setAssistantBusy(true);
      const userMessage: VideoStudioChatMessage = { role: 'user', text: assistantInput };
      setAssistantMessages((prev) => [...prev, userMessage]);
      setAssistantInput('');

      const response = await api.videoStudioChat(
        {
          videoId: video.id,
          message: assistantInput,
        },
        userId,
      );

      const aiMessage: VideoStudioChatMessage = { role: 'assistant', text: response.reply };
      setAssistantMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Studio AI could not respond right now.';
      show({
        title: 'Chat error',
        message,
        variant: 'error',
      });
    } finally {
      setAssistantBusy(false);
    }
  };

  const runAssistantAction = async (action: 'explain' | 'assets' | 'notes') => {
    if (!video || assistantBusy) return;
    try {
      setAssistantBusy(true);
      const prompts: Record<string, string> = {
        explain: 'Explain what happened in this render. What were the key decisions?',
        assets: 'What assets were used to create this video?',
        notes: 'Give me production notes I can share with my team about this render.',
      };
      const prompt = prompts[action];
      if (!prompt) return;

      setAssistantMessages((prev) => [...prev, { role: 'user', text: prompt }]);
      const response = await api.videoStudioChat(
        { videoId: video.id, message: prompt },
        userId,
      );
      setAssistantMessages((prev) => [...prev, { role: 'assistant', text: response.reply }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Action failed.';
      show({
        title: 'Chat error',
        message,
        variant: 'error',
      });
    } finally {
      setAssistantBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="mesh-bg min-h-screen p-4 md:p-6">
        <div className="mx-auto max-w-6xl space-y-4">
          <Skeleton variant="card" className="h-16" />
          <Skeleton variant="video" />
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton variant="card" className="h-48" />
            <Skeleton variant="card" className="h-48" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Skeleton variant="card" className="h-40" />
            <Skeleton variant="card" className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !video || !stage) {
    return (
      <Card>
        <p className="text-sm text-[hsl(var(--color-danger))]">{error ?? 'Video not found'}</p>
      </Card>
    );
  }

  const generationTypeLabel = inferGenerationType(video);
  const completionPercentage = video.progress || 0;

  return (
    <div className="mesh-bg min-h-screen p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-4">
        {/* HEADER */}
        <div className="glass-card-strong flex flex-col gap-4 rounded-[24px] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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
              <h1 className="gradient-text truncate text-lg font-bold sm:text-xl">
                {video.title || 'Untitled Video'}
              </h1>
              <p className="mt-0.5 hidden text-xs text-muted sm:block">Studio workspace</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border-soft)/0.3)] bg-transparent px-3 py-1.5 text-xs text-muted">
              <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent-amber))]" />
              {wallet?.currentCredits ?? 0} credits
            </div>

            <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${
              video.status === 'completed'
                ? 'border-[hsl(var(--color-success)/0.3)] bg-[hsl(var(--color-success)/0.1)] text-[hsl(var(--color-success))]'
                : video.status === 'processing' || video.status === 'draft'
                  ? 'border-[hsl(var(--color-accent)/0.3)] bg-[hsl(var(--color-accent)/0.1)] text-[hsl(var(--color-accent))]'
                  : 'border-[hsl(var(--color-danger)/0.3)] bg-[hsl(var(--color-danger)/0.1)] text-[hsl(var(--color-danger))]'
            }`}>
              {video.status === 'completed' ? '✓' : video.status === 'processing' ? '◐' : '✕'} {video.status}
            </div>

            <Button
              variant="secondary"
              className="glass-card h-9 rounded-[12px] px-3 text-xs font-medium"
              onClick={() => void shareVideo()}
              disabled={sharing}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {sharing ? 'Copying…' : 'Share'}
            </Button>

            <Button
              className="glow-button h-9 rounded-[12px] px-3 text-xs font-medium"
              onClick={() => void downloadVideo()}
              disabled={!outputUrl || downloading}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {downloading ? 'Exporting…' : 'Export'}
            </Button>
          </div>
        </div>

        {/* VIDEO PLAYER - HERO SECTION */}
        <div className="glass-card-strong relative overflow-hidden rounded-[26px] p-5">
          <div className="relative flex w-full items-center justify-center bg-black rounded-[20px] overflow-hidden" style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}>
            {/* Completion Ring Overlay */}
            {video.status === 'processing' || video.status === 'draft' ? (
              <div className="absolute top-4 right-4 z-20 flex h-12 w-12 items-center justify-center rounded-full border-2 border-[hsl(var(--color-accent))] bg-[hsl(var(--color-surface)/0.8)]">
                <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="15.915" fill="none" stroke="hsl(var(--color-accent))" strokeWidth="2" opacity="0.2" />
                  <circle
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="none"
                    stroke="hsl(var(--color-accent))"
                    strokeWidth="2"
                    strokeDasharray={`${100 * 0.9973} 100`}
                    strokeLinecap="round"
                    style={{ strokeDashoffset: `${100 * (1 - completionPercentage / 100) * 0.9973}` }}
                  />
                </svg>
                <span className="absolute text-xs font-semibold text-text">{completionPercentage}%</span>
              </div>
            ) : null}

            {video.status === 'completed' && outputUrl ? (
              <>
                {!isPlaying && displayPosterUrl ? (
                  <img
                    src={displayPosterUrl}
                    alt={video.title || 'Poster'}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : null}
                <video
                  ref={videoRef}
                  src={outputUrl}
                  poster={displayPosterUrl ?? undefined}
                  className={`relative h-full w-full object-contain ${!isPlaying && displayPosterUrl ? 'opacity-0' : 'opacity-100'}`}
                  onLoadedMetadata={(e) => setPlaybackDuration(e.currentTarget.duration || 0)}
                  onTimeUpdate={(e) => setPlaybackTime(e.currentTarget.currentTime || 0)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                />
              </>
            ) : displayPosterUrl ? (
              <img src={displayPosterUrl} alt={video.title || 'Preview'} className="h-full w-full object-cover opacity-90" />
            ) : (
              <Skeleton variant="video" className="absolute inset-0" />
            )}

            {/* Play/Processing Overlay */}
            {video.status !== 'completed' || !outputUrl ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/30 backdrop-blur">
                  {video.status === 'completed' ? (
                    <Play className="ml-1 h-6 w-6 fill-white text-white" />
                  ) : (
                    <Spinner />
                  )}
                </div>
              </div>
            ) : null}
          </div>

          {/* Controls Bar */}
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={togglePlayback}
                disabled={video.status !== 'completed' || !outputUrl}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))] transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
              </button>
              <span className="text-xs font-semibold text-text">
                {formatClock(playbackTime)} / {formatClock(playbackDuration || video.duration_seconds || 0)}
              </span>
            </div>

            <div className="flex flex-wrap gap-2">
              <SoftPill>{video.aspect_ratio}</SoftPill>
              <SoftPill>{video.selected_model || 'Model'}</SoftPill>
            </div>

            <Button
              variant="secondary"
              className="h-9 rounded-[12px]"
              onClick={() => void openFullscreen()}
              disabled={video.status !== 'completed' || !outputUrl}
            >
              <Expand className="mr-1.5 h-3.5 w-3.5" />
              Fullscreen
            </Button>
          </div>
        </div>

        {/* TWO COLUMNS: PIPELINE STATUS + CHAT */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* PIPELINE STATUS */}
          <div className="glass-card-strong rounded-[24px] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Pipeline</p>
            <div className="mt-4 grid gap-3 grid-cols-2">
              <div className="glass-card rounded-[16px] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">Playback</p>
                <p className="mt-2 text-sm font-semibold text-text">
                  {formatClock(playbackTime)} / {formatClock(playbackDuration || video.duration_seconds || 0)}
                </p>
                <p className="mt-1 text-xs text-muted">Current position</p>
              </div>
              <div className="glass-card rounded-[16px] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">Audio Stack</p>
                <p className="mt-2 text-sm font-semibold text-text">
                  {video.narration_enabled ? 'On' : 'Off'}
                </p>
                <p className="mt-1 text-xs text-muted">Narration {video.music_mode !== 'none' ? '+ BGM' : ''}</p>
              </div>
              <div className="glass-card rounded-[16px] p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">Pipeline</p>
                <p className="mt-2 text-sm font-semibold text-text">{stage.label}</p>
                <p className="mt-1 text-xs text-muted">{stage.detail.slice(0, 40)}…</p>
              </div>
              <div className="glass-card rounded-[16px] p-3 border-l-4 border-l-[hsl(var(--color-success))]">
                <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-muted">Export</p>
                <p className="mt-2 text-sm font-semibold text-text">Final output</p>
                <p className="mt-1 text-xs text-muted">{createdSummary}</p>
              </div>
            </div>
          </div>

          {/* STUDIO AI CHAT */}
          <div className="glass-card-strong rounded-[24px] p-5 flex flex-col">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="gradient-text font-bold text-sm">Studio AI</p>
              <div className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                video.progress === 100
                  ? 'bg-[hsl(var(--color-success)/0.12)] text-[hsl(var(--color-success))]'
                  : 'bg-[hsl(var(--color-accent-amber)/0.12)] text-[hsl(var(--color-accent-amber))]'
              }`}>
                {video.progress === 100 ? '✓' : completionPercentage}%
              </div>
            </div>

            {referenceImages[0] ? (
              <img src={referenceImages[0]} alt="Ref" className="w-full max-h-32 rounded-[14px] object-cover mb-3" />
            ) : null}

            <div className="flex flex-wrap gap-2 mb-4">
              <button
                type="button"
                onClick={() => runAssistantAction('explain')}
                disabled={assistantBusy}
                className="glass-card rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90 disabled:opacity-50"
              >
                Explain edit
              </button>
              <button
                type="button"
                onClick={() => runAssistantAction('assets')}
                disabled={assistantBusy}
                className="glass-card rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90 disabled:opacity-50"
              >
                Show assets
              </button>
              <button
                type="button"
                onClick={() => runAssistantAction('notes')}
                disabled={assistantBusy}
                className="glass-card rounded-full px-3 py-1.5 text-xs font-medium transition hover:opacity-90 disabled:opacity-50"
              >
                Export notes
              </button>
            </div>

            {assistantMessages.length === 0 ? (
              <div className="flex-1 flex flex-col gap-2 justify-center">
                {[
                  'Make it more cinematic',
                  'Change the lighting',
                  'Explain this render',
                  'What model was used?'
                ].map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => {
                      setAssistantInput(prompt);
                      setTimeout(submitAssistantPrompt, 0);
                    }}
                    disabled={assistantBusy}
                    className="glass-card text-left rounded-[12px] px-3 py-2 text-xs transition hover:opacity-90 disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex-1 min-h-[200px] overflow-y-auto space-y-3 mb-3">
                {assistantMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`glass-card rounded-[12px] px-3 py-2 text-xs ${
                      msg.role === 'user'
                        ? 'ml-auto max-w-[80%] bg-[hsl(var(--color-accent)/0.12)] border-[hsl(var(--color-accent)/0.2)]'
                        : 'bg-[hsl(var(--glass-bg-light))]'
                    }`}
                  >
                    {msg.text}
                  </div>
                ))}
              </div>
            )}

            <div className="glass-card flex items-center gap-2 rounded-[14px] px-3 py-2.5">
              <input
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !assistantBusy) {
                    e.preventDefault();
                    submitAssistantPrompt();
                  }
                }}
                disabled={assistantBusy}
                placeholder="Ask me anything…"
                className="flex-1 bg-transparent text-xs text-text outline-none placeholder:text-muted"
              />
              <button
                type="button"
                onClick={submitAssistantPrompt}
                disabled={assistantBusy || !assistantInput.trim()}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))] disabled:opacity-50"
              >
                <Sparkles className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* TWO COLUMNS BOTTOM: ASSETS + AUDIO SCRIPT */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* ASSETS */}
          <div className="glass-card-strong rounded-[24px] p-5">
            <p className="gradient-text font-bold text-sm mb-4">Assets</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['visual', 'bgm', 'speech'] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setAssetTab(key)}
                  className={`glass-card rounded-full px-3 py-1.5 text-xs font-medium transition ${assetTab === key ? 'bg-[hsl(var(--color-accent)/0.2)] border-[hsl(var(--color-accent)/0.4)]' : ''}`}
                >
                  {key === 'visual' ? '🖼️ Visual' : key === 'bgm' ? '🎵 BGM' : '🎙️ Speech'}
                </button>
              ))}
            </div>

            <div className="min-h-[200px]">
              {assetTab === 'visual' && visualAssets.length > 0 && (
                <div className="grid gap-3 grid-cols-2">
                  {visualAssets.slice(0, 4).map((asset, i) => (
                    <div key={i} className="overflow-hidden rounded-[14px] bg-[hsl(var(--color-bg-soft))]">
                      <img src={asset.url} alt={asset.label} className="w-full h-24 object-cover" />
                      <p className="px-2 py-1.5 text-xs font-medium text-text">{asset.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {assetTab === 'bgm' && (selectedTrack || video.music_file_url) && (
                <div className="glass-card rounded-[14px] p-3">
                  <p className="text-xs font-semibold text-text">{selectedTrack?.name || 'BGM'}</p>
                  <p className="mt-1 text-[11px] text-muted">{video.music_mode} · {Math.round(video.music_volume * 100)}%</p>
                  {selectedTrack?.preview_url && (
                    <audio className="mt-2 w-full" controls src={toAbsoluteUrl(selectedTrack.preview_url) ?? ''} />
                  )}
                </div>
              )}
              {assetTab === 'speech' && video.narration_enabled && (
                <div className="glass-card rounded-[14px] p-3 space-y-2">
                  <p className="text-xs font-semibold text-text">Voice: {video.tts_resolved_voice}</p>
                  <p className="text-[11px] text-muted">{video.tts_provider}</p>
                  <div className="flex gap-2">
                    <Button className="h-8 text-xs" onClick={() => void previewVoice()} disabled={voicePreviewing}>
                      {voicePreviewing ? 'Previewing…' : 'Preview'}
                    </Button>
                    <Button className="h-8 text-xs" variant="secondary" onClick={() => void applyVoiceAndRerender()} disabled={applyingVoice}>
                      {applyingVoice ? 'Applying…' : 'Apply'}
                    </Button>
                  </div>
                </div>
              )}
              {((assetTab === 'visual' && visualAssets.length === 0) || (assetTab === 'bgm' && !selectedTrack && !video.music_file_url) || (assetTab === 'speech' && !video.narration_enabled)) && (
                <div className="flex h-full items-center justify-center text-muted text-xs">No {assetTab} assets</div>
              )}
            </div>
          </div>

          {/* AUDIO SCRIPT */}
          <div className="glass-card-strong rounded-[24px] p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <p className="gradient-text font-bold text-sm">Audio Script</p>
              <div className="glass-card rounded-full px-2.5 py-1 text-[10px] font-semibold text-text">
                Read-only
              </div>
            </div>

            <div className="glass-card rounded-[14px] p-4 min-h-[200px] text-sm leading-relaxed text-text">
              {displayedNarrationScript ? displayedNarrationScript : <span className="text-muted">No script yet</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
