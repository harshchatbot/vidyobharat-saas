'use client';

import { Download, LoaderCircle, X } from 'lucide-react';
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
  open: boolean; aspectRatio: ProjectAspectRatio; settings: ProjectExportSettings;
  job: ExportJobView | null; submitting: boolean; error: string;
  onClose: () => void; onAspectRatio: (value: ProjectAspectRatio) => void;
  onSettings: (value: ProjectExportSettings) => void; onExport: () => void; onRetry: () => void;
  downloadUrl?: string;
};

const ratios: ProjectAspectRatio[] = ['9:16', '16:9', '1:1', '4:5'];

export function ExportDialog(props: Props) {
  if (!props.open) return null;
  const busy = props.submitting || props.job?.status === 'queued' || props.job?.status === 'running';
  const dimensions = exportDimensions(props.aspectRatio, '720p');
  const update = <K extends keyof ProjectExportSettings>(key: K, value: ProjectExportSettings[K]) => props.onSettings({ ...props.settings, [key]: value });
  return <div className="fixed inset-0 z-[170] grid place-items-center bg-black/70 p-3 backdrop-blur-sm" onPointerDown={props.onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="export-title" className="w-full max-w-xl overflow-hidden rounded-lg border border-white/10 bg-[#111118] text-white shadow-2xl" onPointerDown={(event) => event.stopPropagation()}>
      <header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><h2 id="export-title" className="text-base font-semibold">Export video</h2><p className="mt-1 text-xs text-slate-400">MP4 · H.264 video · AAC audio</p></div><button type="button" onClick={props.onClose} className="grid h-10 w-10 place-items-center rounded-md text-slate-300 hover:bg-white/10" aria-label="Close export settings"><X className="h-4 w-4" /></button></header>
      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <label className="sm:col-span-2"><span className="mb-2 block text-xs font-medium text-slate-300">Filename</span><input value={props.settings.filename} maxLength={80} onChange={(event) => update('filename', event.target.value)} disabled={busy} className="h-11 w-full rounded-md border border-white/10 bg-white/5 px-3 text-sm outline-none focus:border-amber-400" /></label>
        <Field label="Aspect ratio"><OptionGrid values={ratios} value={props.aspectRatio} onChange={(value) => props.onAspectRatio(value as ProjectAspectRatio)} disabled={busy} /></Field>
        <ReadOnlySetting label="Resolution" value="720p" />
        <ReadOnlySetting label="Frame rate" value="30 FPS" />
        <ReadOnlySetting label="Quality" value="Standard" />
        <ReadOnlySetting label="Free export" value="Includes a subtle RangManch AI watermark" />
      </div>
      <div className="border-t border-white/10 bg-black/15 px-5 py-4">
        <div className="mb-4 flex items-center justify-between text-xs"><span className="text-slate-400">{dimensions.width} × {dimensions.height} · {props.settings.fps} FPS</span><span className="max-w-[55%] truncate font-medium text-slate-200">{normalizeExportFilename(props.settings.filename)}</span></div>
        {busy && <div aria-live="polite"><div className="mb-2 flex items-center gap-2 text-sm text-amber-300"><LoaderCircle className="h-4 w-4 animate-spin" />{props.submitting ? 'Submitting export' : stageLabel(props.job?.progress_stage)}</div><div className="h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/3 animate-pulse rounded-full bg-amber-400" /></div><p className="mt-2 text-xs text-slate-500">This stage does not provide a reliable percentage yet.</p></div>}
        {(props.error || props.job?.status === 'failed') && <div role="alert" className="mb-3 rounded-md border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-200">{props.error || props.job?.message || 'The export failed. Please try again.'}</div>}
        <div className="flex justify-end gap-2"><button type="button" onClick={props.onClose} className="min-h-10 rounded-md px-4 text-sm text-slate-300 hover:bg-white/10">Close</button>{props.job?.status === 'completed' && props.downloadUrl ? <a href={props.downloadUrl} download={props.job.output?.filename} className="inline-flex min-h-10 items-center gap-2 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950"><Download className="h-4 w-4" />Download MP4</a> : props.job?.status === 'failed' && props.job.retryable ? <button type="button" onClick={props.onRetry} className="min-h-10 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950">Retry export</button> : props.job?.status !== 'failed' ? <button type="button" disabled={busy || props.job?.status === 'completed'} onClick={props.onExport} className="min-h-10 rounded-md bg-amber-400 px-4 text-sm font-bold text-slate-950 disabled:opacity-40">Export MP4</button> : null}</div>
      </div>
    </section>
  </div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) { return <fieldset><legend className="mb-2 text-xs font-medium text-slate-300">{label}</legend>{children}</fieldset>; }
function ReadOnlySetting({ label, value }: { label: string; value: string }) { return <div><span className="mb-2 block text-xs font-medium text-slate-300">{label}</span><div className="flex min-h-10 items-center rounded-md border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200">{value}</div></div>; }
function OptionGrid({ values, value, onChange, disabled, suffix = '' }: { values: string[]; value: string; onChange: (value: string) => void; disabled: boolean; suffix?: string }) { return <div className="grid grid-cols-2 gap-2">{values.map((option) => <button key={option} type="button" disabled={disabled} onClick={() => onChange(option)} className={`min-h-10 rounded-md border px-3 text-xs font-semibold capitalize ${value === option ? 'border-amber-400 bg-amber-400/15 text-amber-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'} disabled:opacity-50`}>{option}{suffix}</button>)}</div>; }

function stageLabel(stage?: string): string {
  return ({ queued: 'Queued', retry_wait: 'Waiting to retry', resolving_sources: 'Preparing media', rendering: 'Rendering video', uploading: 'Uploading export', completed: 'Completed' } as Record<string, string>)[stage ?? ''] ?? 'Processing export';
}
