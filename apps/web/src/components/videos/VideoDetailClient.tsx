'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
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
  PanelLeftOpen,
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
import { Undo2, Redo2, MinusCircle, PlusCircle } from "lucide-react";
import type { MusicTrack, TTSLanguageOption, TTSVoiceOption, Video } from '@/types/api';

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

function buildTimelineTicks(durationSeconds: number | null) {
  const total = Math.max(1, Math.round(durationSeconds ?? 0));
  const step = Math.max(1, Math.ceil(total / 4));
  const values: number[] = [];

  for (let second = 0; second < total; second += step) {
    values.push(second);
  }

  if (values[values.length - 1] !== total) {
    values.push(total);
  }

  const uniqueValues = Array.from(new Set(values)).sort((left, right) => left - right);
  return uniqueValues.map((value) => ({
    seconds: value,
    label: formatClock(value),
    percent: total > 0 ? (value / total) * 100 : 0,
  }));
}

function SoftPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-[hsl(var(--color-bg-soft))] px-2.5 py-1 text-[11px] text-muted">
      {children}
    </span>
  );
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
  const [downloading, setDownloading] = useState(false);
  const [assetTab, setAssetTab] = useState<AssetTab>('visual');
  const [sharing, setSharing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [playbackDuration, setPlaybackDuration] = useState(0);
  const [timelineFrames, setTimelineFrames] = useState<string[]>([]);
  const [compactLeftPanes, setCompactLeftPanes] = useState(false);
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState(false);
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
  const [audioWaveformBars, setAudioWaveformBars] = useState<number[]>([]);
  const [bgmWaveformBars, setBgmWaveformBars] = useState<number[]>([]);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantMessages, setAssistantMessages] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [todoOverrides, setTodoOverrides] = useState<Record<string, boolean>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const timelineBoundsRef = useRef<{ left: number; width: number } | null>(null);
  const { wallet, refreshing } = useCredits();
  const { show } = useToast();

  const load = async () => {
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
    } catch {
      setError('Unable to load video status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [videoId, userId]);

  useEffect(() => {
    if (!video) return;
    if (video.status === 'completed' || video.status === 'failed' || video.status === 'provider_failed' || video.status === 'timed_out') {
      return;
    }

    const interval = setInterval(() => {
      void load();
    }, 3000);

    return () => clearInterval(interval);
  }, [video?.status]);

  const posterUrl = useMemo(() => {
    if (!video) return null;
    return toAbsoluteUrl(video.thumbnail_url) ?? toAbsoluteUrl(video.source_image_url) ?? toAbsoluteUrl(video.reference_images[0] ?? null);
  }, [video]);
  const displayPosterUrl = posterUrl ?? timelineFrames[0] ?? null;

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

  useEffect(() => {
    setTimelineFrames([]);
    if (typeof document === 'undefined' || !outputUrl || video?.status !== 'completed') return;

    let cancelled = false;
    const hiddenVideo = document.createElement('video');
    hiddenVideo.crossOrigin = 'anonymous';
    hiddenVideo.muted = true;
    hiddenVideo.playsInline = true;
    hiddenVideo.preload = 'auto';

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    const cleanup = () => {
      hiddenVideo.pause();
      hiddenVideo.removeAttribute('src');
      hiddenVideo.load();
    };

    const captureFrame = (time: number) =>
      new Promise<string | null>((resolve) => {
        const handleSeeked = () => {
          hiddenVideo.removeEventListener('seeked', handleSeeked);
          if (!context) {
            resolve(null);
            return;
          }
          const width = hiddenVideo.videoWidth || 270;
          const height = hiddenVideo.videoHeight || 480;
          canvas.width = width;
          canvas.height = height;
          context.drawImage(hiddenVideo, 0, 0, width, height);
          try {
            resolve(canvas.toDataURL('image/jpeg', 0.72));
          } catch {
            resolve(null);
          }
        };

        hiddenVideo.addEventListener('seeked', handleSeeked, { once: true });
        try {
          hiddenVideo.currentTime = time;
        } catch {
          hiddenVideo.removeEventListener('seeked', handleSeeked);
          resolve(null);
        }
      });

    hiddenVideo.onloadeddata = async () => {
      try {
        const duration = hiddenVideo.duration || video.duration_seconds || 0;
        if (!duration || cancelled) return;
        const frameCount = 12;
        const safeEnd = Math.max(duration - 0.08, 0);
        const frames: string[] = [];
        for (let index = 0; index < frameCount; index += 1) {
          const ratio = index / (frameCount - 1);
          const targetTime = Math.min(safeEnd, Math.max(0.05, ratio * safeEnd));
          const frame = await captureFrame(targetTime);
          if (frame) {
            frames.push(frame);
          }
        }
        if (!cancelled && frames.length > 0) {
          setTimelineFrames(frames);
        }
      } finally {
        cleanup();
      }
    };

    hiddenVideo.onerror = () => {
      cleanup();
    };

    hiddenVideo.src = outputUrl;
    hiddenVideo.load();

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [outputUrl, video?.duration_seconds, video?.status]);

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
  const plannerQaEntries = useMemo(
    () =>
      deepScenePlan
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
    [deepScenePlan],
  );

  const stage = video ? getStage(video.progress, video.status) : null;
  const isGenerationActive = video?.status === 'draft' || video?.status === 'processing';
  const todoItems = useMemo(() => (video ? getStageTodos(video) : []), [video]);
  const timelineDuration = useMemo(
    () => Math.max(0, playbackDuration || video?.duration_seconds || 0),
    [playbackDuration, video?.duration_seconds],
  );
  const ticks = useMemo(() => buildTimelineTicks(timelineDuration), [timelineDuration]);
  const playheadPercent = useMemo(() => {
    if (!timelineDuration || !Number.isFinite(timelineDuration)) return 0;
    return Math.max(0, Math.min(100, (playbackTime / timelineDuration) * 100));
  }, [playbackTime, timelineDuration]);
  const playheadStyle = useMemo(
    () => ({
      left: `${playheadPercent}%`,
    }),
    [playheadPercent],
  );
  const playedMaskStyle = useMemo(
    () => ({
      width: `${playheadPercent}%`,
    }),
    [playheadPercent],
  );

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

  const seekTimeline = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-timeline-surface="true"]') : null;
    const bounds = (target instanceof HTMLElement ? target : event.currentTarget).getBoundingClientRect();
    timelineBoundsRef.current = { left: bounds.left, width: bounds.width };
    const player = videoRef.current;
    if (!player || !timelineDuration) return;
    const ratio = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const nextTime = ratio * timelineDuration;
    player.currentTime = nextTime;
    setPlaybackTime(nextTime);
  };

  const seekTimelineFromClientX = (clientX: number) => {
    const player = videoRef.current;
    const bounds = timelineBoundsRef.current;
    if (!player || !timelineDuration || !bounds) return;
    const ratio = Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width));
    const nextTime = ratio * timelineDuration;
    player.currentTime = nextTime;
    setPlaybackTime(nextTime);
  };

  const beginTimelineScrub = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof HTMLElement ? event.target.closest('[data-timeline-surface="true"]') : null;
    const bounds = (target instanceof HTMLElement ? target : event.currentTarget).getBoundingClientRect();
    timelineBoundsRef.current = {
      left: bounds.left,
      width: bounds.width,
    };
    setIsScrubbingTimeline(true);
    seekTimelineFromClientX(event.clientX);
  };

  useEffect(() => {
    if (!isScrubbingTimeline) return;

    const handleMove = (event: PointerEvent) => {
      seekTimelineFromClientX(event.clientX);
    };

    const handleUp = () => {
      setIsScrubbingTimeline(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isScrubbingTimeline, timelineDuration]);

  const pushAssistantMessage = (role: 'user' | 'assistant', text: string) => {
    setAssistantMessages((current) => [...current, { role, text }]);
  };

  const runAssistantAction = (action: 'explain' | 'assets' | 'notes') => {
    if (action === 'assets') {
      setAssetTab('visual');
      pushAssistantMessage(
        'assistant',
        `I surfaced the current visual assets${referenceImages.length > 0 ? ` and found ${referenceImages.length} reference image${referenceImages.length === 1 ? '' : 's'}` : ''
        } for this render.`,
      );
      return;
    }
    if (action === 'notes') {
      pushAssistantMessage('assistant', `Export notes: ${createdSummary}`);
      return;
    }
    pushAssistantMessage('assistant', `This render is currently in "${stage?.label ?? 'progress'}". ${stage?.detail ?? ''}`);
  };

  const submitAssistantPrompt = () => {
    const prompt = assistantInput.trim();
    if (!prompt) return;

    pushAssistantMessage('user', prompt);

    if (/asset|reference|image/i.test(prompt)) {
      setAssetTab('visual');
      pushAssistantMessage('assistant', 'I opened the visual assets context for this render and kept the current reference media in view.');
    } else if (/todo|run|execute|complete/i.test(prompt)) {
      setTodoOverrides(Object.fromEntries(todoItems.map((item) => [item.label, true])));
      pushAssistantMessage('assistant', 'I marked the current workflow todos as executed in this studio view so you can track them as complete.');
    } else if (/music|bgm|audio/i.test(prompt)) {
      setAssetTab('bgm');
      pushAssistantMessage(
        'assistant',
        `I switched to the BGM context. ${selectedTrack?.name || 'The current music layer'} is the active audio source for this render.`,
      );
    } else {
      pushAssistantMessage(
        'assistant',
        `I can help with this render. Right now the studio is at "${stage?.label ?? 'processing'}" and the current summary is: ${createdSummary}`,
      );
    }

    setAssistantInput('');
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
    setAudioWaveformBars([]);
    if (typeof window === 'undefined' || !outputUrl) return;

    let cancelled = false;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();

    void (async () => {
      try {
        const bars = await decodeWaveformFromUrl(outputUrl, audioContext);
        if (!cancelled) {
          setAudioWaveformBars(bars);
        }
      } catch {
        if (!cancelled) {
          setAudioWaveformBars([]);
        }
      } finally {
        safelyCloseAudioContext(audioContext);
      }
    })();

    return () => {
      cancelled = true;
      safelyCloseAudioContext(audioContext);
    };
  }, [outputUrl]);

  useEffect(() => {
    setBgmWaveformBars([]);
    if (typeof window === 'undefined' || !video || !bgmPreviewUrl || video.music_mode === 'none') return;

    let cancelled = false;
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const audioContext = new AudioCtx();

    void (async () => {
      try {
        const bars = await decodeWaveformFromUrl(bgmPreviewUrl, audioContext);
        if (!cancelled) {
          setBgmWaveformBars(bars);
        }
      } catch {
        if (!cancelled) {
          setBgmWaveformBars([]);
        }
      } finally {
        safelyCloseAudioContext(audioContext);
      }
    })();

    return () => {
      cancelled = true;
      safelyCloseAudioContext(audioContext);
    };
  }, [bgmPreviewUrl, video?.music_mode]);

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
      await load();
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
      </div>

      <div className="flex flex-1 flex-col gap-2 px-4 pb-4 pt-3">
        <div
          className={`grid items-stretch gap-3 ${compactLeftPanes
            ? 'xl:grid-cols-[220px_220px_minmax(420px,1fr)_360px]'
            : 'xl:grid-cols-[260px_260px_minmax(440px,1fr)_360px]'
            }`}
        >
          <section>
            <div className="flex h-full min-h-[520px] flex-col rounded-[22px] bg-[hsl(var(--color-surface))] shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.3)]">
              <div className="flex items-center justify-between px-5 py-5">
                <p className="text-[15px] font-semibold text-text">Assets</p>
                <button
                  type="button"
                  onClick={() => setCompactLeftPanes((current) => !current)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-[12px] bg-[hsl(var(--color-bg-soft))] text-muted transition hover:text-text"
                  aria-label={compactLeftPanes ? 'Expand assets panel' : 'Compact assets panel'}
                >
                  <PanelLeftOpen className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="px-4 py-4">
                <div className="grid grid-cols-2 rounded-[14px] bg-[hsl(var(--color-bg-soft))] p-1">
                  <button type="button" className="rounded-[10px] bg-white px-4 py-2 text-sm font-medium text-text shadow-none">
                    Media
                  </button>
                  <button type="button" className="rounded-[10px] px-4 py-2 text-sm font-medium text-muted">
                    Docs
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 px-4">
                {([
                  ['visual', 'Visual', ImageIcon],
                  ['bgm', 'BGM', Music4],
                  ['speech', 'Speech', AudioLines],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAssetTab(key)}
                    className={`rounded-[12px] px-3 py-2 text-sm font-medium transition ${assetTab === key ? 'bg-[hsl(var(--color-bg-soft))] text-text' : 'bg-transparent text-muted hover:text-text'
                      }`}
                  >
                    {label}
                  </button>
                ))}

                <button
                  type="button"
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-[12px] bg-transparent text-muted transition hover:bg-[hsl(var(--color-bg-soft))] hover:text-text"
                  aria-label="Filter assets"
                >
                  <SlidersHorizontal className="h-4.5 w-4.5" />
                </button>
              </div>

              <div className="mt-6 flex-1 px-4 pb-4">
                {assetTab === 'visual' ? (
                  <div className="space-y-3">
                    {video.template || video.template_id ? (
                      <div className="rounded-[16px] bg-[hsl(var(--color-bg-soft))] p-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Recipe / format</p>
                        <p className="mt-1 text-sm font-semibold text-text">{video.template || video.template_id}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <SoftPill>{currentVideo.aspect_ratio}</SoftPill>
                          <SoftPill>{video.selected_model || 'Selected model'}</SoftPill>
                        </div>
                      </div>
                    ) : null}

                    {visualAssets.length > 0 ? (
                      visualAssets.slice(0, 4).map((asset, index) => (
                        <div key={`${asset.url}-${index}`} className="overflow-hidden rounded-[16px] bg-[hsl(var(--color-bg-soft))]">
                          <img
                            src={asset.url}
                            alt={asset.label}
                            className={`${asset.kind === 'output' ? 'aspect-[16/10] max-h-[124px]' : 'aspect-[4/5]'} w-full object-cover`}
                          />
                          <div className="px-3 py-2">
                            <p className="text-xs font-medium text-text">{asset.label}</p>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="flex min-h-[240px] items-center justify-center rounded-[14px] text-sm text-muted">No visuals yet</div>
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
                      <div className="flex min-h-[240px] items-center justify-center rounded-[14px] text-sm text-muted">No BGM yet</div>
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
                      <div className="flex min-h-[240px] items-center justify-center rounded-[14px] text-[15px] text-[hsl(var(--color-text-muted))]">
                        No Speech yet
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

          <section className="h-full">
            <div className="flex h-full min-h-[520px] flex-col rounded-[22px] bg-[hsl(var(--color-surface))] p-4 shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.3)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[0.75rem] font-semibold uppercase tracking-[0.05em] text-muted">Audio script</p>
                <div className="flex flex-wrap items-center gap-2">
                  {narrationSourceType ? (
                    <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1 text-xs text-text">
                      <span>{narrationSourceType === 'openai_explainer_script' ? 'AI narration' : 'Generated narration'}</span>
                    </div>
                  ) : null}
                  <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1 text-xs text-text">
                    <span>Read-only</span>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1 text-xs text-text">
                    <span>{video.captions_enabled ? 'Caption' : 'Caption off'}</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex-1 bg-transparent pt-2">
                {displayedNarrationScript ? (
                  <div className="space-y-3">
                    {selectedLanguage !== 'en-IN' ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <SoftPill>{selectedLanguageLabel}</SoftPill>
                        {translatingScript ? <SoftPill>Translating…</SoftPill> : null}
                      </div>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm leading-6 text-text">{displayedNarrationScript}</p>
                  </div>
                ) : (
                  <div className="flex h-full min-h-[180px] items-center justify-center text-sm text-muted">No audio script yet</div>
                )}
              </div>
            </div>
          </section>

          <section className="flex h-full min-h-[520px] flex-col rounded-[22px] bg-[hsl(var(--color-surface))] p-4 shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.3)]">
            <div className="flex flex-1 flex-col">
              <div className="overflow-hidden rounded-[18px] bg-[linear-gradient(180deg,hsl(var(--color-bg-soft)),hsl(var(--color-surface)))]">
                {video.status === 'completed' && outputUrl ? (
                  <div className="relative flex min-h-[320px] items-center justify-center px-4 py-4 xl:min-h-[356px]">
                    {!isPlaying && displayPosterUrl ? (
                      <img
                        src={displayPosterUrl}
                        alt={video.title || 'Poster frame'}
                        className="absolute inset-0 m-auto w-full max-w-[270px] rounded-[14px] object-cover 2xl:max-w-[300px]"
                        style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}
                      />
                    ) : null}
                    <video
                      ref={videoRef}
                      src={outputUrl}
                      poster={displayPosterUrl ?? undefined}
                      className={`relative w-full max-w-[270px] rounded-[14px] bg-transparent object-contain 2xl:max-w-[300px] ${!isPlaying && displayPosterUrl ? 'opacity-0' : 'opacity-100'
                        }`}
                      style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}
                      onLoadedMetadata={(event) => setPlaybackDuration(event.currentTarget.duration || 0)}
                      onTimeUpdate={(event) => setPlaybackTime(event.currentTarget.currentTime || 0)}
                      onPlay={() => setIsPlaying(true)}
                      onPause={() => setIsPlaying(false)}
                      onEnded={() => setIsPlaying(false)}
                    />
                  </div>
                ) : displayPosterUrl ? (
                  <div className="relative flex min-h-[320px] items-center justify-center px-4 py-4 xl:min-h-[356px]">
                    <img
                      src={displayPosterUrl}
                      alt={video.title || 'Video preview'}
                      className="w-full max-w-[270px] rounded-[14px] object-cover opacity-90 2xl:max-w-[300px]"
                      style={{ aspectRatio: video.aspect_ratio.replace(':', ' / ') }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/15 bg-black/30 backdrop-blur">
                        {video.status === 'completed' ? <Play className="ml-1 h-6 w-6 fill-current text-white" /> : <Spinner />}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex min-h-[320px] items-center justify-center text-muted xl:min-h-[356px]">
                    <div className="flex aspect-[9/16] w-full max-w-[270px] animate-pulse items-center justify-center rounded-[14px] bg-[hsl(var(--color-bg-soft))] 2xl:max-w-[300px]">
                      <Clapperboard className="h-10 w-10" />
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 px-1 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlayback}
                    disabled={currentVideo.status !== 'completed' || !outputUrl}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-bg-soft))] text-text transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={isPlaying ? 'Pause video' : 'Play video'}
                  >
                    {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                  </button>
                  <span className="text-xs font-medium text-muted">
                    {formatClock(playbackTime)} / {formatClock(playbackDuration || currentVideo.duration_seconds || 0)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void openFullscreen()}
                    disabled={video.status !== 'completed' || !outputUrl}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-bg-soft))] text-text transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label="Fullscreen"
                  >
                    <Expand className="h-4 w-4" />
                  </button>
                  <div className="flex flex-wrap gap-2">
                    <SoftPill>{currentVideo.aspect_ratio}</SoftPill>
                    <SoftPill>{currentVideo.resolution}</SoftPill>
                    {currentVideo.duration_seconds ? <SoftPill>{formatLongDuration(currentVideo.duration_seconds)}</SoftPill> : null}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <aside className="min-h-0 self-start">
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
                      {video.captions_enabled ? <SoftPill>Captions on</SoftPill> : <SoftPill>Captions off</SoftPill>}
                    </div>
                    <p className="text-sm leading-6 text-text">{displayedNarrationScript || 'Prepare a social-first video from my prompt.'}</p>
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
                      <p className="mt-3 text-sm leading-6 text-text">{event.detail}</p>
                    </div>
                  ))
                  : (
                    <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                      <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                        <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                        {stage.label}
                      </div>
                      <p className="mt-3 text-sm leading-6 text-text">{stage.detail}</p>
                    </div>
                  )}

                {isGenerationActive ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                      <Spinner />
                      AI is working
                    </div>
                    <p className="mt-3 text-sm leading-6 text-text">
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
                  <p className="mt-3 text-sm leading-6 text-text">{createdSummary}</p>
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

                {assistantMessages.map((message, index) => (
                  <div
                    key={`${message.role}-${index}`}
                    className={`${message.role === 'user'
                      ? 'ml-auto max-w-[88%] rounded-[18px] bg-[hsl(var(--color-accent)/0.12)] px-4 py-3'
                      : 'max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3'
                      }`}
                  >
                    <p className="text-sm leading-6 text-text">{message.text}</p>
                  </div>
                ))}

                {selectedTrack || video.music_file_url ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--color-bg))] px-2.5 py-1 text-[11px] font-medium text-muted">
                      <Music4 className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                      Updated BGM
                    </div>
                    <p className="mt-3 text-sm leading-6 text-text">
                      {selectedTrack?.name || 'Background music attached'} is ready for the final mix at {Math.round(video.music_volume * 100)}%
                      volume.
                    </p>
                  </div>
                ) : null}

                {video.status === 'completed' ? (
                  <div className="max-w-[92%] rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-4 py-3">
                    <p className="text-sm leading-6 text-text">
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
                    className="rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1.5 text-xs font-medium text-text transition hover:opacity-90"
                  >
                    Explain edit
                  </button>
                  <button
                    type="button"
                    onClick={() => runAssistantAction('assets')}
                    className="rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1.5 text-xs font-medium text-text transition hover:opacity-90"
                  >
                    Show assets
                  </button>
                  <button
                    type="button"
                    onClick={() => runAssistantAction('notes')}
                    className="rounded-full bg-[hsl(var(--color-bg-soft))] px-3 py-1.5 text-xs font-medium text-text transition hover:opacity-90"
                  >
                    Export notes
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2 text-xs text-muted">
                  <Sparkles className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                  Ask me anything...
                </div>

                <div className="mt-3 flex items-center justify-between gap-3 rounded-[16px] bg-[hsl(var(--color-bg-soft))] px-3.5 py-3 text-sm text-muted">
                  <div className="flex min-w-0 items-center gap-3">
                    <Wand2 className="h-4 w-4 shrink-0 text-[hsl(var(--color-accent))]" />
                    <input
                      value={assistantInput}
                      onChange={(event) => setAssistantInput(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          submitAssistantPrompt();
                        }
                      }}
                      placeholder="Ask about this render, assets, or the next edit step…"
                      className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={submitAssistantPrompt}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))] shadow-none"
                    aria-label="Send"
                  >
                    <Sparkles className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>

        <section className="rounded-[22px] bg-[hsl(var(--color-surface))] p-4 shadow-soft ring-1 ring-[hsl(var(--color-border-soft)/0.18)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.08em] text-muted">Timeline</p>
              <p className="mt-1 text-xs text-muted">Scrub through video and audio layers</p>
            </div>
            <p className="text-xs text-muted">
              {formatClock(playbackTime)} / {formatClock(playbackDuration || currentVideo.duration_seconds || 0)}
            </p>
          </div>

          <div className="mt-4 rounded-[18px] bg-[hsl(var(--color-bg-soft))] px-3 py-3 ring-1 ring-[hsl(var(--color-border-soft)/0.14)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-muted">
                <button type="button" className="rounded-full p-2 hover:bg-[hsl(var(--color-surface))]" aria-label="Undo timeline action">
                  <Undo2 className="h-4 w-4" />
                </button>
                <button type="button" className="rounded-full p-2 hover:bg-[hsl(var(--color-surface))]" aria-label="Redo timeline action">
                  <Redo2 className="h-4 w-4" />
                </button>
                <div className="ml-2 flex items-center gap-2 rounded-full bg-[hsl(var(--color-surface))] px-3 py-1.5">
                  <Music4 className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
                  <span className="text-sm font-medium text-text">
                    {selectedTrack?.name || 'Final timeline audio'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <MinusCircle className="h-4 w-4 text-muted" />
                <div className="h-1.5 w-24 rounded-full bg-[hsl(var(--color-border-soft)/0.35)]">
                  <div className="h-full w-1/2 rounded-full bg-[hsl(var(--color-accent))]" />
                </div>
                <PlusCircle className="h-4 w-4 text-muted" />
              </div>
            </div>

            <div className="relative overflow-hidden rounded-[16px] bg-[hsl(var(--color-surface))] ring-1 ring-[hsl(var(--color-border-soft)/0.14)]">
              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 border-b border-[hsl(var(--color-border-soft)/0.12)] px-3 py-3">
                <div />
                <div
                  data-timeline-surface="true"
                  className="relative h-8 cursor-pointer"
                  onClick={seekTimeline}
                  onPointerDown={beginTimelineScrub}
                  role="presentation"
                >
                  {ticks.map((tick, index) => (
                    <div
                      key={`${tick.seconds}-${index}`}
                      className={`absolute top-0 text-[11px] text-muted ${index === 0 ? 'translate-x-0' : index === ticks.length - 1 ? '-translate-x-full' : '-translate-x-1/2'
                        }`}
                      style={{ left: `${tick.percent}%` }}
                    >
                      <span>{tick.label}</span>
                      <span className="absolute left-0 top-5 h-2 w-px bg-[hsl(var(--color-border-soft)/0.45)]" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[3rem_minmax(0,1fr)] gap-3 px-3 pb-3 pt-2">
                <div className="pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Video
                </div>

                <div className="relative">
                  <div
                    className="pointer-events-none absolute inset-y-0 z-20 w-px bg-[hsl(var(--color-accent))]"
                    style={playheadStyle}
                  >
                    <span className="absolute -top-1 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-[hsl(var(--color-accent))] shadow-[0_0_0_4px_hsl(var(--color-accent)/0.14)]" />
                  </div>

                  <div
                    data-timeline-surface="true"
                    className="relative min-w-0 cursor-pointer"
                    onClick={seekTimeline}
                    onPointerDown={beginTimelineScrub}
                    role="presentation"
                  >
                    <div className="relative flex overflow-hidden rounded-[12px] bg-[hsl(var(--color-bg))] p-1">
                      <div
                        className="pointer-events-none absolute inset-y-1 left-0 z-0 rounded-[10px] bg-[hsl(var(--color-accent)/0.08)]"
                        style={playedMaskStyle}
                      />
                      {(timelineFrames.length > 0
                        ? timelineFrames
                        : Array.from({ length: 12 }, () => displayPosterUrl).filter(Boolean)
                      ).map((frameSrc, index) => (
                        <div
                          key={`video-thumb-${index}`}
                          className="relative z-10 min-h-[92px] flex-1 overflow-hidden border-r border-[hsl(var(--color-surface)/0.65)] last:border-r-0"
                        >
                          {frameSrc ? (
                            <img src={frameSrc} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-black" />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  Audio
                </div>

                <div
                  data-timeline-surface="true"
                  className="relative min-w-0 cursor-pointer"
                  onClick={seekTimeline}
                  onPointerDown={beginTimelineScrub}
                  role="presentation"
                >
                  <div className="relative rounded-[10px] bg-[hsl(var(--color-bg))] px-3 py-3">
                    <div
                      className="pointer-events-none absolute inset-y-2 left-0 rounded-[8px] bg-[hsl(var(--color-accent)/0.06)]"
                      style={playedMaskStyle}
                    />
                    <div className="mb-2 text-sm font-medium text-text">Final video audio</div>
                    <div className="relative z-10 flex h-10 items-center gap-[3px] overflow-hidden">
                      {(audioWaveformBars.length > 0
                        ? audioWaveformBars
                        : Array.from({ length: 72 }, (_, index) => 0.25 + ((index % 8) * 0.08))
                      ).map((value, index) => (
                        <span
                          key={`audio-wave-${index}`}
                          className="block w-[3px] rounded-full bg-[hsl(var(--color-accent)/0.78)]"
                          style={{
                            height: `${8 + value * 18}px`,
                            opacity: Math.min(0.95, 0.28 + value),
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {currentVideo.music_mode !== 'none' ? (
                  <>
                    <div className="pt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                      BGM
                    </div>

                    <div
                      data-timeline-surface="true"
                      className="relative min-w-0 cursor-pointer"
                      onClick={seekTimeline}
                      onPointerDown={beginTimelineScrub}
                      role="presentation"
                    >
                      <div className="relative rounded-[10px] bg-[hsl(var(--color-bg))] px-3 py-3">
                        <div
                          className="pointer-events-none absolute inset-y-2 left-0 rounded-[8px] bg-[hsl(var(--color-accent)/0.05)]"
                          style={playedMaskStyle}
                        />
                        <div className="mb-2 text-sm font-medium text-text">
                          {selectedTrack?.name || 'Background music'}
                        </div>
                        <div className="relative z-10 flex h-8 items-center gap-[3px] overflow-hidden">
                          {(bgmWaveformBars.length > 0
                            ? bgmWaveformBars
                            : Array.from({ length: 72 }, (_, index) => 0.18 + ((index % 8) * 0.06))
                          ).map((value, index) => (
                            <span
                              key={`bgm-wave-${index}`}
                              className="block w-[3px] rounded-full bg-[hsl(var(--color-accent)/0.55)]"
                              style={{
                                height: `${6 + value * 14}px`,
                                opacity: Math.min(0.9, 0.22 + value),
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
