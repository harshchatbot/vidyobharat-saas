'use client';

import { useMemo, useState, type ChangeEvent } from 'react';
import { exportTimelineMp4, supportsBrowserMp4Export } from '@/lib/browser-ai/browserMp4Export';
import { addItem } from '@/app/editor/timeline/model';
import { createBasicText } from '@/app/editor/timeline/textTemplates';
import { createEmptyProject, type GuestMedia } from '@/app/editor/timeline/types';

export default function BrowserMp4PocPage() {
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const [title, setTitle] = useState('My First AI Video');
  const [status, setStatus] = useState('Choose exactly three images.');
  const [downloadUrl, setDownloadUrl] = useState('');
  const support = useMemo(() => supportsBrowserMp4Export(), []);

  function chooseImages(event: ChangeEvent<HTMLInputElement>) {
    setDownloadUrl('');
    const files = Array.from(event.target.files ?? []);
    if (files.length !== 3) { setImages([]); setStatus('Choose exactly three images.'); return; }
    Promise.all(files.map((file) => new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('An image could not be loaded.'));
      image.src = URL.createObjectURL(file);
    }))).then((loaded) => { setImages(loaded); setStatus('Ready for local MP4 export.'); }).catch((error) => setStatus(error instanceof Error ? error.message : 'Image loading failed.'));
  }

  async function exportVideo() {
    setDownloadUrl(''); setStatus('Rendering locally in this browser…');
    try {
      let project = createEmptyProject();
      const media: GuestMedia[] = images.map((_, index) => ({ media_id: `poc-${index}`, original_filename: `poc-${index}.png`, media_type: 'image', content_type: 'image/png', availability: 'available' }));
      images.forEach((_, index) => { project = addItem(project, { id: `clip-${index}`, kind: 'video', trackId: 'video', label: `Image ${index + 1}`, mediaId: media[index].media_id, contentType: 'image/png', startTime: index * 5, duration: 5, sourceStart: 0, cropMode: 'cover', muted: true, volume: 0 }); });
      const text = { ...createBasicText(0), id: 'poc-title', label: title.trim(), text: title.trim(), duration: 5, alignment: 'center' as const, inAnimation: 'fade-in' as const, inAnimationDuration: 2 };
      project = addItem(project, text);
      const blob = await exportTimelineMp4(project, { media, images: Object.fromEntries(images.map((image, index) => [media[index].media_id, image])) });
      setDownloadUrl(URL.createObjectURL(blob)); setStatus('MP4 ready.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Local MP4 export failed.'); }
  }

  return <main className="min-h-screen bg-[#0A0A0F] px-5 py-12 text-slate-100 sm:px-8"><div className="mx-auto max-w-3xl rounded-2xl border border-white/10 bg-[#111118] p-6"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">Development proof of concept</p><h1 className="mt-2 text-3xl font-semibold text-white">Browser MP4 Export</h1><p className="mt-2 text-sm text-slate-400">Canvas-only local export · 720p · 30 FPS · 15 seconds · no AWS rendering.</p><div className="mt-6 grid gap-4"><label className="text-sm text-slate-300">Three images<input className="mt-2 block w-full text-sm" type="file" accept="image/*" multiple onChange={chooseImages} /></label><label className="text-sm text-slate-300">Centered title<input className="mt-2 w-full rounded-lg border border-white/10 bg-black/20 p-3" value={title} onChange={(event) => setTitle(event.target.value)} /></label><div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-slate-400">MediaRecorder MP4: <span className="text-slate-200">{support.mediaRecorder ? 'available' : 'unsupported'}</span> · WebCodecs: <span className="text-slate-200">{support.webCodecs ? 'available' : 'unsupported'}</span></div><button type="button" disabled={images.length !== 3 || !support.mediaRecorder} onClick={() => void exportVideo()} className="min-h-11 rounded-lg bg-amber-400 px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40">Export MP4 locally</button><p role="status" className="text-sm text-slate-300">{status}</p>{downloadUrl && <a className="inline-flex min-h-11 items-center justify-center rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white" href={downloadUrl} download="rangmanch-browser-poc.mp4">Download MP4</a>}</div><p className="mt-6 text-xs leading-5 text-slate-500">The title fades from 0 to 100% opacity over the first 2 seconds. This POC uses canvas capture and the browser&apos;s native MP4 recorder; frame timing and text rendering may differ slightly from the production preview/export pipeline.</p></div></main>;
}
