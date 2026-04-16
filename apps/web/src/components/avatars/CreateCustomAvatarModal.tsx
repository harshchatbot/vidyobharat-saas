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

const DEFAULT_SCRIPT =
    'Hi, I am your AI avatar. I can speak naturally and help you create videos for your brand.';

export default function CreateCustomAvatarModal({
    open,
    onClose,
    userId,
    uploadImage,
    onAvatarCreated,
    onPreviewCompleted,
}: Props) {
    const [name, setName] = useState('');
    const [voice, setVoice] = useState('shubh');
    const [language, setLanguage] = useState('en-IN');
    const [script, setScript] = useState(DEFAULT_SCRIPT);
    const [file, setFile] = useState<File | null>(null);

    const [imageUrl, setImageUrl] = useState('');
    const [avatarId, setAvatarId] = useState('');
    const [jobId, setJobId] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
    const [audioUrl, setAudioUrl] = useState('');
    const [status, setStatus] = useState<
        'idle' | 'uploading' | 'creating' | 'created' | 'queued' | 'processing' | 'completed' | 'failed'
    >('idle');
    const [error, setError] = useState('');

    const pollRef = useRef<number | null>(null);

    const canCreateAvatar = useMemo(() => {
        return !!name.trim() && !!file && status !== 'uploading' && status !== 'creating';
    }, [name, file, status]);

    const canGeneratePreview = useMemo(() => {
        return !!avatarId && !!script.trim() && status !== 'uploading' && status !== 'creating';
    }, [avatarId, script, status]);

    const [previewEstimatedCredits, setPreviewEstimatedCredits] = useState<number | null>(null);
    const [previewEstimateLoading, setPreviewEstimateLoading] = useState(false);

    useEffect(() => {
        if (!open || !userId) return;

        let cancelled = false;

        async function loadEstimate() {
            try {
                setPreviewEstimateLoading(true);
                const result = await api.estimateCredits(
                    'avatar_preview_generate',
                    {
                        voice,
                        language,
                        avatar_id: avatarId || null,
                    },
                    userId,
                );
                if (!cancelled) {
                    setPreviewEstimatedCredits(result.estimatedCredits);
                }
            } catch {
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
        return () => {
            if (pollRef.current) {
                window.clearInterval(pollRef.current);
                pollRef.current = null;
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
        setVoice('shubh');
        setLanguage('en-IN');
        setScript(DEFAULT_SCRIPT);
        setFile(null);
        setImageUrl('');
        setAvatarId('');
        setJobId('');
        setVideoUrl('');
        setAudioUrl('');
        setStatus('idle');
        setError('');
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

    async function handleGeneratePreview() {
        try {
            setError('');
            setVideoUrl('');
            setAudioUrl('');

            if (!avatarId) {
                throw new Error('Please create the avatar first');
            }

            const preview = await api.generateCustomAvatarPreview(
                avatarId,
                {
                    script: script.trim(),
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
                const job = await api.getCustomAvatarPreviewStatus(
                    currentAvatarId,
                    currentJobId,
                    userId,
                );

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
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
                                >
                                    <option value="shubh">Shubh</option>
                                </select>
                            </div>

                            <div>
                                <label className="mb-2 block text-sm text-white/70">Language</label>
                                <select
                                    value={language}
                                    onChange={(e) => setLanguage(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
                                >
                                    <option value="en-IN">English (India)</option>
                                    <option value="hi-IN">Hindi (India)</option>
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
                                    onChange={(e) => setScript(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"
                                />
                            </div>

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