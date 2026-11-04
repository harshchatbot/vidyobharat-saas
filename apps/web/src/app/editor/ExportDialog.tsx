'use client';

import { Download, LoaderCircle, Film, X } from 'lucide-react';
import { browserExportDimensions } from '@/lib/browser-ai/browserMp4Export';
import type { ReactNode } from 'react';
import { exportDimensions, normalizeExportFilename } from './timeline/serialization';
import type { ProjectAspectRatio, ProjectExportSettings } from './timeline/types';

export type ExportJobView = {
  job_id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'expired';
  progress_stage: string; output?: { filename?: string; width?: number; height?: number; fps?: number; file_size?: number } | null;
  message?: string | null;
  retryable?: boolean;
};

type Props = {
  open: boolean; signedIn: boolean; aspectRatio: ProjectAspectRatio; settings: ProjectExportSettings;
  job: ExportJobView | null; submitting: boolean; error: string;
  onClose: () => void; onAspectRatio: (value: ProjectAspectRatio) => void;
  onSettings: (value: ProjectExportSettings) => void; onExport: () => void; onRetry: () => void; onCancel: () => void;
  onEditStart: (key: string) => void; onEditEnd: (key: string) => void;
  downloadUrl?: string;

  exportUsage?: {
    remaining: { exports: number };
    limits: { exports: number };
  } | null;
};

const ratios: ProjectAspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

