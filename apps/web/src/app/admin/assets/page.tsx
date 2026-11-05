'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { getFreshFirebaseIdToken } from '@/lib/firebase-client';
import { getApiUrl } from '@/lib/env';

type Category = 'lut' | 'emoji' | 'music';
type Asset = {
  id: string; type: Category; slug: string; title: string; description: string;
  tags: string[]; source: string; license: string; evidence_reference: string;
  attribution: string; redistribution_confirmed: boolean;
  storage_path: string | null; sha256: string | null;
  status: 'draft' | 'published' | 'retired'; details: Record<string, unknown>;
};
type Editable = {
  title: string; description: string; tags: string; source: string;
  license: string; evidence_reference: string; attribution: string;
  redistribution_confirmed: boolean;
};
const empty: Editable = {
  title: '', description: '', tags: '', source: '', license: 'unverified',
  evidence_reference: '', attribution: '', redistribution_confirmed: false,
};
function editFrom(item: Asset): Editable {
  return { title: item.title, description: item.description, tags: item.tags.join(', '),
    source: item.source, license: item.license, evidence_reference: item.evidence_reference,
    attribution: item.attribution, redistribution_confirmed: item.redistribution_confirmed };
}
function payload(form: Editable) {
  return { ...form, tags: form.tags.split(',').map(x => x.trim()).filter(Boolean).slice(0, 30) };
}

