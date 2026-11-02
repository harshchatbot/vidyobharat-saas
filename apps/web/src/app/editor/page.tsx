
'use client';

import { useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/env';
import { IndeterminateProgress, StatusTransition } from '@/components/ui/MotionPrimitives';
import { Film, Sparkles } from 'lucide-react';
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
    const [error, setError] = useState<string | null>(null);
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
                if (active) setStatus('Loading uploaded media…');

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
                    setError(
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

    return <main className="min-h-screen min-w-0 overflow-x-hidden bg-[#fff9ed] text-[#292034]">
      {ready ? <GuestEditorWorkspace media={media} uploadUsage={uploadUsage} /> : (
        <div className="relative grid min-h-screen place-items-center overflow-hidden px-5 py-10">
          <div aria-hidden="true" className="pointer-events-none absolute -left-16 top-8 h-64 w-64 rounded-full bg-[#f9dce8]/70 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-[#e9dcfa]/80 blur-3xl" />
          <section className="relative w-full max-w-xl rounded-[28px] border-2 border-[#40324b] bg-[#fffdf9] p-6 shadow-[8px_8px_0_#40324b] sm:p-8" aria-label="Preparing Rangmanch editor">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border-2 border-[#40324b] bg-[#ffdb77]"><Film aria-hidden="true" className="h-6 w-6" /></div>
              <div><p className="text-xs font-extrabold uppercase tracking-[.15em] text-[#73518f]">RangManch AI</p><h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">Your creative studio</h1></div>
              <Sparkles aria-hidden="true" className="ml-auto h-6 w-6 text-[#9b6ec1]" />
            </div>
            {error ? (
              <div className="mt-7 space-y-4">
                <StatusTransition tone="error" label="Editor could not start" detail={error} />
                <p className="text-sm text-[#64556e]">Check your connection and try again.</p>
                <button type="button" onClick={() => window.location.reload()} className="min-h-10 rounded-xl border-2 border-[#40324b] bg-[#ffdb77] px-5 text-sm font-bold">Try again</button>
              </div>
            ) : (
              <>
                <p className="mt-7 text-lg font-bold">Setting up your workspace</p>
                <p className="mt-1 text-sm text-[#64556e]">Restoring your session and getting your media ready.</p>
                <div aria-hidden="true" className="mt-6 rounded-2xl border border-[#decce5] bg-[#f6effc] p-4">
                  <div className="flex items-center justify-between"><div className="h-3 w-28 animate-pulse rounded bg-[#d2bce6] motion-reduce:animate-none" /><div className="h-5 w-14 rounded-full bg-[#ffdb77]" /></div>
                  <div className="mt-4 grid grid-cols-5 gap-2">
                    {['#f9dce8','#e9dcfa','#ffdb77','#cdebdc','#e9dcfa'].map((color,index) => <div key={index} className="aspect-[4/5] animate-pulse rounded-lg border border-[#40324b]/15 motion-reduce:animate-none" style={{ backgroundColor: color, animationDelay: `${index * 130}ms` }} />)}
                  </div>
                  <div className="mt-4 flex gap-1.5"><div className="h-2 flex-[2] rounded-full bg-[#d1ace7]" /><div className="h-2 flex-1 rounded-full bg-[#f0bed0]" /><div className="h-2 flex-[1.5] rounded-full bg-[#c7dfd4]" /></div>
                </div>
                <IndeterminateProgress label={status} className="mt-6" />
              </>
            )}
          </section>
        </div>
      )}
    </main>;
}