export function ExportDialog(props: Props) {
  if (!props.open) return null;
  const busy = props.submitting || props.job?.status === 'queued' || props.job?.status === 'running';
  const browserFallback = process.env.NEXT_PUBLIC_EDITOR_BROWSER_EXPORT_FALLBACK === 'true';
  const dimensions = browserFallback
    ? browserExportDimensions(props.aspectRatio, props.settings.resolution)
    : exportDimensions(props.aspectRatio, '720p');
  const update = <K extends keyof ProjectExportSettings>(key: K, value: ProjectExportSettings[K]) => props.onSettings({ ...props.settings, [key]: value });
  return <div className="fixed inset-0 z-[170] grid place-items-center bg-[#2b1b3a]/65 p-3 backdrop-blur-md" onPointerDown={props.onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="export-title" className="w-full max-w-2xl overflow-hidden rounded-[28px] border-2 border-[#4d365d] bg-[#fffaf0] text-[#2b2035] shadow-[8px_8px_0_#3f2a50,0_24px_80px_rgba(30,14,40,0.35)]" onPointerDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b-2 border-[#4d365d] bg-[#ffda78] px-5 py-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-2xl border-2 border-[#4d365d] bg-[#e9d5fa] text-[#483052] shadow-[3px_3px_0_#4d365d]"><Film className="h-5 w-5" /></div><div><h2 id="export-title" className="font-heading text-xl font-extrabold tracking-tight">Export your creation</h2><p className="mt-1 text-xs font-medium text-[#5f4967]">Your video is ready for the spotlight</p></div></div><button type="button" onClick={props.onClose} className="grid h-10 w-10 place-items-center rounded-xl text-[#4d365d] hover:bg-[#fff2bb]" aria-label="Close export settings"><X className="h-4 w-4" /></button></header>
      <div className="grid max-h-[60vh] gap-5 overflow-y-auto bg-[#fffaf0] p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-2 block text-xs font-bold text-[#483052]">Name your masterpiece</span><input value={props.settings.filename} maxLength={80} onFocus={() => props.onEditStart('export:filename')} onBlur={() => props.onEditEnd('export:filename')} onChange={(event) => update('filename', event.target.value)} disabled={busy} className="h-11 w-full rounded-xl border-2 border-[#cdb7d6] bg-white px-3 text-sm text-[#30223c] outline-none focus:border-[#8e63a8] focus:ring-2 focus:ring-[#e4cff5] disabled:opacity-60" /></label>
        <Field label="Aspect ratio"><OptionGrid values={ratios} value={props.aspectRatio} onChange={(value) => props.onAspectRatio(value as ProjectAspectRatio)} disabled={busy} /></Field>
        <Field label="Resolution"><OptionGrid values={browserFallback ? ["720p", "1080p"] : ["720p"]} value={browserFallback ? props.settings.resolution : '720p'} onChange={(value) => update("resolution", value as ProjectExportSettings["resolution"])} disabled={busy} /></Field>
        <Field label="Frame rate"><OptionGrid values={browserFallback ? ["24", "30", "60"] : ["30"]} value={browserFallback ? String(props.settings.fps) : '30'} onChange={(value) => update("fps", Number(value) as ProjectExportSettings["fps"])} disabled={busy} /></Field>
        <Field label="Quality"><OptionGrid values={browserFallback ? ["standard", "high"] : ["standard"]} value={browserFallback ? props.settings.quality : 'standard'} onChange={(value) => update("quality", value as ProjectExportSettings["quality"])} disabled={busy} /></Field>
        {props.exportUsage && (
          <p className="sm:col-span-2 text-xs font-semibold text-[#79549b]">
            Free exports remaining: {props.exportUsage.remaining.exports} / {props.exportUsage.limits.exports}
          </p>
        )}
      </div>
      <div className="border-t-2 border-[#e0cee7] bg-[#f5eafb] px-5 py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-semibold text-[#64536e]">{dimensions.width} × {dimensions.height} · {browserFallback ? props.settings.fps : 30} FPS</span><span className="max-w-[55%] truncate font-bold text-[#382645]">{normalizeExportFilename(props.settings.filename)}</span></div>
        {busy && <div aria-live="polite"><div className="mb-2 flex items-center gap-2 text-sm font-bold text-[#68448c]"><LoaderCircle className="h-4 w-4 animate-spin" />{props.submitting ? 'Submitting export' : stageLabel(props.job?.progress_stage)}</div><div className="h-1.5 overflow-hidden rounded-full bg-[#e3d2eb]"><div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-[#a87ad0] to-[#ffcc68]" /></div><p className="mt-2 text-xs text-[#6b5873]">Your timeline is rendered by the secure RangManch export worker.</p></div>}
        {(props.error || props.job?.status === 'failed') && <div role="alert" className="mb-3 rounded-md border-2 border-[#e3a6ac] bg-[#fff0f0] p-3 text-sm text-[#8a2439]">{props.error || props.job?.message || 'The export failed. Please try again.'}</div>}
        <div className="flex justify-end gap-2">{busy ? <button type="button" onClick={props.onCancel} className="min-h-10 rounded-md border-2 border-[#ce8b95] px-4 text-sm font-bold text-[#842b3c] hover:bg-[#fff0f0]">Cancel export</button> : <button type="button" onClick={props.onClose} className="min-h-10 rounded-xl px-4 text-sm font-bold text-[#4d365d] hover:bg-white/70">Close</button>}{props.job?.status === 'completed' && props.downloadUrl ? <a href={props.downloadUrl} download={props.job.output?.filename} className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-[#49334f] bg-[#ffdb77] px-4 text-sm font-extrabold text-[#30223c] shadow-[3px_3px_0_#49334f] transition hover:-translate-y-0.5 hover:bg-[#ffe59a]"><Download className="h-4 w-4" />Download MP4</a> : props.job?.status === 'failed' && props.job.retryable ? <button type="button" onClick={props.onRetry} className="min-h-10 rounded-lg bg-amber-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-300">Retry export</button> : props.job?.status !== 'failed' ? <button type="button" disabled={busy || props.job?.status === 'completed'} onClick={props.onExport} className="inline-flex min-h-10 items-center gap-2 rounded-xl border-2 border-[#49334f] bg-[#ffdb77] px-4 text-sm font-extrabold text-[#30223c] shadow-[3px_3px_0_#49334f] transition hover:-translate-y-0.5 hover:bg-[#ffe59a] disabled:opacity-40"><Download className="h-4 w-4" />Export MP4</button> : null}</div>
      </div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <fieldset><legend className="mb-2 text-xs font-bold text-[#483052]">{label}</legend>{children}</fieldset>; }
function OptionGrid({ values, value, onChange, disabled, suffix = '' }: { values: string[]; value: string; onChange: (value: string) => void; disabled: boolean; suffix?: string }) { return <div className="grid grid-cols-2 gap-2">{values.map((option) => <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`min-h-11 rounded-xl border-2 px-3 text-xs font-extrabold capitalize transition ${value === option ? 'border-[#674580] bg-[#e4cff6] text-[#32213e] shadow-[2px_2px_0_#674580]' : 'border-[#d9c8e1] bg-white text-[#594568] hover:border-[#9972b4] hover:bg-[#f9f1ff]'} disabled:opacity-50`}>{option}{suffix}</button>)}</div>; }

function stageLabel(stage?: string): string {
  return ({ queued: 'Queued', retry_wait: 'Waiting to retry', resolving_sources: 'Preparing media', rendering: 'Rendering video', uploading: 'Uploading export', completed: 'Completed' } as Record<string, string>)[stage ?? ''] ?? 'Processing export';
}