export default function AdminAssetsPage() {
  const [authorized, setAuthorized] = useState(false);
  const [items, setItems] = useState<Asset[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [kind, setKind] = useState<Category>('emoji');
  const [slug, setSlug] = useState('');
  const [form, setForm] = useState<Editable>(empty);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const current = items.find(item => item.id === selected) ?? null;

  const call = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getFreshFirebaseIdToken();
    if (!token) throw Error('Please sign in to your admin account.');
    const response = await fetch(getApiUrl() + path, {
      ...options, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as {detail?: string};
      throw Error(error.detail || `Request failed: ${response.status}`);
    }
    return response.json();
  }, []);
  const refresh = useCallback(async () => {
    const data = await call('/api/admin/visual-assets') as {items: Asset[]};
    setItems(data.items);
  }, [call]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        await call('/api/admin/me');
        if (!active) return;
        setAuthorized(true);
        await refresh();
      } catch (e) {
        if (active) setNotice(e instanceof Error ? e.message : 'Admin access required');
      }
    })();
    return () => { active = false; };
  }, [call, refresh]);

  const work = async (task: () => Promise<string>) => {
    setBusy(true);
    setNotice('');
    try {
      const message = await task();
      await refresh();
      setNotice(message);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Operation failed');
    } finally { setBusy(false); }
  };
  const choose = (a: Asset) => {
    setSelected(a.id); setForm(editFrom(a)); setCreating(false); setPreview(null);
  };
  const visible = useMemo(() => items.filter(a =>
    (filter === 'all' || a.type === filter) &&
    `${a.slug} ${a.title} ${a.description} ${a.tags.join(' ')}`
      .toLowerCase().includes(query.toLowerCase())
  ), [items, filter, query]);
  const upload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !current) return;
    void work(async () => {
      const data = new FormData();
      data.append('file', file);
      await call(`/api/admin/visual-assets/${encodeURIComponent(current.id)}/upload`,
        {method: 'POST', body: data});
      setForm(f => ({ ...f, redistribution_confirmed: false }));
      return 'File uploaded as draft. Verify license before publishing.';
    });
  };
  const openPreview = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const token = await getFreshFirebaseIdToken();
      if (!token) throw Error('Sign in required');
      const res = await fetch(getApiUrl() +
        `/api/admin/visual-assets/${encodeURIComponent(current.id)}/preview`, {
          headers: {Authorization: `Bearer ${token}`},
        });
      if (!res.ok) throw Error('Preview unavailable');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (preview) URL.revokeObjectURL(preview);
      setPreview(url);
    } catch (e) { setNotice(e instanceof Error ? e.message : 'Preview failed'); }
    finally { setBusy(false); }
  };
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const base = 'rounded-xl border border-slate-700 bg-slate-900 p-5';
  const input = 'w-full rounded-lg border border-slate-600 bg-slate-950 px-3 py-2 text-sm text-white';
  const button = 'rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800 disabled:opacity-50';
  const field = (key: Exclude<keyof Editable, 'redistribution_confirmed'>, label: string) =>
    <label key={key} className="block space-y-1 text-xs text-slate-300">
      <span>{label}</span>
      <input className={input} value={form[key]} onChange={e => setForm(f => ({...f, [key]: e.target.value}))}/>
    </label>;

  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 md:px-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <header className="flex flex-wrap justify-between gap-3">
        <div>
          <Link href="/editor" className="text-sm text-indigo-300">← Editor</Link>
          <h1 className="mt-1 text-3xl font-semibold">Asset Library · Admin</h1>
          <p className="text-sm text-slate-400">Dynamic LUTs, emoji and music. Drafts are invisible to users.</p>
        </div>
        {authorized && <div className="flex items-start gap-2">
          <button className={button} disabled={busy} onClick={() => void work(async () => {
            const result = await call('/api/admin/visual-assets/seed', {method: 'POST'}) as {created: number};
            return `Imported ${result.created} new drafts; existing entries preserved.`;
          })}>Import preset library</button>
          <button className={button} disabled={busy} onClick={() => {
            setCreating(true); setSelected(null); setSlug(''); setForm(empty); setPreview(null);
          }}>+ New asset</button>
        </div>}
      </header>
      {notice && <p role="status" className="rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm">{notice}</p>}
      {!authorized ? <section className={base}>An authorized Firebase admin must sign in before using this screen.</section>
      : <div className="grid gap-5 lg:grid-cols-[1fr_440px]">
        <section className={base}>
          <div className="mb-4 flex flex-wrap gap-3">
            <select className={input + ' max-w-40'} aria-label="Category" value={filter} onChange={e => setFilter(e.target.value)}>
              <option value="all">All</option><option value="lut">LUT</option>
              <option value="emoji">Emoji</option><option value="music">Music</option>
            </select>
            <input className={input + ' flex-1'} aria-label="Search assets" placeholder="Search catalog" value={query}
              onChange={e => setQuery(e.target.value)}/>
          </div>
          <p className="mb-3 text-xs text-slate-400">{visible.length} results · {items.filter(x => x.status === 'published').length} published</p>
          <div className="max-h-[70vh] space-y-2 overflow-auto">
            {visible.map(a => <button key={a.id} className={`w-full rounded-lg border p-3 text-left hover:border-indigo-400 ${selected === a.id ? 'border-indigo-400' : 'border-slate-700'}`}
              onClick={() => choose(a)}>
              <div className="flex items-center justify-between gap-2">
                <strong className="text-sm">{a.title}</strong>
                <span className="rounded bg-slate-700 px-2 py-1 text-xs">{a.status}</span>
              </div>
              <p className="mt-1 text-xs text-slate-400">{a.type} · {a.slug} · {a.storage_path ? 'file uploaded' : 'metadata only'}</p>
            </button>)}
          </div>
        </section>
        <section className={base}>
          {!current && !creating ? <p>Choose an asset or add a new one. Import your supplied manifests to start.</p>
          : <div className="space-y-4">
            <h2 className="text-xl font-semibold">{creating ? 'New catalog entry' : current?.title}</h2>
            {creating && <>
              <label className="block space-y-1 text-sm">Type
                <select className={input} value={kind} onChange={e => setKind(e.target.value as Category)}>
                  <option value="emoji">Emoji</option><option value="lut">LUT</option><option value="music">Music</option>
                </select>
              </label>
              <label className="block space-y-1 text-sm">Slug
                <input className={input} placeholder="e.g. idea-pop" value={slug} onChange={e => setSlug(e.target.value)}/>
              </label>
            </>}
            {field('title', 'Title')}
            {field('description', 'Description / usage')}
            {field('tags', 'Search tags (comma-separated)')}
            {field('source', 'Original asset source')}
            {field('license', 'License type')}
            {field('evidence_reference', 'License evidence / permission reference')}
            {field('attribution', 'Attribution or notice')}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.redistribution_confirmed}
                onChange={e => setForm(f => ({ ...f, redistribution_confirmed: e.target.checked }))}/>
              I verified rights for distribution through this SaaS asset library.
            </label>
            {current?.type === 'music' && /mixkit/i.test(current.source) &&
              <p className="rounded-lg border border-amber-800 p-3 text-xs text-amber-200">
                Mixkit allows many finished-video uses but restricts using tracks as a stock library.
                These presets cannot be published here without separate distribution permission.
              </p>}
            <div className="flex flex-wrap gap-2">
              <button className={button} disabled={busy} onClick={() => void work(async () => {
                if (creating) {
                  await call('/api/admin/visual-assets', {
                    method: 'POST', headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({...payload(form), type: kind, slug, details: {}}),
                  });
                  setCreating(false); setSelected(`${kind}:${slug}`);
                  return 'Draft created.';
                }
                if (!current) throw Error('Select an asset');
                await call(`/api/admin/visual-assets/${encodeURIComponent(current.id)}`, {
                  method: 'PATCH', headers: {'Content-Type': 'application/json'},
                  body: JSON.stringify(payload(form)),
                });
                return 'Saved as draft. Publish only after verifying license and file.';
              })}>{creating ? 'Create draft' : 'Save metadata'}</button>
              {current && <>
                <button className={button} disabled={busy} onClick={() => void work(async () => {
                  await call(`/api/admin/visual-assets/${encodeURIComponent(current.id)}/publish`, {method: 'POST'});
                  return 'Asset published.';
                })}>Publish</button>
                <button className={button} disabled={busy} onClick={() => void work(async () => {
                  await call(`/api/admin/visual-assets/${encodeURIComponent(current.id)}/retire`, {method: 'POST'});
                  return 'Asset retired.';
                })}>Retire</button>
              </>}
            </div>
            {current && <>
              <label className="block space-y-2 text-sm">
                <span>Upload actual {current.type === 'lut' ? '.cube' : current.type === 'music' ? '.mp3' : 'PNG/APNG'} file</span>
                <input type="file" className="block max-w-full text-sm" disabled={busy} accept={current.type === 'lut' ? '.cube' : current.type === 'music' ? '.mp3' : '.png,.apng'} onChange={upload}/>
              </label>
              {current.storage_path && <button className={button} disabled={busy} onClick={() => void openPreview()}>
                {current.type === 'lut' ? 'Inspect uploaded LUT' : 'Preview uploaded asset'}
              </button>}
              {preview && current.type === 'emoji' && <img src={preview} alt={current.title} className="h-32 w-32 object-contain"/>}
              {preview && current.type === 'music' && <audio controls src={preview} className="w-full"/>}
              {preview && current.type === 'lut' && <p className="text-xs text-slate-400">LUT file retrieved; browser colour preview requires a sample frame renderer.</p>}
              {Object.keys(current.details || {}).length > 0 && <details className="text-xs text-slate-300">
                <summary className="cursor-pointer">Original imported metadata</summary>
                <pre className="mt-2 max-h-52 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(current.details, null, 2)}</pre>
              </details>}
            </>}
          </div>}
        </section>
      </div>}
    </div>
  </main>;
}
