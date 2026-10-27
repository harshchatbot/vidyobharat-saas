
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getApiUrl } from '@/lib/env';
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

    return (
        <main className="min-h-screen overflow-x-hidden bg-[#f6f4ec] px-3 py-5 text-[#071d4a] sm:px-6 sm:py-8">
            <header className="mx-auto flex max-w-5xl items-center justify-between">
                <Link href="/" className="text-lg font-bold">
                    RangManch AI
                </Link>

                <span className="text-sm">Guest editor</span>
            </header>

            <section className="mx-auto min-w-0 max-w-7xl py-5 sm:py-8">
                <div className="text-center">
                    <h1 className="text-4xl font-bold">
                        Create your reel
                    </h1>

                    <p className="mt-4 text-[#526078]">
                        Upload your favorite moments and turn them into a story.
                    </p>
                </div>

                {/* Guest session status */}
                <div
                    role="status"
                    aria-live="polite"
                    className="mt-10 rounded-xl border border-[#d9d7ce] bg-white p-6 text-center"
                >
                    <p className="font-medium">{status}</p>

                    {ready && (
                        <p className="mt-3 text-sm text-[#526078]">
                            Your media library is connected.
                        </p>
                    )}
                </div>

                {/* Visual reel editor */}
                {ready && <GuestEditorWorkspace media={media} uploadUsage={uploadUsage} />}
            </section>
        </main>
    );
}
