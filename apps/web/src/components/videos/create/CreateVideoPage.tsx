'use client';

import { useEffect, useRef, useState } from 'react';
import { Clapperboard, Film, Mic2, Settings2, Sparkles, Wand2 } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { API_URL } from '@/lib/env';
import type { AIVideoModel, AIVideoStatusResponse, GeneratedImage, MusicTrack, Video } from '@/types/api';

import { FALLBACK_VIDEO_MODELS, TEMPLATE_OPTIONS } from './constants';
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
const VOICE_PREVIEW_CONFIG: Record<string, { pitch: number; rate: number; keywords: string[] }> = {
  Aarav: { pitch: 0.92, rate: 0.95, keywords: ['male', 'aarav', 'ravi', 'aditya', 'prabhat'] },
  Anaya: { pitch: 1.14, rate: 1.03, keywords: ['female', 'anaya', 'heera', 'aditi', 'samantha'] },
  Dev: { pitch: 0.74, rate: 0.86, keywords: ['male', 'dev', 'daniel', 'alex', 'deep'] },
  Mira: { pitch: 1.01, rate: 0.9, keywords: ['female', 'mira', 'victoria', 'zira', 'calm'] },
};

function sanitizeTags(tags: string[]) {
  return Array.from(new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean)));
}

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
  const lastTaggedScriptRef = useRef('');
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([]);

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
  const [voice, setVoice] = useState('Aarav');
  const [voicePreviewing, setVoicePreviewing] = useState(false);

  const [models, setModels] = useState<AIVideoModel[]>(FALLBACK_VIDEO_MODELS);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelKey, setModelKey] = useState<'sora2' | 'veo3'>('sora2');

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
  const [durationMode, setDurationMode] = useState<'auto' | 'custom'>('auto');
  const [durationSeconds, setDurationSeconds] = useState('12');
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionStyle, setCaptionStyle] = useState('Classic');

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState<Video | null>(null);
  const [jobStatus, setJobStatus] = useState<AIVideoStatusResponse | null>(null);
  const [jobResponseId, setJobResponseId] = useState<string | null>(null);

  const template = TEMPLATE_OPTIONS.find((item) => item.key === selectedTemplate) ?? TEMPLATE_OPTIONS[0];
  const visibleTemplates = TEMPLATE_OPTIONS.filter((item) => {
    const query = templateSearch.trim().toLowerCase();
    if (!query) return true;
    return `${item.label} ${item.description}`.toLowerCase().includes(query);
  });
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null;
  const selectedModel = models.find((model) => model.key === modelKey) ?? models[0];
  const estimatedSeconds = durationMode === 'custom' ? Math.max(5, Math.min(300, Number(durationSeconds) || 12)) : 12;
  const estimatedCredits = modelKey === 'sora2' ? Math.max(16, estimatedSeconds * (resolution === '1080p' ? 3 : 2)) : Math.max(12, estimatedSeconds * (resolution === '1080p' ? 2 : 1));
  const estimatedTime = modelKey === 'sora2' ? '2-4 min' : '1-3 min';
  const durationError = durationMode === 'custom' && (!Number.isFinite(Number(durationSeconds)) || Number(durationSeconds) < 5 || Number(durationSeconds) > 300)
    ? 'Enter a duration between 5 and 300 seconds.'
    : null;

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    const loadVoices = () => {
      availableVoicesRef.current = window.speechSynthesis.getVoices();
    };
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setModelsLoading(true);
    void Promise.all([
      api.listAIVideoModels(userId).catch(() => FALLBACK_VIDEO_MODELS),
      api.listGeneratedImages(userId).catch(() => []),
    ]).then(([videoModels, userImages]) => {
      if (cancelled) return;
      setModels(videoModels.length > 0 ? videoModels : FALLBACK_VIDEO_MODELS);
      setGeneratedImages(userImages);
      if (videoModels.length > 0 && !videoModels.some((item) => item.key === modelKey)) {
        setModelKey((videoModels[0].key as 'sora2' | 'veo3') ?? 'sora2');
      }
    }).finally(() => {
      if (!cancelled) setModelsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      if (typeof parsed.modelKey === 'string') setModelKey(parsed.modelKey as 'sora2' | 'veo3');
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
    if (!jobResponseId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await api.getAIVideoStatus(jobResponseId, userId);
        if (cancelled) return;
        setJobStatus(status);
        if (status.status === 'success') {
          const fullVideo = await api.getVideo(jobResponseId, userId);
          if (!cancelled) setJob(fullVideo);
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

  const previewVoice = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setSubmitError('Voice preview is not supported in this browser.');
      return;
    }
    if (voicePreviewing) {
      window.speechSynthesis.cancel();
      setVoicePreviewing(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(script.trim() || topic.trim() || 'RangManch AI voice preview');
    const voiceConfig = VOICE_PREVIEW_CONFIG[voice] ?? VOICE_PREVIEW_CONFIG.Aarav;
    const preferredLang = language === 'Hindi' ? 'hi-IN' : 'en-IN';
    const voices = availableVoicesRef.current;
    const matchingVoice =
      voices.find((item) =>
        item.lang.toLowerCase().startsWith(preferredLang.toLowerCase()) &&
        voiceConfig.keywords.some((keyword) => item.name.toLowerCase().includes(keyword)),
      ) ??
      voices.find((item) => voiceConfig.keywords.some((keyword) => item.name.toLowerCase().includes(keyword))) ??
      voices.find((item) => item.lang.toLowerCase().startsWith(preferredLang.toLowerCase()));

    utterance.lang = matchingVoice?.lang ?? preferredLang;
    utterance.voice = matchingVoice ?? null;
    utterance.pitch = voiceConfig.pitch;
    utterance.rate = voiceConfig.rate;
    utterance.onend = () => setVoicePreviewing(false);
    utterance.onerror = () => setVoicePreviewing(false);
    setVoicePreviewing(true);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
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
        },
        aspectRatio,
        resolution,
        durationMode,
        durationSeconds: durationMode === 'custom' ? Number(durationSeconds) : undefined,
        captionsEnabled,
        captionStyle: captionStyle.toLowerCase(),
      }, userId);
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

  return (
    <div className="mx-auto max-w-5xl space-y-6">
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
        <ModelDropdown models={models} selectedModel={modelKey} onChange={(value) => setModelKey(value as 'sora2' | 'veo3')} />
      </SectionCard>

      <SectionCard
        title="Voice & Language"
        description="Pick the narration language and voice personality."
        icon={<Mic2 className="h-5 w-5" />}
      >
        <VoiceSelector
          language={language}
          onLanguageChange={setLanguage}
          voice={voice}
          onVoiceChange={setVoice}
          onPreview={previewVoice}
          previewing={voicePreviewing}
        />
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
          aspectRatio={aspectRatio}
          onAspectRatioChange={setAspectRatio}
          resolution={resolution}
          onResolutionChange={setResolution}
          durationMode={durationMode}
          onDurationModeChange={setDurationMode}
          durationSeconds={durationSeconds}
          onDurationSecondsChange={setDurationSeconds}
          captionsEnabled={captionsEnabled}
          onCaptionsEnabledChange={setCaptionsEnabled}
          captionStyle={captionStyle}
          onCaptionStyleChange={setCaptionStyle}
          durationError={durationError}
        />
      </SectionCard>

      <GenerateButton onClick={() => void submit()} loading={submitting} estimatedCredits={estimatedCredits} estimatedTime={estimatedTime} disabled={Boolean(durationError)} />

      {submitError ? (
        <Card>
          <p className="text-sm text-[hsl(var(--color-danger))]">{submitError}</p>
        </Card>
      ) : null}

      <VideoPreview
        job={job}
        loading={submitting || jobStatus?.status === 'queued' || jobStatus?.status === 'processing'}
        error={submitError ?? (jobStatus?.status === 'failed' ? jobStatus.errorMessage ?? 'Generation failed.' : null)}
        onRetry={retry}
      />
    </div>
  );
}
