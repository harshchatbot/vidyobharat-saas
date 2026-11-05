'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminApiError, adminRequest, formatBytes, type AdminExport, type AdminGuest } from '@/lib/admin-api';
import { AdminState } from './AdminDashboardClient';

type GuestPage = { items: AdminGuest[]; next_cursor: string | null };
type ExportPage = { guest: AdminGuest; items: AdminExport[]; next_cursor: string | null };

export function AdminGuestsClient() {
  const router = useRouter();
  const [items, setItems] = useState<AdminGuest[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load(next?: string) {
    setLoading(true); setError('');
    try {
      const page = await adminRequest<GuestPage>(`guests?limit=25${next ? `&cursor=${encodeURIComponent(next)}` : ''}`);
      setItems((current) => next ? [...current, ...page.items] : page.items); setCursor(page.next_cursor);
    } catch (caught) {
      if (caught instanceof AdminApiError && [401, 403].includes(caught.status)) router.replace('/admin/login');
      else setError(caught instanceof Error ? caught.message : 'Guest sessions unavailable.');
    } finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  if (error && !items.length) return <AdminState title="Guest sessions unavailable" detail={error} />;
  return <div className="space-y-6"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">Guest operations</p><h2 className="mt-2 text-3xl font-semibold">Guest sessions</h2><p className="mt-2 text-sm text-slate-600">Each row represents a browser session—not a unique registered person. A stored active status may remain after expiry.</p></header><div className="overflow-hidden rounded-xl border border-violet-100 bg-white"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-violet-50 text-xs uppercase tracking-wide text-slate-600"><tr><th className="p-4">Session</th><th>Created</th><th>Expires</th><th>Usage</th><th>Storage</th><th>Status</th></tr></thead><tbody className="divide-y divide-violet-100">{items.map((guest) => <tr key={guest.guest_id} className="hover:bg-violet-50/60"><td className="p-4"><Link href={`/admin/guests/${encodeURIComponent(guest.guest_id)}`} className="font-mono text-xs text-violet-800 hover:underline">{guest.guest_id}</Link></td><td>{new Date(guest.created_at).toLocaleString()}</td><td>{new Date(guest.expires_at).toLocaleString()}</td><td>{guest.uploads_count} uploads · {guest.exports_count} exports<br/><span className="text-xs text-slate-600">{guest.processing_seconds.toFixed(1)} processing seconds</span></td><td>{formatBytes(guest.storage_bytes)}</td><td><span className="rounded-full bg-violet-50 px-2 py-1 text-xs">{new Date(guest.expires_at).getTime() <= Date.now() ? 'Expired' : guest.status}</span></td></tr>)}</tbody></table></div>{!items.length && !loading ? <p className="p-8 text-center text-sm text-slate-600">No retained guest sessions.</p> : null}<div className="flex items-center justify-between border-t border-violet-100 p-4"><p className="text-xs text-slate-600">Showing {items.length} retained sessions</p><button disabled={!cursor || loading} onClick={() => cursor && void load(cursor)} className="min-h-10 rounded-lg border border-violet-100 px-4 text-sm disabled:opacity-40">{loading ? 'Loading…' : 'Load more'}</button></div></div></div>;
}

export function AdminGuestDetailClient({ guestId }: { guestId: string }) {
  const router = useRouter();
  const [page, setPage] = useState<ExportPage | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { adminRequest<ExportPage>(`guests/${encodeURIComponent(guestId)}/exports?limit=25`).then(setPage).catch((caught) => {
    if (caught instanceof AdminApiError && [401, 403].includes(caught.status)) router.replace('/admin/login');
    else setError(caught instanceof Error ? caught.message : 'Guest details unavailable.');
  }); }, [guestId, router]);
  if (error) return <AdminState title="Guest details unavailable" detail={error} />;
  if (!page) return <AdminState title="Loading guest session" detail="Reading sanitized export history…" />;
  const guest = page.guest;
  return <div className="space-y-6"><header><Link href="/admin/guests" className="text-sm text-violet-800">← Guest sessions</Link><h2 className="mt-3 break-all font-mono text-2xl">{guest.guest_id}</h2><p className="mt-2 text-sm text-slate-600">{new Date(guest.expires_at).getTime() <= Date.now() ? 'Expired' : guest.status} · expires {new Date(guest.expires_at).toLocaleString()}</p></header><section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[['Uploads', guest.uploads_count], ['Exports', guest.exports_count], ['Storage', formatBytes(guest.storage_bytes)], ['Processing', `${guest.processing_seconds.toFixed(1)}s`]].map(([label, value]) => <div key={label} className="rounded-xl border border-violet-100 bg-white p-4"><p className="text-xs text-slate-600">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>)}</section><section className="rounded-xl border border-violet-100 bg-white"><div className="border-b border-violet-100 p-5"><h3 className="font-semibold">Export history</h3></div><div className="divide-y divide-violet-100">{page.items.length ? page.items.map((item) => <div key={item.job_id} className="grid gap-2 p-5 text-sm md:grid-cols-[1fr_auto_auto]"><div><p className="font-mono text-xs text-slate-700">{item.job_id}</p><p className="mt-1 text-xs text-slate-600">{item.filename || 'No output'}{item.error_code ? ` · ${item.error_code}` : ''}</p></div><span>{item.status}</span><time className="text-slate-600">{new Date(item.updated_at).toLocaleString()}</time></div>) : <p className="p-6 text-sm text-slate-600">No exports for this session.</p>}</div></section></div>;
}
