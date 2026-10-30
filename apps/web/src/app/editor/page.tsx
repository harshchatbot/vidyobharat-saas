
'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/env';
import { IndeterminateProgress, MotionReveal, StatusTransition } from '@/components/ui/MotionPrimitives';
import { GuestEditorWorkspace } from './GuestEditorWorkspace';

type GuestMedia = {
    media_id: string;
    original_filename: string;
    media_type: 'image' | 'video' | 'audio';
    content_type: string;
    duration_seconds?: number | null;
};

type UploadUsage = { limits: { uploads: number }; remaining: { uploads: number } };

export default function GuestEditorPage() {
    const [status, setStatus] = useState('Connecting to editor...');
    const [ready, setReady] = useState(false);
    const [media, setMedia] = useState<GuestMedia[]>([]);
    const [uploadUsage, setUploadUsage] = useState<UploadUsage | null>(null);

    useEffect(() => {
        let active = true;

        async function initialize() {
            try {
                const base = getApiUrl();
                const sessionUrl = `${base}/api/editor/guest/session`;

                // Step 1: Restore the existing guest session.
                let response = await fetch(sessionUrl, {
                    method: 'GET',
                    credentials: 'include',
                    cache: 'no-store',
                });

                // Step 2: Create a guest session if none exists.
                if (response.status === 401) {
                    response = await fetch(sessionUrl, {
                        method: 'POST',
                        credentials: 'include',
                        cache: 'no-store',
                        headers: {
                            'X-RangManch-Editor-CSRF': '1',
                        },
                    });
                }

                if (!response.ok) {
                    throw new Error(
                        `Session request failed (${response.status})`
                    );
                }
                const sessionData = await response.json();

                // Step 3: Retrieve media uploaded by this guest.
                const mediaResponse = await fetch(
                    `${base}/api/editor/media`,
                    {
                        method: 'GET',
                        credentials: 'include',
                        cache: 'no-store',
                    }
                );

                if (!mediaResponse.ok) {
                    throw new Error(
                        `Media request failed (${mediaResponse.status})`
                    );
                }

                const data = await mediaResponse.json();

                if (active) {
                    setMedia(data.items ?? []);
                    setUploadUsage(sessionData.usage ?? null);
                    setReady(true);
                    setStatus('Guest editor ready');
                }
            } catch (error) {
                if (active) {
                    setReady(false);
                    setStatus(
                        error instanceof Error
                            ? error.message
                            : 'Connection failed'
                    );
                }
            }
        }

        void initialize();

        return () => {
            active = false;
        };
    }, []);

    const failed = !ready && !status.includes('Connecting');
    return <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#0a0a0f] text-slate-100">
        {ready ? <GuestEditorWorkspace media={media} uploadUsage={uploadUsage} /> : <div className="grid min-h-screen place-items-center px-6"><MotionReveal className="w-full max-w-sm"><div className="rounded-2xl border border-white/10 bg-[#111118] p-6 shadow-2xl shadow-black/30">{failed ? <StatusTransition tone="error" label="Editor could not start" detail={status} /> : <><p className="text-sm font-semibold text-white">Preparing your editing workspace</p><p className="mt-2 text-xs leading-5 text-slate-400">Restoring your private guest session and uploaded media.</p><IndeterminateProgress label={status} className="mt-5" /><div aria-hidden="true" className="mt-5 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-white/[0.07] motion-reduce:animate-none" /><div className="h-3 w-1/2 animate-pulse rounded bg-white/[0.05] motion-reduce:animate-none" /></div></>}</div></MotionReveal></div>}
    </main>;
}
