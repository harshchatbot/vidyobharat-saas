
'use client';

import { useEffect, useRef, useState } from 'react';
import { CloudUpload, Film, Image as ImageIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getApiUrl } from '@/lib/env';
import styles from './PublicStudioLanding.module.css';

export function GuestUpload() {
    const inputRef = useRef<HTMLInputElement>(null);
    const [files, setFiles] = useState<File[]>([]);
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState('');
    const [uploadLimit, setUploadLimit] = useState<number | null>(null);
    const [remainingUploads, setRemainingUploads] = useState<number | null>(null);

    const router = useRouter();
    const [uploading, setUploading] = useState(false);
    const [completedUploads, setCompletedUploads] = useState(0);
    const [fileStatuses, setFileStatuses] = useState<Record<string, 'queued' | 'uploading' | 'uploaded' | 'failed'>>({});

    useEffect(() => {
        let active = true;
        const base = getApiUrl();
        void Promise.all([
            fetch(`${base}/api/editor/config`, { cache: 'no-store' }).then((response) => response.ok ? response.json() : null),
            fetch(`${base}/api/editor/guest/session`, { credentials: 'include', cache: 'no-store' }).then((response) => response.ok ? response.json() : null),
        ]).then(([config, session]) => {
            if (!active) return;
            const limit = Number(session?.usage?.limits?.uploads ?? config?.guest?.max_uploads);
            const remaining = Number(session?.usage?.remaining?.uploads ?? limit);
            if (Number.isFinite(limit)) setUploadLimit(limit);
            if (Number.isFinite(remaining)) setRemainingUploads(remaining);
        }).catch(() => undefined);
        return () => { active = false; };
    }, []);

    async function uploadFiles() {
        if (!files.length || uploading) return;

        setUploading(true);
        setError('');
        const previousStatuses = fileStatuses;
        setCompletedUploads(files.reduce((count, file, index) => count + (previousStatuses[`${file.name}-${index}`] === 'uploaded' ? 1 : 0), 0));
        setFileStatuses(Object.fromEntries(files.map((file, index) => [`${file.name}-${index}`, previousStatuses[`${file.name}-${index}`] === 'uploaded' ? 'uploaded' : 'queued'])));

        try {
            const base = getApiUrl();

            // Restore or create a guest session.
            const sessionUrl = `${base}/api/editor/guest/session`;

            let session = await fetch(sessionUrl, {
                credentials: 'include',
                cache: 'no-store',
            });

            if (session.status === 401) {
                session = await fetch(sessionUrl, {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'X-RangManch-Editor-CSRF': '1' },
                });
            }

            if (!session.ok) {
                throw new Error(`Guest session failed (${session.status})`);
            }
            const sessionBody = await session.json();
            const effectiveLimit = Number(sessionBody?.usage?.limits?.uploads);
            let effectiveRemaining = Number(sessionBody?.usage?.remaining?.uploads);
            if (Number.isFinite(effectiveLimit)) setUploadLimit(effectiveLimit);
            if (Number.isFinite(effectiveRemaining)) setRemainingUploads(effectiveRemaining);
            if (Number.isFinite(effectiveRemaining) && files.length > effectiveRemaining) {
                throw new Error(`You can upload ${effectiveRemaining} more file${effectiveRemaining === 1 ? '' : 's'} in this guest session.`);
            }

            // Upload each file individually.
            for (const [index, file] of files.entries()) {
                const fileKey = `${file.name}-${index}`;
                if (previousStatuses[fileKey] === 'uploaded') continue;
                setFileStatuses((current) => ({ ...current, [fileKey]: 'uploading' }));
                const form = new FormData();
                form.append('file', file);

                const response = await fetch(`${base}/api/editor/media/upload`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'X-RangManch-Editor-CSRF': '1',
                        'Idempotency-Key': crypto.randomUUID(),
                    },
                    body: form,
                });

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    if (body.error === 'guest_quota_exceeded') {
                        throw new Error('You have reached the upload limit for this guest session.');
                    }
                    setFileStatuses((current) => ({ ...current, [fileKey]: 'failed' }));
                    throw new Error(body.message || `Upload failed for ${file.name} (${response.status})`);
                }
                effectiveRemaining -= 1;
                setRemainingUploads(Math.max(0, effectiveRemaining));
                setCompletedUploads((count) => count + 1);
                setFileStatuses((current) => ({ ...current, [fileKey]: 'uploaded' }));
            }

            router.push('/editor');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed.');
        } finally {
            setUploading(false);
        }
    }

    function addFiles(selected: FileList | File[]) {
        const incoming = Array.from(selected);

        const valid = incoming.filter(
            (file) => file.type.startsWith('image/') ||
                file.type.startsWith('video/')
        );

        if (valid.length !== incoming.length) {
            setError('Please choose image or video files only.');
        } else {
            setError('');
        }

        setFiles((previous) => [...previous, ...valid]);
    }


    return (
        <div className={styles.uploadWorkspace}>
            <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
                multiple
                hidden
                onChange={(event) => {
                    if (event.target.files) addFiles(event.target.files);
                    event.target.value = '';
                }}
            />

            <div
                className={`${styles.uploadDropzone} ${dragging ? styles.uploadDragging : ''}`}
                onDragOver={(event) => {
                    event.preventDefault();
                    setDragging(true);
                }}
                onDragLeave={(event) => {
                    event.preventDefault();
                    setDragging(false);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setDragging(false);
                    addFiles(event.dataTransfer.files);
                }}
            >
                <div className={styles.uploadIcon}>
                    <CloudUpload size={30} />
                </div>

                <h2>Drop your photos & videos here</h2>
                <p>Or browse files from your device</p>

                <button
                    type="button"
                    className={styles.uploadButton}
                    onClick={() => inputRef.current?.click()}
                >
                    Choose files
                </button>

                <small>
                    JPG, PNG, WebP, MP4, MOV or WebM
                    {uploadLimit !== null && ` · ${remainingUploads ?? uploadLimit} of ${uploadLimit} uploads remaining`}
                </small>
            </div>

            {error && <div role="alert" className={styles.uploadError}><p>{error}</p><button type="button" onClick={() => void uploadFiles()} disabled={uploading}>Retry upload</button></div>}

            {files.length > 0 && (
                <div className={styles.selectedFiles}>
                    <div className={styles.selectedFilesHeader}>
                        <strong>Selected media ({files.length})</strong>
                        <button type="button" onClick={() => setFiles([])}>
                            Clear all
                        </button>
                    </div>

                    {files.map((file, index) => (
                        <div key={`${file.name}-${index}`} className={styles.selectedFile}>
                            {file.type.startsWith('video/')
                                ? <Film size={18} />
                                : <ImageIcon size={18} />}
                            <span>{file.name}</span>
                            <small>{fileStatuses[`${file.name}-${index}`] === 'uploaded' ? 'Uploaded' : fileStatuses[`${file.name}-${index}`] === 'uploading' ? 'Uploading…' : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</small>
                        </div>
                    ))}

                    <button
                        type="button"
                        className={styles.uploadButton}
                        disabled={uploading}
                        onClick={uploadFiles}
                    >
                        {uploading ? `Uploading ${completedUploads}/${files.length}` : 'Continue to editor'}
                    </button>
                </div>
            )}
        </div>
    );
}
