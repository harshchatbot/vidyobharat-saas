'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Film, Mic2, Settings2, Sparkles, Wallet, Wand2 } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import { useCredits } from '@/components/credits/CreditContext';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AIVideoModel, AIVideoStatusResponse, CreditEstimateResponse, GeneratedImage, MusicTrack, TTSLanguageOption, TTSVoiceOption, Video } from '@/types/api';

import { ASPECT_OPTIONS, AUDIO_QUALITY_OPTIONS, FALLBACK_VIDEO_MODELS, LANGUAGE_OPTIONS, RESOLUTION_DISPLAY_OPTIONS, RESOLUTION_OPTIONS, TEMPLATE_OPTIONS, VIDEO_DURATION_RULES, VIDEO_OUTPUT_RULES, VOICE_OPTIONS } from './constants';
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

const DRAFT_VERSION = 2;

function sanitizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

type VideoModelKey = 'sora2' | 'veo3' | 'kling3';

export function CreateVideoPage({
  userId,
  templateKey,
  initialScript,
  initialTitle,
}: {
  userId: string;
  templateKey?: string;
  initialScript?: string;
  initialTitle?: string;
}) {
  const draftKey = `rangmanch-create-draft:${userId}`;
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const voicePreviewAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastTaggedScriptRef = useRef('');

  const initialTemplate = TEMPLATE_OPTIONS.find((item) => item.key === templateKey) ?? TEMPLATE_OPTIONS[0];

  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate.key);
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
  const [voicePreviewText, setVoicePreviewText] = useState('');
  const [voiceOptions, setVoiceOptions] = useState<TTSVoiceOption[]>(VOICE_OPTIONS);
  const [languageOptions, setLanguageOptions] = useState<TTSLanguageOption[]>(LANGUAGE_OPTIONS);
  const [voicePreviewError, setVoicePreviewError] = useState<string | null>(null);
  const [voicePreviewProvider, setVoicePreviewProvider] = useState<string | null>(null);
  const [voicePreviewResolvedVoice, setVoicePreviewResolvedVoice] = useState<string | null>(null);
  const [voicePreviewCached, setVoicePreviewCached] = useState(false);
  const [voicePreviewLimit, setVoicePreviewLimit] = useState<string | null>(null);
  const [voicePreviewMessage, setVoicePreviewMessage] = useState<string | null>(null);
  const [voiceTranslationLoading, setVoiceTranslationLoading] = useState(false);
  const [voiceEstimate, setVoiceEstimate] = useState<CreditEstimateResponse | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const [models, setModels] = useState<AIVideoModel[]>(FALLBACK_VIDEO_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelKey, setModelKey] = useState<VideoModelKey>('sora2');

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
  const [resolution, setResolution] = useState<'720p' | '1080p'>('1080p');
  const [durationMode, setDurationMode] = useState<'auto' | 'custom'>('custom');
  const [durationSeconds, setDurationSeconds] = useState('8');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionStyle, setCaptionStyle] = useState('Classic');

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [creditEstimate, setCreditEstimate] = useState<CreditEstimateResponse | null>(null);
  const [job, setJob] = useState<Video | null>(null);
  const [jobStatus, setJobStatus] = useState<AIVideoStatusResponse | null>(null);
  const [jobResponseId, setJobResponseId] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const { wallet: creditWallet, applyWallet, refresh: refreshCredits, openLowBalanceModal } = useCredits();
  const { show } = useToast();

  const template = TEMPLATE_OPTIONS.find((item) => item.key === selectedTemplate) ?? TEMPLATE_OPTIONS[0];
  const visibleTemplates = TEMPLATE_OPTIONS.filter((item) => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.label} ${item.description}`.toLowerCase().includes(query);
  });
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const selectedModel = models.find((model) => model.key === modelKey) ?? models[0];
  const selectedLanguageCode =
    languageOptions.find((item) => item.label === language)?.code ??
    LANGUAGE_OPTIONS.find((item) => item.label === language)?.code ??
    'en-IN';
  const filteredVoiceOptions = voiceOptions.filter((item) =>
    item.supported_language_codes.includes(selectedLanguageCode),
  );
  const durationRule = VIDEO_DURATION_RULES[modelKey];
  const outputRule = VIDEO_OUTPUT_RULES[modelKey];
  const outputSizes = outputRule.sizes as Record<string, Record<string, string>>;
  const supportedAspects = [...outputRule.aspects] as string[];
  const supportedResolutions = [...outputRule.resolutions] as string[];
  const hasReferenceImages = selectedImageUrls.length > 0;
  const seededDuration = modelKey === 'veo3' ? VIDEO_DURATION_RULES.veo3.seededSeconds : undefined;
  const klingMinDuration = modelKey === 'kling3' ? VIDEO_DURATION_RULES.kling3.minSeconds : undefined;
  const klingMaxDuration = modelKey === 'kling3' ? VIDEO_DURATION_RULES.kling3.maxSeconds : undefined;
  const availableDurations: number[] = modelKey === 'veo3' && hasReferenceImages && seededDuration
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
  const estimatedSeconds = Number(durationSeconds) || durationRule.defaultSeconds;
  const sampleRateCreditMultiplier = audioSampleRateHz === 48000 ? 1.3 : audioSampleRateHz === 8000 ? 0.85 : 1;
  const estimatedCredits = modelKey === 'sora2'
    ? Math.round(Math.max(16, estimatedSeconds * (resolution === '1080p' ? 3 : 2)) * sampleRateCreditMultiplier)
    : modelKey === 'veo3'
      ? Math.round(Math.max(12, estimatedSeconds * (resolution === '1080p' ? 2 : 1)) * sampleRateCreditMultiplier)
      : Math.round(Math.max(10, estimatedSeconds * (resolution === '1080p' ? 2 : 1)) * sampleRateCreditMultiplier);
  const estimatedTime = modelKey === 'sora2' ? '2-4 min' : modelKey === 'veo3' ? '1-3 min' : '1-2 min';
  const durationError =
    modelKey === 'kling3'
      ? (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) < (klingMinDuration ?? 3) || Number(durationSeconds) > (klingMaxDuration ?? 10)
        ? `Enter a duration between ${klingMinDuration}s and ${klingMaxDuration}s.`
        : null)
      : (!availableDurations.includes(Number(durationSeconds))
        ? `Choose one of the supported ${selectedModel.label} durations: ${availableDurations.map((value) => `${value}s`).join(', ')}.`
        : null);
  const generationOverlayVisible = submitting || jobStatus?.status === 'queued' || jobStatus?.status === 'processing';
  const overlayVisible = initialLoading || voiceTranslationLoading || generationOverlayVisible;
  const overlayTitle = initialLoading
    ? 'Preparing your studio'
    : voiceTranslationLoading
      ? 'Translating preview text'
      : 'Generating your video';
  const overlayDescription = initialLoading
    ? 'Loading models, voices, images, and recent videos so the creator studio is ready.'
    : voiceTranslationLoading
      ? `Converting your preview line into ${language} so the selected voice can be auditioned accurately.`
      : `Building your ${selectedModel.label} render with the selected script, voice, media, and output settings.`;
  const overlayStepLabel = initialLoading
    ? 'Fetching studio data'
    : voiceTranslationLoading
      ? `Localizing text for ${language}`
      : submitting
        ? 'Submitting render job'
        : jobStatus?.status === 'queued'
          ? 'Queued in the render pipeline'
          : 'Rendering visuals and audio';
  const overlayAccentLabel = initialLoading
    ? 'Studio Load'
    : voiceTranslationLoading
      ? 'Language Update'
      : 'Video Render';

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    setInitialLoading(true);
    void Promise.all([
      api.listAIVideoModels(userId).catch(() => FALLBACK_VIDEO_MODELS),
      api.getTtsCatalog(userId).catch(() => null),
      api.listGeneratedImages(userId).catch(() => []),
      api.listVideos(userId).catch(() => []),
    ]).then(([videoModels, ttsCatalog, userImages, userVideos]) => {
      if (cancelled) return;
      setModels(videoModels.length > 0 ? videoModels : FALLBACK_VIDEO_MODELS);
      if (ttsCatalog) {
        setLanguageOptions(ttsCatalog.languages.length > 0 ? ttsCatalog.languages : LANGUAGE_OPTIONS);
        setVoiceOptions(ttsCatalog.voices.length > 0 ? ttsCatalog.voices : VOICE_OPTIONS);
      }
      setGeneratedImages(userImages);
      setVideos(userVideos);
      if (videoModels.length > 0 && !videoModels.some((item) => item.key === modelKey)) {
        setModelKey((videoModels[0].key as VideoModelKey) ?? 'sora2');
      }
    }).finally(() => {
      if (!cancelled) {
        setModelsLoading(false);
        setInitialLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    const availableVoices = filteredVoiceOptions.length > 0 ? filteredVoiceOptions : voiceOptions;
    if (!availableVoices.some((item) => item.key === voice) && availableVoices[0]) {
      setVoice(availableVoices[0].key);
    }
  }, [filteredVoiceOptions, voiceOptions, voice]);

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
      if (typeof parsed.durationMode === 'string') setDurationMode(parsed.durationMode as 'auto' | 'custom');
      if (typeof parsed.durationSeconds === 'string') setDurationSeconds(parsed.durationSeconds);
      if (typeof parsed.captionsEnabled === 'boolean') setCaptionsEnabled(parsed.captionsEnabled);
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
      durationMode,
      durationSeconds,
      captionsEnabled,
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
    durationMode,
    durationSeconds,
    captionsEnabled,
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
    let cancelled = false;
    void api.estimateCredits(
      'video_create',
      {
        modelKey,
        resolution,
        durationSeconds: Number(durationSeconds) || durationRule.defaultSeconds,
        captionsEnabled: captionsEnabled,
        voice,
        imageUrls: selectedImageUrls,
        audioSettings: { sampleRateHz: audioSampleRateHz },
      },
      userId,
    )
      .then((result) => {
        if (!cancelled) setCreditEstimate(result);
      })
      .catch(() => {
        if (!cancelled) setCreditEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, modelKey, resolution, durationSeconds, durationRule.defaultSeconds, captionsEnabled, voice, selectedImageUrls, audioSampleRateHz]);

  useEffect(() => {
    let cancelled = false;
    void api.estimateCredits(
      'tts_preview',
      {
        voice,
        sample_rate_hz: audioSampleRateHz,
      },
      userId,
    )
      .then((result) => {
        if (!cancelled) setVoiceEstimate(result);
      })
      .catch(() => {
        if (!cancelled) setVoiceEstimate(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, voice, audioSampleRateHz]);

  useEffect(() => {
    if (!jobResponseId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await api.getAIVideoStatus(jobResponseId, userId);
        if (cancelled) return;
        setJobStatus(status);
        if (status.status === 'success') {
          const fullVideo = await api.getVideo(jobResponseId, userId);
          if (!cancelled) {
            setJob(fullVideo);
            const refreshedVideos = await api.listVideos(userId).catch(() => null);
            if (!cancelled && refreshedVideos) setVideos(refreshedVideos);
          }
        }
      } catch (error) {
        if (!cancelled) setSubmitError(error instanceof Error ? error.message : 'Failed to refresh job status.');
      }
    };

    void poll();
    const interval = window.setInterval(() => {
      void poll();
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [jobResponseId, userId]);

  useEffect(() => {
    setDurationMode('custom');
    const currentSeconds = Number(durationSeconds);
    if (modelKey === 'veo3' && hasReferenceImages && seededDuration) {
      if (currentSeconds !== seededDuration) {
        setDurationSeconds(String(seededDuration));
      }
      return;
    }

    if (modelKey === 'kling3') {
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
    const next = TEMPLATE_OPTIONS.find((item) => item.key === templateId);
    if (!next) return;
    setSelectedTemplate(next.key);
    if (!topic.trim()) setTopic(next.topicHint);
    if (!script.trim()) setScript(next.scriptHint);
    setSubmitError(null);
    setScriptError(null);
  };

  const generateScript = async () => {
    if (!topic.trim()) {
      setScriptError('Enter a topic first.');
      return;
    }
    setScriptLoading(true);
    setScriptError(null);
    try {
      const result = await api.generateScriptV2({
        template: template.label,
        topic: topic.trim(),
        language,
      }, userId);
      setScript(result.script);
      setScriptTags(result.tags);
      setTitle(topic.trim());
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : 'Failed to generate script.');
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
      const result = await api.enhanceScriptV2({ script: script.trim(), template: template.label, language }, userId);
      setScript(result.script);
      setScriptTags(result.tags);
      if (topic.trim()) setTitle(topic.trim());
    } catch (error) {
      setScriptError(error instanceof Error ? error.message : 'Failed to enhance script.');
    } finally {
      setScriptLoading(false);
    }
  };

  const previewVoice = async (previewVoiceKey?: string) => {
    const activeVoice = previewVoiceKey ?? voice;
    if (previewVoiceKey && previewVoiceKey !== voice) {
      setVoice(previewVoiceKey);
    }
    if (voicePreviewing) {
      const player = voicePreviewAudioRef.current;
      player?.pause();
      if (player) player.currentTime = 0;
      setVoicePreviewing(false);
      return;
    }
    setVoicePreviewError(null);
    setVoicePreviewProvider(null);
    setVoicePreviewResolvedVoice(null);
    setVoicePreviewMessage(null);
    try {
      const response = await api.previewTts(
        {
          text: voicePreviewText.trim(),
          language,
          voice: activeVoice,
          sample_rate_hz: audioSampleRateHz,
        },
        userId,
      );
      const player = voicePreviewAudioRef.current;
      if (!player) return;
      player.src = response.preview_url.startsWith('http') ? response.preview_url : `${API_URL}${response.preview_url}`;
      player.currentTime = 0;
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
      if (typeof response.remaining_credits === 'number' && creditWallet) {
        applyWallet({ ...creditWallet, currentCredits: response.remaining_credits });
      }
      if (response.applied_credits > 0) {
        show(`Created! Credits Used: ${response.applied_credits} · Remaining Balance: ${response.remaining_credits ?? creditWallet?.currentCredits ?? 0}`);
      }
      setVoicePreviewing(true);
      await player.play();
    } catch (error) {
      setVoicePreviewError(error instanceof Error ? error.message : 'Voice preview failed.');
      setVoicePreviewLimit('20 uncached previews / 10 min · 280 chars max');
      setVoicePreviewing(false);
    }
  };

  const handleVoiceChange = (nextVoice: string) => {
    setVoice(nextVoice);
  };

  const handleLanguageChange = async (nextLanguage: string) => {
    setLanguage(nextLanguage);
    if (!voicePreviewText.trim()) return;
    setVoiceTranslationLoading(true);
    setVoicePreviewError(null);
    try {
      const result = await api.translateScriptText(
        {
          text: voicePreviewText.trim(),
          target_language: nextLanguage,
        },
        userId,
      );
      setVoicePreviewText(result.text);
    } catch (error) {
      setVoicePreviewError(error instanceof Error ? error.message : 'Preview text translation failed.');
    } finally {
      setVoiceTranslationLoading(false);
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

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    setJob(null);
    setJobStatus(null);

    try {
      const result = await api.createAIVideo({
        template: template.label,
        script: script.trim(),
        tags: scriptTags,
        modelKey,
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
        durationMode: 'custom',
        durationSeconds: Number(durationSeconds),
        captionsEnabled,
        captionStyle: captionStyle.toLowerCase(),
      }, userId);
      if (typeof result.remainingCredits === 'number') {
        if (creditWallet) {
          applyWallet({ ...creditWallet, currentCredits: result.remainingCredits });
        } else {
          void refreshCredits();
        }
      }
      show(`Created! Credits Used: ${result.appliedCredits} · Remaining Balance: ${result.remainingCredits ?? creditWallet?.currentCredits ?? 0}`);
      setJobResponseId(result.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to create video job.');
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <LoadingOverlay
        open={overlayVisible}
        title={overlayTitle}
        description={overlayDescription}
        stepLabel={overlayStepLabel}
        accentLabel={overlayAccentLabel}
      />

      <section className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[linear-gradient(135deg,hsl(var(--color-surface)),hsl(var(--color-bg)))] p-6 shadow-soft sm:p-8">
        <div className="max-w-3xl">
          <p className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.8)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted">
            <Clapperboard className="h-3.5 w-3.5 text-[hsl(var(--color-accent))]" />
            Video Studio
          </p>
          <h1 className="mt-4 font-heading text-3xl font-extrabold tracking-tight text-text sm:text-4xl">Create Your AI Video</h1>
          <p className="mt-3 max-w-2xl text-sm text-muted sm:text-base">
            Pick a content direction, write or enhance your script, customize settings, and generate your video.
          </p>
          {creditWallet ? (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.85)] px-4 py-2 text-sm font-semibold text-text">
              <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              {creditWallet.currentCredits} credits available
            </div>
          ) : null}
        </div>
      </section>

      <SectionCard
        title="Content Template"
        description="Choose a content direction to drive script hints and creative defaults."
        icon={<Film className="h-5 w-5" />}
      >
        <TemplateSelector
          search={templateSearch}
          onSearchChange={setTemplateSearch}
          templates={visibleTemplates}
          selectedTemplate={selectedTemplate}
          onSelect={applyTemplate}
        />
      </SectionCard>

      <SectionCard
        title="Script Editor & AI Assist"
        description="Write manually, generate a first draft, or enhance the current script."
        icon={<Wand2 className="h-5 w-5" />}
      >
        <ScriptEditor
          topic={topic}
          onTopicChange={setTopic}
          topicPlaceholder={template.topicHint}
          script={script}
          onScriptChange={setScript}
          scriptPlaceholder={template.scriptHint}
          onGenerate={() => void generateScript()}
          onEnhance={() => void enhanceScript()}
          loading={scriptLoading}
          error={scriptError}
          tags={scriptTags}
        />
      </SectionCard>

      <SectionCard
        title="Video Model Selection"
        description="Choose based on output style and realism, not just provider name."
        icon={<Sparkles className="h-5 w-5" />}
        action={modelsLoading ? <Spinner /> : null}
      >
        <ModelDropdown models={models} selectedModel={modelKey} onChange={(value) => setModelKey(value as VideoModelKey)} />
      </SectionCard>

      <SectionCard
        title="Voice & Language"
        description="Pick the narration language and voice personality."
        icon={<Mic2 className="h-5 w-5" />}
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
          previewProvider={voicePreviewProvider}
          resolvedVoice={voicePreviewResolvedVoice}
          previewCached={voicePreviewCached}
          previewLimit={voicePreviewLimit}
          previewError={voicePreviewError}
          previewMessage={voicePreviewMessage}
          translating={voiceTranslationLoading}
          estimatedCredits={voiceEstimate?.estimatedCredits}
          currentBalance={voiceEstimate?.currentCredits ?? creditWallet?.currentCredits ?? null}
          insufficientCredits={Boolean(voiceEstimate && !voiceEstimate.sufficient)}
          onOpenLowBalance={() => openLowBalanceModal(voiceEstimate?.estimatedCredits)}
        />
        <audio ref={voicePreviewAudioRef} onEnded={() => setVoicePreviewing(false)} onPause={() => setVoicePreviewing(false)} />
      </SectionCard>

      <SectionCard
        title="Optional Reference Images"
        description="Use your image library or add external references for image-seeded generation."
        icon={<Film className="h-5 w-5" />}
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

      <SectionCard
        title="Background Audio"
        description="Add music, preview it, and control how it sits under narration."
        icon={<Mic2 className="h-5 w-5" />}
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

      <SectionCard
        title="Output Settings"
        description="Adjust format, resolution, duration, and captions before you submit."
        icon={<Settings2 className="h-5 w-5" />}
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
          durationSeconds={durationSeconds}
          onDurationSecondsChange={setDurationSeconds}
          availableDurations={availableDurations}
          supportsCustomDuration={modelKey === 'kling3'}
          minDuration={klingMinDuration}
          maxDuration={klingMaxDuration}
          durationHelperText={modelKey === 'veo3' && hasReferenceImages && seededDuration
            ? 'Veo 3.1 image-seeded clips are currently limited to 8 seconds.'
            : durationRule.helperText}
          durationError={durationError}
          captionsEnabled={captionsEnabled}
          onCaptionsEnabledChange={setCaptionsEnabled}
          captionStyle={captionStyle}
          onCaptionStyleChange={setCaptionStyle}
        />
      </SectionCard>

      <GenerateButton
        onClick={() => void submit()}
        loading={submitting}
        estimatedCredits={creditEstimate?.estimatedCredits ?? estimatedCredits}
        estimatedTime={estimatedTime}
        currentBalance={creditEstimate?.currentCredits ?? creditWallet?.currentCredits ?? null}
        disabled={Boolean(durationError)}
        insufficientCredits={Boolean(creditEstimate && !creditEstimate.sufficient)}
        onOpenLowBalance={() => openLowBalanceModal(creditEstimate?.estimatedCredits)}
        helperText={
          creditEstimate
            ? `Audio quality: ${AUDIO_QUALITY_OPTIONS.find((item) => item.value === audioSampleRateHz)?.label ?? '22 kHz'} · estimated remaining balance ${creditEstimate.remainingCredits} credits`
            : `Audio quality: ${AUDIO_QUALITY_OPTIONS.find((item) => item.value === audioSampleRateHz)?.label ?? '22 kHz'}`
        }
      />

      {submitError ? (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-[hsl(var(--color-danger))]">{submitError}</p>
            {submitError.toLowerCase().includes('insufficient credits') ? (
              <Link href="/billing" className="text-sm font-semibold text-[hsl(var(--color-accent))]">
                Top up credits
              </Link>
            ) : null}
          </div>
        </Card>
      ) : null}

      <VideoPreview
        job={job}
        loading={submitting || jobStatus?.status === 'queued' || jobStatus?.status === 'processing'}
        error={submitError ?? (jobStatus?.status === 'failed' ? jobStatus.errorMessage ?? 'Generation failed.' : null)}
        onRetry={retry}
      />

      <SectionCard
        title="Studio Feed"
        description="Review your latest generated videos without leaving the create flow."
        icon={<Film className="h-5 w-5" />}
      >
        {videos.length === 0 ? (
          <p className="text-sm text-muted">No videos generated yet. Your latest video jobs will appear here.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {videos.map((videoItem) => {
              const videoUrl = toAssetUrl(videoItem.output_url);
              const thumbUrl = toAssetUrl(videoItem.thumbnail_url) ?? toAssetUrl(videoItem.source_image_url);
              return (
                <div key={videoItem.id} className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-bg">
                  {videoUrl ? (
                    <video src={videoUrl} poster={thumbUrl ?? undefined} className="h-48 w-full bg-black object-cover" />
                  ) : thumbUrl ? (
                    <img src={thumbUrl} alt={videoItem.title ?? 'Video thumbnail'} className="h-48 w-full object-cover" />
                  ) : (
                    <div className="flex h-48 items-center justify-center bg-[hsl(var(--color-elevated))] text-sm text-muted">Processing preview</div>
                  )}
                  <div className="space-y-3 p-4">
                    <div>
                      <p className="line-clamp-1 text-sm font-semibold text-text">{videoItem.title ?? 'Untitled video'}</p>
                      <p className="mt-1 text-xs text-muted">{videoItem.provider_name ?? videoItem.selected_model ?? 'Video job'} • {videoItem.resolution}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">{videoItem.status}</span>
                      <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">{videoItem.aspect_ratio}</span>
                      {videoItem.duration_seconds ? <span className="inline-flex rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-text">{videoItem.duration_seconds}s</span> : null}
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
