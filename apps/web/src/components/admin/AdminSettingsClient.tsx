'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminApiError, adminRequest, type AdminConfig } from '@/lib/admin-api';
import { AdminState } from './AdminDashboardClient';

const fields: Record<string, Array<{ key: string; label: string; kind?: 'boolean' }>> = {
  guest: [
    { key: 'max_uploads', label: 'Maximum uploads' }, { key: 'max_exports', label: 'Maximum exports' },
    { key: 'max_uploaded_bytes', label: 'Uploaded byte quota' }, { key: 'max_storage_bytes', label: 'Active storage byte quota' },
    { key: 'max_processing_seconds', label: 'Processing seconds' }, { key: 'max_concurrent_processing', label: 'Concurrent processing' },
    { key: 'network_max_uploads', label: 'Network maximum uploads' }, { key: 'network_max_exports', label: 'Network maximum exports' },
    { key: 'network_max_uploaded_bytes', label: 'Network uploaded byte quota' }, { key: 'network_max_processing_seconds', label: 'Network processing seconds' },
  ],
  media: [{ key: 'max_file_bytes', label: 'Maximum upload file size (bytes)' }],
  editor: [{ key: 'max_clips', label: 'Maximum clips' }, { key: 'max_duration_seconds', label: 'Maximum timeline duration (seconds)' }],
  features: [{ key: 'guest_editor_enabled', label: 'Guest editor enabled', kind: 'boolean' }],
};

type AuditPage = { items: Array<Record<string, unknown>>; next_cursor: string | null };

export function AdminSettingsClient() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<AdminConfig | null>(null);
  const [draft, setDraft] = useState<Record<string, Record<string, unknown>>>({});
  const [audits, setAudits] = useState<Array<Record<string, unknown>>>([]);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  async function load() {
    try {
      const [config, audit] = await Promise.all([adminRequest<AdminConfig>('config'), adminRequest<AuditPage>('config/audit?limit=10')]);
      setLoaded(config); setDraft(structuredClone(config.config)); setAudits(audit.items); setError('');
    } catch (caught) {
      if (caught instanceof AdminApiError && [401, 403].includes(caught.status)) router.replace('/admin/login');
      else setError(caught instanceof Error ? caught.message : 'Settings unavailable.');
    }
  }
  useEffect(() => { void load(); }, []);
  const changes = useMemo(() => {
    if (!loaded) return {};
    const result: Record<string, Record<string, unknown>> = {};
    for (const [category, definitions] of Object.entries(fields)) for (const { key } of definitions) {
      if (draft[category]?.[key] !== loaded.config[category]?.[key]) {
        result[category] ||= {}; result[category][key] = draft[category]?.[key];
      }
    }
    return result;
  }, [draft, loaded]);
  const changeCount = Object.values(changes).reduce((total, group) => total + Object.keys(group).length, 0);
  function update(category: string, key: string, value: unknown) { setDraft((current) => ({ ...current, [category]: { ...current[category], [key]: value } })); }
  async function save() {
    if (!loaded || !changeCount) return;
    setSaving(true); setError('');
    try {
      const next = await adminRequest<AdminConfig>('config', { method: 'PUT', body: JSON.stringify({ revision: loaded.revision, changes, reason: reason.trim() || null }) });
      setLoaded(next); setDraft(structuredClone(next.config)); setReason(''); setConfirming(false); await load();
    } catch (caught) {
      setConfirming(false);
      setError(caught instanceof AdminApiError && caught.status === 409 ? 'Settings changed elsewhere. Reload and review before saving again.' : caught instanceof Error ? caught.message : 'Save failed.');
    } finally { setSaving(false); }
  }
  if (error && !loaded) return <AdminState title="Settings unavailable" detail={error} />;
  if (!loaded) return <AdminState title="Loading settings" detail="Reading the effective AppConfig snapshot…" />;
  return <div className="space-y-6"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Runtime controls</p><h2 className="mt-2 text-3xl font-semibold">Application settings</h2><p className="mt-2 text-sm text-slate-400">API changes apply immediately in this process and within {loaded.cache_ttl_seconds}s in other API/worker processes. Existing reservations are preserved.</p></header>{error ? <p role="alert" className="rounded-lg bg-red-500/10 p-4 text-sm text-red-300">{error}</p> : null}<div className="grid gap-5 xl:grid-cols-2">{Object.entries(fields).map(([category, definitions]) => <section key={category} className="rounded-xl border border-white/10 bg-[#111118] p-5"><h3 className="mb-4 text-lg font-semibold capitalize">{category}</h3><div className="grid gap-4 sm:grid-cols-2">{definitions.map(({ key, label, kind }) => <label key={key} className="text-sm text-slate-300">{label}{kind === 'boolean' ? <input type="checkbox" checked={Boolean(draft[category]?.[key])} onChange={(event) => update(category, key, event.target.checked)} className="ml-3 h-5 w-5 align-middle accent-amber-400" /> : <input type="number" min="0" value={String(draft[category]?.[key] ?? '')} onChange={(event) => update(category, key, Number(event.target.value))} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 outline-none focus:border-violet-400" />}</label>)}</div></section>)}</div><label className="block text-sm text-slate-300">Optional reason<textarea value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} className="mt-2 min-h-24 w-full rounded-lg border border-white/10 bg-white/5 p-3 outline-none focus:border-violet-400" placeholder="Why is this configuration changing?" /></label><div className="flex flex-wrap items-center gap-3"><button disabled={!changeCount || saving} onClick={() => setConfirming(true)} className="min-h-11 rounded-lg bg-amber-400 px-5 font-semibold text-slate-950 disabled:opacity-40">Review {changeCount || ''} change{changeCount === 1 ? '' : 's'}</button><button onClick={() => void load()} className="min-h-11 rounded-lg border border-white/10 px-5 text-sm">Reload</button><span className="text-xs text-slate-500">Revision {loaded.revision}</span></div><section className="rounded-xl border border-white/10 bg-[#111118]"><div className="border-b border-white/10 p-5"><h3 className="font-semibold">Recent audit trail</h3></div>{audits.length ? audits.map((audit) => <div key={String(audit.audit_id)} className="border-b border-white/5 p-5 text-sm last:border-0"><div className="flex flex-wrap justify-between gap-2"><span>Revision {String(audit.revision)} · {String(audit.actor_email || audit.actor_uid)}</span><time className="text-slate-500">{new Date(String(audit.created_at)).toLocaleString()}</time></div><p className="mt-1 text-slate-400">{String(audit.reason || 'No reason supplied')}</p></div>) : <p className="p-5 text-sm text-slate-500">No dashboard configuration changes yet.</p>}</section>{confirming ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4"><div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#1a1a2e] p-6"><h3 className="text-xl font-semibold">Apply runtime configuration?</h3><p className="mt-2 text-sm text-slate-400">{changeCount} validated setting{changeCount === 1 ? '' : 's'} will change. New requests use the updated limits; accepted jobs remain valid.</p><pre className="mt-4 max-h-64 overflow-auto rounded-lg bg-black/30 p-3 text-xs text-slate-300">{JSON.stringify(changes, null, 2)}</pre><div className="mt-5 flex justify-end gap-3"><button disabled={saving} onClick={() => setConfirming(false)} className="min-h-11 rounded-lg border border-white/10 px-4">Cancel</button><button disabled={saving} onClick={() => void save()} className="min-h-11 rounded-lg bg-amber-400 px-4 font-semibold text-slate-950">{saving ? 'Saving…' : 'Apply changes'}</button></div></div></div> : null}</div>;
}
