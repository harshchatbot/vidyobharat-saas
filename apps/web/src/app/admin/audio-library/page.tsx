'use client';

import { useCallback, useEffect, useState } from 'react';
import { getFirebaseAuth } from '@/lib/firebase-client';
import { getApiUrl } from '@/lib/env';

type Asset = { id: string; title: string; status: 'draft' | 'published' | 'retired'; license: string; source: string; evidence_reference: string; type: string; storage_path?: string; tags: string[] };
type Metadata = { title: string; category: string; type: string; tags: string[]; license: string; attribution: string | null; source: string; evidence_reference: string; redistribution_confirmed: boolean };
const field = 'w-full rounded border border-white/20 bg-slate-900 px-3 py-2 text-sm text-white';

export default function AudioLibraryAdminPage() {
  const [items, setItems] = useState<Asset[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<Asset | null>(null);
  const [metadata, setMetadata] = useState<Metadata>({ title: '', category: 'sfx', type: 'sfx', tags: [], license: 'CC0', attribution: null, source: '', evidence_reference: '', redistribution_confirmed: false });
  const request = useCallback(async (path: string, init?: RequestInit) => {
    const user = getFirebaseAuth()?.currentUser;
    if (!user) throw new Error('Sign in with an authorized administrator account first.');
    const token = await user.getIdToken();
    const response = await fetch(`${getApiUrl()}/api/admin${path}`, {
      ...init, headers: { Authorization: `Bearer ${token}`, ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
    if (!response.ok) throw new Error(`Request failed (${response.status}): ${(await response.text()).slice(0, 250)}`);
    return response.json();
  }, []);
  const refresh = useCallback(async () => {
    try { setError(''); const data = await request('/audio-library'); setItems(data.items.filter((item: Asset) => item.type === 'sfx')); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load audio assets.'); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);
  const begin = (item: Asset) => {
    setEditing(item);
    setMetadata({ title: item.title, category: 'sfx', type: 'sfx', tags: item.tags || [], license: item.license === 'unverified' ? 'CC0' : item.license, attribution: null, source: item.source === 'firebase-storage' ? '' : item.source, evidence_reference: item.evidence_reference === 'pending-verification' ? '' : item.evidence_reference, redistribution_confirmed: false });
  };
  const save = async () => {
    if (!editing) return;
    setBusy(editing.id);
    try {
      await request(`/audio-library/${encodeURIComponent(editing.id)}`, { method: 'PATCH', body: JSON.stringify(metadata) });
      setEditing(null); await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not save.'); }
    finally { setBusy(''); }
  };
  const changeStatus = async (item: Asset, action: 'publish' | 'retire') => {
    setBusy(item.id);
    try { await request(`/audio-library/${encodeURIComponent(item.id)}/${action}`, { method: 'POST' }); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not update status.'); }
    finally { setBusy(''); }
  };
  return <main className="mx-auto max-w-4xl space-y-5 p-6 text-white">
    <header className="flex items-center justify-between"><div><h1 className="text-2xl font-bold">SFX approval</h1><p className="text-sm text-slate-400">Administrator access required. Unverified sounds stay hidden from the editor.</p></div><button onClick={() => void refresh()} className={field}>Refresh</button></header>
    {error && <p role="alert" className="rounded bg-red-950 p-3 text-sm text-red-200">{error}</p>}
    <div className="space-y-3">{items.map(item => <div key={item.id} className="rounded-lg border border-white/15 bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="font-semibold">{item.title}</p><p className="text-xs text-slate-400">{item.status} · {item.license} · {item.storage_path}</p></div><div className="flex gap-2"><button className="rounded bg-slate-700 px-3 py-2 text-sm" onClick={() => begin(item)}>Edit license</button>{item.status !== 'published' && <button disabled={busy === item.id} className="rounded bg-amber-400 px-3 py-2 text-sm text-black disabled:opacity-50" onClick={() => void changeStatus(item, 'publish')}>Publish</button>}{item.status === 'published' && <button disabled={busy === item.id} className="rounded bg-red-800 px-3 py-2 text-sm disabled:opacity-50" onClick={() => void changeStatus(item, 'retire')}>Retire</button>}</div></div>
    </div>)}</div>
    {editing && <section className="space-y-3 rounded-lg border border-amber-400/50 p-4"><h2 className="font-semibold">Verify {editing.title}</h2>
      <label className="block text-sm">Title<input className={field} value={metadata.title} onChange={e => setMetadata(m => ({ ...m, title: e.target.value }))}/></label>
      <label className="block text-sm">License<select className={field} value={metadata.license} onChange={e => setMetadata(m => ({ ...m, license: e.target.value }))}><option value="CC0">CC0</option><option value="CC0-1.0">CC0-1.0</option><option value="unverified">Unverified</option></select></label>
      <label className="block text-sm">Original source URL<input className={field} value={metadata.source} onChange={e => setMetadata(m => ({ ...m, source: e.target.value }))}/></label>
      <label className="block text-sm">License evidence URL/reference<input className={field} value={metadata.evidence_reference} onChange={e => setMetadata(m => ({ ...m, evidence_reference: e.target.value }))}/></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" checked={metadata.redistribution_confirmed} onChange={e => setMetadata(m => ({ ...m, redistribution_confirmed: e.target.checked }))}/>I have independently verified redistribution rights.</label>
      <div className="flex gap-2"><button disabled={!!busy || !metadata.redistribution_confirmed || !metadata.source.trim() || !metadata.evidence_reference.trim()} onClick={() => void save()} className="rounded bg-amber-400 px-4 py-2 text-black disabled:opacity-50">Save verification</button><button onClick={() => setEditing(null)} className="rounded bg-slate-700 px-4 py-2">Cancel</button></div>
    </section>}
  </main>;
}
