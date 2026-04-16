'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { api } from '@/lib/api';

type Props = {
    open: boolean;
    onClose: () => void;
    userId: string;
    uploadImage: (file: File) => Promise<{
        publicUrl: string;
    }>;
    onAvatarCreated?: (avatar: {
        avatarId: string;
        name: string;
        imageUrl: string;
        preferredVoice: string;
    }) => void;
    onPreviewCompleted?: (preview: {
        avatarId: string;
        videoUrl: string;
        audioUrl?: string | null;
    }) => void;
};

type CatalogVoiceOption = {
    value: string;
    label: string;
    supportedLanguageCodes: string[];
    isFree: boolean;
};

type CatalogLanguageOption = {
    value: string;
    label: string;
};

const DEFAULT_SCRIPT =
    'Hi, I am your AI avatar. I can speak naturally and help you create videos for your brand.';

const FREE_VOICE_KEYS = new Set(['Aarav', 'Mira', 'Dev', 'Shubh', 'Priya']);

function resolveBackendAssetUrl(url: string) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    return `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}${url}`;
}

export default function CreateCustomAvatarModal({
    open,
    onClose,
    userId,
    uploadImage,
    onAvatarCreated,
    onPreviewCompleted,
}: Props) {
    const [name, setName] = useState('');
    const [voice, setVoice] = useState('');
    const [language, setLanguage] = useState('');
    const [script, setScript] = useState(DEFAULT_SCRIPT);
    const [file, setFile] = useState<File | null>(null);

    const [voiceOptions, setVoiceOptions] = useState<CatalogVoiceOption[]>([]);
    const [languageOptions, setLanguageOptions] = useState<CatalogLanguageOption[]>([]);
    const [ttsCatalogLoading, setTtsCatalogLoading] = useState(false);

    const [imageUrl, setImageUrl] = useState('');
    const [avatarId, setAvatarId] = useState('');
    const [jobId, setJobId] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [audioUrl, setAudioUrl] = useState('');
    const [status, setStatus] = useState<
        'idle' | 'uploading' | 'creating' | 'created' | 'queued' | 'processing' | 'completed' | 'failed'
    >('idle');
    const [error, setError] = useState('');

    const [previewEstimatedCredits, setPreviewEstimatedCredits] = useState<number | null>(null);
    const [previewEstimateLoading, setPreviewEstimateLoading] = useState(false);

    const [voicePreviewUrl, setVoicePreviewUrl] = useState('');
    const [voicePreviewLoading, setVoicePreviewLoading] = useState(false);
    const [voicePreviewError, setVoicePreviewError] = useState('');

    const [translatingScript, setTranslatingScript] = useState(false);
    const [translationMessage, setTranslationMessage] = useState('');

    const originalScriptRef = useRef(DEFAULT_SCRIPT);
    const autoTranslateTimeoutRef = useRef<number | null>(null);
    const isApplyingAutoTranslationRef = useRef(false);
    const pollRef = useRef<number | null>(null);

    const canCreateAvatar = useMemo(() => {
        return !!name.trim() && !!file && status !== 'uploading' && status !== 'creating';
    }, [name, file, status]);

    const canGeneratePreview = useMemo(() => {
        return !!avatarId && !!script.trim() && status !== 'uploading' && status !== 'creating';
    }, [avatarId, script, status]);

    const selectedVoiceOption = useMemo(() => {
        return voiceOptions.find((item) => item.value === voice) || null;
    }, [voiceOptions, voice]);

    const filteredLanguageOptions = useMemo(() => {
        if (!selectedVoiceOption) return languageOptions;
        if (!selectedVoiceOption.supportedLanguageCodes.length) return languageOptions;

        return languageOptions.filter((lang) =>
            selectedVoiceOption.supportedLanguageCodes.includes(lang.value),
        );
    }, [languageOptions, selectedVoiceOption]);

    const isSelectedVoiceFree = useMemo(() => {
        return !!selectedVoiceOption?.isFree;
    }, [selectedVoiceOption]);

    const voicePreviewCostLabel = useMemo(() => {
        return isSelectedVoiceFree ? 'Free' : '2 credits';
    }, [isSelectedVoiceFree]);

    const selectedLanguageLabel = useMemo(() => {
        return languageOptions.find((option) => option.value === language)?.label ?? language;
    }, [languageOptions, language]);

    useEffect(() => {
        if (!open || !userId) return;

        let cancelled = false;

        async function loadTtsCatalog() {
            try {
                setTtsCatalogLoading(true);

                const catalog = await api.getTtsCatalog(userId);

                if (cancelled) return;

                const voices = Array.isArray(catalog?.voices)
                    ? catalog.voices
                          .map(
                              (item: {
                                  key?: string;
                                  label?: string;
                                  supported_language_codes?: string[];
                              }) => {
                                  const voiceKey = item.key || '';
                                  const voiceLabel = item.label || item.key || 'Unknown voice';
                                  const isFree =
                                      FREE_VOICE_KEYS.has(voiceLabel) || FREE_VOICE_KEYS.has(voiceKey);

                                  return {
                                      value: voiceKey,
                                      label: voiceLabel,
                                      supportedLanguageCodes: Array.isArray(item.supported_language_codes)
                                          ? item.supported_language_codes
                                          : [],
                                      isFree,
                                  };
                              },
                          )
                          .filter((item: CatalogVoiceOption) => item.value)
                    : [];

                const languages = Array.isArray(catalog?.languages)
                    ? catalog.languages
                          .map((item: { code?: string; value?: string; label?: string; name?: string }) => ({
                              value: item.code || item.value || '',
                              label: item.label || item.name || item.code || item.value || 'Unknown language',
                          }))
                          .filter((item: CatalogLanguageOption) => item.value)
                    : [];

                setVoiceOptions(voices);
                setLanguageOptions(languages);

                const defaultVoice =
                    voices.find((item) => item.value.toLowerCase() === 'shubh') || voices[0] || null;

                setVoice(defaultVoice?.value || '');

                const possibleLanguages =
                    defaultVoice?.supportedLanguageCodes?.length
                        ? languages.filter((lang) =>
                              defaultVoice.supportedLanguageCodes.includes(lang.value),
                          )
                        : languages;

                const defaultLanguage =
                    possibleLanguages.find((item) => item.value === 'en-IN') ||
                    possibleLanguages.find((item) => item.value === 'hi-IN') ||
                    possibleLanguages[0] ||
                    null;

                setLanguage(defaultLanguage?.value || '');
            } catch (loadError) {
                if (!cancelled) {
                    console.error('Failed to load TTS catalog', loadError);
                    setVoiceOptions([
                        {
                            value: 'shubh',
                            label: 'Shubh',
                            supportedLanguageCodes: ['en-IN', 'hi-IN'],
                            isFree: true,
                        },
                    ]);
                    setLanguageOptions([
                        { value: 'en-IN', label: 'English (India)' },
                        { value: 'hi-IN', label: 'Hindi (India)' },
                    ]);
                    setVoice('shubh');
                    setLanguage('en-IN');
                }
            } finally {
                if (!cancelled) {
                    setTtsCatalogLoading(false);
                }
            }
        }

        void loadTtsCatalog();

        return () => {
            cancelled = true;
        };
    }, [open, userId]);

    useEffect(() => {
        if (!selectedVoiceOption) return;
        if (!filteredLanguageOptions.length) return;

        const stillValid = filteredLanguageOptions.some((item) => item.value === language);
        if (!stillValid) {
            setLanguage(filteredLanguageOptions[0].value);
        }
    }, [voice, language, selectedVoiceOption, filteredLanguageOptions]);

    useEffect(() => {
        if (!open || !userId || !voice || !language) return;

        let cancelled = false;

        async function loadEstimate() {
            try {
                setPreviewEstimateLoading(true);

                const estimatePayload: Record<string, unknown> = {
                    voice,
                    language,
                };

                if (avatarId) {
                    estimatePayload.avatar_id = avatarId;
                }

                const result = await api.estimateCredits(
                    'avatar_preview_generate',
                    estimatePayload,
                    userId,
                );

                if (!cancelled) {
                    setPreviewEstimatedCredits(
                        typeof result?.estimatedCredits === 'number' ? result.estimatedCredits : null,
                    );
                }
            } catch (estimateError) {
                console.error('Failed to estimate avatar preview credits', estimateError);
                if (!cancelled) {
                    setPreviewEstimatedCredits(null);
                }
            } finally {
                if (!cancelled) {
                    setPreviewEstimateLoading(false);
                }
            }
        }

        void loadEstimate();

        return () => {
            cancelled = true;
        };
    }, [open, userId, voice, language, avatarId]);

    useEffect(() => {
        if (!open || !userId || !language) return;

        if (autoTranslateTimeoutRef.current) {
            window.clearTimeout(autoTranslateTimeoutRef.current);
            autoTranslateTimeoutRef.current = null;
        }

        const baseScript = originalScriptRef.current?.trim();
        if (!baseScript) return;

        if (language === 'en-IN') {
            isApplyingAutoTranslationRef.current = true;
            setScript(originalScriptRef.current);
            setTranslationMessage('');
            queueMicrotask(() => {
                isApplyingAutoTranslationRef.current = false;
            });
            return;
        }

        autoTranslateTimeoutRef.current = window.setTimeout(async () => {
            try {
                setTranslatingScript(true);
                setTranslationMessage('');

                const result = await api.translateScriptText(
                    {
                        text: originalScriptRef.current,
                        target_language: selectedLanguageLabel,
                    },
                    userId,
                );

                const translatedText = (result?.text || '').trim();
                if (!translatedText) {
                    throw new Error('Translation returned empty text.');
                }

                isApplyingAutoTranslationRef.current = true;
                setScript(translatedText);
                setTranslationMessage(`Auto-translated to ${selectedLanguageLabel}`);
            } catch (err) {
                const message =
                    err instanceof Error
                        ? err.message
                        : `Auto-translation failed. Please enter ${selectedLanguageLabel} text manually.`;
                setTranslationMessage(message);
            } finally {
                setTranslatingScript(false);
                queueMicrotask(() => {
                    isApplyingAutoTranslationRef.current = false;
                });
            }
        }, 350);

        return () => {
            if (autoTranslateTimeoutRef.current) {
                window.clearTimeout(autoTranslateTimeoutRef.current);
                autoTranslateTimeoutRef.current = null;
            }
        };
    }, [language, selectedLanguageLabel, open, userId]);

    useEffect(() => {
        return () => {
            if (pollRef.current) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
            }
            if (autoTranslateTimeoutRef.current) {
                window.clearTimeout(autoTranslateTimeoutRef.current);
                autoTranslateTimeoutRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!open && pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, [open]);

    function resetLocalState() {
        setName('');
        setVoice('');
        setLanguage('');
        setScript(DEFAULT_SCRIPT);
        setFile(null);
        setImageUrl('');
        setAvatarId('');
        setJobId('');
        setVideoUrl('');
        setAudioUrl('');
        setStatus('idle');
        setError('');
        setPreviewEstimatedCredits(null);
        setVoicePreviewUrl('');
        setVoicePreviewError('');
        setTranslationMessage('');
        originalScriptRef.current = DEFAULT_SCRIPT;
    }

    function handleClose() {
        if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }
        resetLocalState();
        onClose();
    }

    async function handleCreateAvatar() {
        try {
            setError('');
            setStatus('uploading');

            if (!file) {
                throw new Error('Please upload an image');
            }

            const uploaded = await uploadImage(file);
            const uploadedImageUrl = uploaded.publicUrl;
            setImageUrl(uploadedImageUrl);

            setStatus('creating');

            const avatar = await api.createCustomAvatar(
                {
                    name: name.trim(),
                    reference_image_url: uploadedImageUrl,
                    preferred_voice: voice,
                },
                userId,
            );

            setAvatarId(avatar.avatar_id);
            setStatus('created');

            onAvatarCreated?.({
                avatarId: avatar.avatar_id,
                name: avatar.name,
                imageUrl: avatar.reference_image_url,
                preferredVoice: avatar.preferred_voice,
            });
        } catch (err) {
            setStatus('failed');
            setError(err instanceof Error ? err.message : 'Failed to create avatar');
        }
    }

    async function handlePreviewVoice() {
        try {
            const sourceText = script.trim();

            if (!sourceText || sourceText.length < 3) {
                setVoicePreviewError('Please enter a longer preview script.');
                setVoicePreviewUrl('');
                return;
            }

            setVoicePreviewLoading(true);
            setVoicePreviewError('');
            setVoicePreviewUrl('');

            const result = await api.previewTts(
                {
                    text: sourceText,
                    voice,
                    language,
                    sample_rate_hz: 22050,
                },
                userId,
            );

            setVoicePreviewUrl(resolveBackendAssetUrl(result.preview_url || ''));
        } catch (err) {
            setVoicePreviewError(err instanceof Error ? err.message : 'Failed to preview voice');
        } finally {
            setVoicePreviewLoading(false);
        }
    }

    async function handleGeneratePreview() {
        try {
            setError('');
            setVideoUrl('');
            setAudioUrl('');

            if (!avatarId) {
                throw new Error('Please create the avatar first');
            }

            const sourceText = script.trim();
            if (!sourceText) {
                throw new Error('Please enter a preview script');
            }

            const preview = await api.generateCustomAvatarPreview(
                avatarId,
                {
                    script: sourceText,
                    voice,
                    language,
                },
                userId,
            );

            setJobId(preview.job_id);
            setStatus('queued');

            startPolling(avatarId, preview.job_id);
        } catch (err) {
            setStatus('failed');
            setError(err instanceof Error ? err.message : 'Failed to generate preview');
        }
    }

    function startPolling(currentAvatarId: string, currentJobId: string) {
        if (pollRef.current) {
            window.clearInterval(pollRef.current);
            pollRef.current = null;
        }

        pollRef.current = window.setInterval(async () => {
            try {
                const job = await api.getCustomAvatarPreviewStatus(currentAvatarId, currentJobId, userId);

                if (job.status === 'queued') {
                    setStatus('queued');
                    return;
                }

                if (job.status === 'processing') {
                    setStatus('processing');
                    return;
                }

                if (job.status === 'completed') {
                    setStatus('completed');
                    setVideoUrl(job.video_url || '');
                    setAudioUrl(job.audio_url || '');

                    if (pollRef.current) {
                        window.clearInterval(pollRef.current);
                        pollRef.current = null;
                    }

                    if (job.video_url) {
                        onPreviewCompleted?.({
                            avatarId: currentAvatarId,
                            videoUrl: job.video_url,
                            audioUrl: job.audio_url,
                        });
                    }
                    return;
                }

                if (job.status === 'failed') {
                    setStatus('failed');
                    setError(job.error_message || 'Preview generation failed');

                    if (pollRef.current) {
                        window.clearInterval(pollRef.current);
                        pollRef.current = null;
                    }
                }
            } catch (err) {
                setStatus('failed');
                setError(err instanceof Error ? err.message : 'Failed while polling preview status');

                if (pollRef.current) {
                    window.clearInterval(pollRef.current);
                    pollRef.current = null;
                }
            }
        }, 3000);
    }

    if (!open) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm">
            <div className="mx-auto flex min-h-screen max-w-3xl items-center justify-center p-4">
                <div className="w-full rounded-3xl border border-white/10 bg-[#0f0f10] p-6 shadow-2xl">
                    <div className="mb-5 flex items-start justify-between gap-4">
                        <div>
                            <h2 className="text-xl font-semibold text-white">Create Your Own Avatar</h2>
                            <p className="mt-1 text-sm text-white/60">
                                Upload one clear face image, save the avatar, and generate a short talking preview.
                            </p>
                        </div>

                        <button
                            onClick={handleClose}
                            className="rounded-xl border border-white/10 px-3 py-2 text-sm text-white/70 hover:bg-white/5"
                        >
                            Close
                        </button>
                    </div>

                    <div className="grid gap-6 md:grid-cols-2">
                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm text-white/70">Avatar name</label>
                                <input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Enter avatar name"
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-white/70">Upload photo</label>
                                <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp"
                                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white"
                                />
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-white/70">Voice</label>
                                <select
                                    value={voice}
                                    onChange={(e) => setVoice(e.target.value)}
                                    disabled={ttsCatalogLoading || voiceOptions.length === 0}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none disabled:opacity-50"
                                >
                                    {ttsCatalogLoading ? (
                                        <option value="">Loading voices...</option>
                                    ) : voiceOptions.length === 0 ? (
                                        <option value="">No voices available</option>
                                    ) : (
                                        voiceOptions.map((item) => (
                                            <option key={item.value} value={item.value}>
                                                {item.label} {item.isFree ? '— Free' : '— Premium'}
                                            </option>
                                        ))
                                    )}
                                </select>
                                <div className="mt-2 text-xs text-white/50">
                                    {isSelectedVoiceFree
                                        ? 'This voice preview is free.'
                                        : 'Premium voice preview costs 2 credits when uncached.'}
                                </div>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-white/70">Language</label>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    disabled={ttsCatalogLoading || filteredLanguageOptions.length === 0}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none disabled:opacity-50"
                                >
                                    {ttsCatalogLoading ? (
                                        <option value="">Loading languages...</option>
                                    ) : filteredLanguageOptions.length === 0 ? (
                                        <option value="">No languages available</option>
                                    ) : (
                                        filteredLanguageOptions.map((item) => (
                                            <option key={item.value} value={item.value}>
                                                {item.label}
                                            </option>
                                        ))
                                    )}
                                </select>
                            </div>

                            <button
                                onClick={handleCreateAvatar}
                                disabled={!canCreateAvatar}
                                className="w-full rounded-2xl bg-white px-4 py-3 font-medium text-black disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {status === 'uploading' || status === 'creating' ? 'Creating avatar...' : 'Create avatar'}
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="mb-2 block text-sm text-white/70">Preview script</label>
                                <textarea
                                    rows={7}
                                    value={script}
                                    onChange={(e) => {
                                        const nextValue = e.target.value;
                                        setScript(nextValue);

                                        if (!isApplyingAutoTranslationRef.current) {
                                            if (language === 'en-IN') {
                                                originalScriptRef.current = nextValue;
                                            } else if (!originalScriptRef.current?.trim()) {
                                                originalScriptRef.current = nextValue;
                                            }
                                        }
                                    }}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
                                />
                                <p className="mt-2 text-xs text-white/50">
                                    {translatingScript
                                        ? `Auto-translating to ${selectedLanguageLabel}...`
                                        : translationMessage || 'Script will auto-translate when you change language.'}
                                </p>
                            </div>

                            <button
                                type="button"
                                onClick={handlePreviewVoice}
                                disabled={!voice || !language || voicePreviewLoading}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {voicePreviewLoading
                                    ? 'Generating voice preview...'
                                    : `Preview voice (${voicePreviewCostLabel})`}
                            </button>

                            {voicePreviewUrl ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                    <div className="mb-2 text-sm text-white/70">Voice preview</div>
                                    <audio controls className="w-full">
                                        <source src={voicePreviewUrl} />
                                    </audio>
                                </div>
                            ) : null}

                            {voicePreviewError ? (
                                <div className="text-sm text-red-400">{voicePreviewError}</div>
                            ) : null}

                            <button
                                onClick={handleGeneratePreview}
                                disabled={!canGeneratePreview}
                                className="w-full rounded-2xl bg-indigo-500 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {status === 'queued' || status === 'processing'
                                    ? 'Generating preview...'
                                    : 'Generate preview'}
                            </button>

                            <div className="text-sm text-white/70">
                                {previewEstimateLoading
                                    ? 'Estimating credits...'
                                    : previewEstimatedCredits !== null
                                      ? `Estimated cost: ${previewEstimatedCredits} credits`
                                      : 'Estimated cost unavailable'}
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                                <div>Status: {status}</div>
                                {avatarId ? <div className="mt-1 break-all">Avatar ID: {avatarId}</div> : null}
                                {jobId ? <div className="mt-1 break-all">Job ID: {jobId}</div> : null}
                                {error ? <div className="mt-3 text-red-400">{error}</div> : null}
                            </div>
                        </div>
                    </div>

                    {(imageUrl || videoUrl) && (
                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            {imageUrl ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                    <div className="mb-2 text-sm text-white/70">Uploaded image</div>
                                    <img
                                        src={imageUrl}
                                        alt="Avatar source"
                                        className="h-72 w-full rounded-xl bg-black object-contain"
                                    />
                                </div>
                            ) : null}

                            {videoUrl ? (
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                    <div className="mb-2 text-sm text-white/70">Generated preview</div>
                                    <video
                                        src={videoUrl}
                                        controls
                                        className="h-72 w-full rounded-xl bg-black object-contain"
                                    />
                                    {audioUrl ? (
                                        <a
                                            href={audioUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-3 inline-block text-sm text-indigo-300"
                                        >
                                            Open audio track
                                        </a>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}