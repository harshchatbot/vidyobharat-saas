'use client';

import { Download, LoaderCircle, Sparkles, Film, MonitorPlay, X } from 'lucide-react';
import { browserExportDimensions } from '@/lib/browser-ai/browserMp4Export';
import type { ReactNode } from 'react';
import { normalizeExportFilename } from './timeline/serialization';
import type { ProjectAspectRatio, ProjectExportSettings } from './timeline/types';

export type ExportJobView = {
  job_id: string; status: 'queued' | 'running' | 'completed' | 'failed' | 'expired';
  progress_stage: string; output?: { filename?: string; width?: number; height?: number; fps?: number; file_size?: number } | null;
  message?: string | null;
  retryable?: boolean;
};

type Props = {
  open: boolean; aspectRatio: ProjectAspectRatio; settings: ProjectExportSettings;
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
  const dimensions = browserExportDimensions(props.aspectRatio, props.settings.resolution);
  const update = <K extends keyof ProjectExportSettings>(key: K, value: ProjectExportSettings[K]) => props.onSettings({ ...props.settings, [key]: value });
  return <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onPointerDown={props.onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="export-title" className="w-full max-w-2xl overflow-hidden rounded-2xl border border-violet-400/20 bg-[#111118] text-white shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-violet-500/15 via-[#171321] to-[#111118] px-5 py-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl border border-violet-400/25 bg-violet-500/15 text-violet-300"><Film className="h-5 w-5" /></div><div><h2 id="export-title" className="text-lg font-semibold tracking-tight">Export your creation</h2><p className="mt-1 text-xs text-slate-400">RangManch Creative Studio · MP4 video</p></div></div><button type="button" onClick={props.onClose} className="grid h-10 w-10 place-items-center rounded-md text-slate-300 hover:bg-white/10" aria-label="Close export settings"><X className="h-4 w-4" /></button></header>
      <div className="grid max-h-[60vh] gap-5 overflow-y-auto p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-2 block text-xs font-medium text-slate-300">Filename</span><input value={props.settings.filename} maxLength={80} onFocus={() => props.onEditStart('export:filename')} onBlur={() => props.onEditEnd('export:filename')} onChange={(event) => update('filename', event.target.value)} disabled={busy} className="h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-400" /></label>
        <Field label="Aspect ratio"><OptionGrid values={ratios} value={props.aspectRatio} onChange={(value) => props.onAspectRatio(value as ProjectAspectRatio)} disabled={busy} /></Field>
        <Field label="Resolution"><OptionGrid values={["720p", "1080p"]} value={props.settings.resolution} onChange={(value) => update("resolution", value as ProjectExportSettings["resolution"])} disabled={busy} /></Field>
        <Field label="Frame rate"><OptionGrid values={["24", "30", "60"]} value={String(props.settings.fps)} onChange={(value) => update("fps", Number(value) as ProjectExportSettings["fps"])} disabled={busy} /></Field>
        <Field label="Quality"><OptionGrid values={["standard", "high"]} value={props.settings.quality} onChange={(value) => update("quality", value as ProjectExportSettings["quality"])} disabled={busy} /></Field>
        <div className="sm:col-span-2 flex items-start gap-3 rounded-xl border border-violet-400/15 bg-violet-500/[0.07] p-3"><MonitorPlay className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" /><div><p className="text-xs font-semibold text-violet-100">Private, on-device rendering</p><p className="mt-1 text-xs leading-5 text-slate-400">Your video is rendered in this browser. Keep this tab open until export completes. MP4 encoding requires a compatible browser.</p></div></div>

        {props.exportUsage && (
          <p className="sm:col-span-2 text-xs text-amber-300">
            Free exports remaining: {props.exportUsage.remaining.exports} / {props.exportUsage.limits.exports}
          </p>
        )}
      </div>
      <div className="border-t border-white/10 bg-black/20 px-5 py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-slate-400">{dimensions.width} × {dimensions.height} · {props.settings.fps} FPS</span><span className="max-w-[55%] truncate font-medium text-slate-200">{normalizeExportFilename(props.settings.filename)}</span></div>
        {busy && <div aria-live="polite"><div className="mb-2 flex items-center gap-2 text-sm text-violet-200"><LoaderCircle className="h-4 w-4 animate-spin" />{props.submitting ? 'Rendering locally' : stageLabel(props.job?.progress_stage)}</div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-violet-500 to-amber-400" /></div><p className="mt-2 text-xs text-slate-500">The browser renders this video locally in real time.</p></div>}
        {(props.error || props.job?.status === 'failed') && <div role="alert" className="mb-3 rounded-md border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{props.error || props.job?.message || 'The export failed. Please try again.'}</div>}
        <div className="flex justify-end gap-2">{busy ? <button type="button" onClick={props.onCancel} className="min-h-10 rounded-md border border-red-400/30 px-4 text-sm text-red-200 hover:bg-red-400/10">Cancel export</button> : <button type="button" onClick={props.onClose} className="min-h-10 rounded-md px-4 text-sm text-slate-300 hover:bg-white/10">Close</button>}{props.job?.status === 'completed' && props.downloadUrl ? <a href={props.downloadUrl} download={props.job.output?.filename} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-300"><Download className="h-4 w-4" />Download MP4</a> : props.job?.status === 'failed' && props.job.retryable ? <button type="button" onClick={props.onRetry} className="min-h-10 rounded-lg bg-amber-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-300">Retry export</button> : props.job?.status !== 'failed' ? <button type="button" disabled={busy || props.job?.status === 'completed'} onClick={props.onExport} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-amber-400 px-4 text-sm font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-40"><Sparkles className="h-4 w-4" />Export MP4</button> : null}</div>
      </div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <fieldset><legend className="mb-2 text-xs font-medium text-slate-300">{label}</legend>{children}</fieldset>; }
function ReadOnlySetting({ label, value }: { label: string; value: string }) { return <div><span className="mb-2 block text-xs font-medium text-slate-300">{label}</span><div className="flex min-h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200">{value}</div></div>; }
function OptionGrid({ values, value, onChange, disabled, suffix = '' }: { values: string[]; value: string; onChange: (value: string) => void; disabled: boolean; suffix?: string }) { return <div className="grid grid-cols-2 gap-2">{values.map((option) => <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`min-h-10 rounded-md border px-3 text-xs font-semibold capitalize ${value === option ? 'border-violet-400 bg-violet-500/15 text-violet-100 ring-1 ring-violet-400/20' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'} disabled:opacity-50`}>{option}{suffix}</button>)}</div>; }

function stageLabel(stage?: string): string {
  return ({ queued: 'Queued', retry_wait: 'Waiting to retry', resolving_sources: 'Preparing media', rendering: 'Rendering video', uploading: 'Uploading export', completed: 'Completed' } as Record<string, string>)[stage ?? ''] ?? 'Processing export';
}
