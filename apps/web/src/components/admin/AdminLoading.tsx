import { Sparkles } from 'lucide-react';

export function AdminLoading({ label = 'Loading your Admin Studio' }: { label?: string }) {
  return <div role="status" aria-live="polite" className="space-y-6">
    <div className="flex items-center gap-3">
      <span className="grid h-11 w-11 place-items-center rounded-xl border border-violet-200 bg-violet-50 text-violet-800"><Sparkles className="h-5 w-5" /></span>
      <div><p className="text-lg font-semibold text-[#30213e]">{label}</p><p className="text-sm text-slate-600">Retrieving the latest information securely…</p></div>
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="admin-card space-y-4 p-5"><div className="admin-loading-bar h-3 w-24 rounded" /><div className="admin-loading-bar h-8 w-28 rounded" /></div>)}
    </div>
    <div className="admin-card space-y-4 p-5">
      <div className="admin-loading-bar h-5 w-44 rounded" />
      {Array.from({ length: 4 }, (_, i) => <div key={i} className="admin-loading-bar h-12 rounded-lg" />)}
    </div>
  </div>;
}
