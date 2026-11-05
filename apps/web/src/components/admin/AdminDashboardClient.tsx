'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AdminApiError, adminRequest, formatBytes, type AdminDashboard } from '@/lib/admin-api';
import { StatusTransition } from '@/components/ui/MotionPrimitives';
import { AdminLoading } from './AdminLoading';

export function AdminDashboardClient() {
  const router = useRouter();
  const [data, setData] = useState<AdminDashboard | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { adminRequest<AdminDashboard>('dashboard').then(setData).catch((caught) => {
    if (caught instanceof AdminApiError && caught.status === 401) router.replace('/login?next=%2Fadmin');
    else if (caught instanceof AdminApiError && caught.status === 403) setError('Your account is signed in but is not authorized for admin access.');
    else setError(caught instanceof Error ? caught.message : 'Admin service is temporarily unavailable.');
  }); }, [router]);
  if (error) return <StatusTransition tone="error" label="Dashboard unavailable" detail={error} />;
  if (!data) return <AdminLoading label="Loading guest editor overview" />;
  const metrics = [
    ['Guest sessions', data.total_guest_sessions.toLocaleString()], ['Active now', data.active_guest_sessions.toLocaleString()],
    ['Accepted uploads', data.accepted_uploads.toLocaleString()], ['Completed exports', data.completed_exports.toLocaleString()],
    ['Failed exports', data.failed_exports.toLocaleString()], ['Active storage', formatBytes(data.active_storage_bytes)],
  ];
  return <div className="space-y-7"><header><p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-700">Operations</p><h2 className="mt-2 text-3xl font-semibold">Guest editor overview</h2><p className="mt-2 max-w-3xl text-sm text-slate-600">{data.coverage_note}</p></header><section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(([label, value]) => <article key={label} className="admin-card p-5"><p className="text-sm text-slate-600">{label}</p><p className="mt-3 text-3xl font-semibold tabular-nums">{value}</p></article>)}</section><section className="rounded-xl border border-violet-100 bg-white"><div className="border-b border-violet-100 p-5"><h3 className="font-semibold">Recent retained activity</h3></div><div className="divide-y divide-violet-100">{data.recent_activity.length ? data.recent_activity.map((item, index) => <div key={`${String(item.kind)}-${String(item.job_id || item.guest_id)}-${index}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 text-sm"><div><span className="font-medium capitalize">{String(item.kind).replace('_', ' ')}</span><span className="ml-2 font-mono text-xs text-slate-600">{String(item.job_id || item.guest_id || '')}</span></div><div className="flex items-center gap-3"><span className="rounded-full bg-violet-50 px-2 py-1 text-xs text-slate-700">{String(item.status)}</span><time className="text-xs text-slate-600">{item.occurred_at ? new Date(String(item.occurred_at)).toLocaleString() : 'Unknown'}</time></div></div>) : <p className="p-6 text-sm text-slate-600">No retained activity yet.</p>}</div></section></div>;
}

export function AdminState({ title, detail }: { title: string; detail: string }) {
  return <div className="rounded-xl border border-violet-100 bg-white p-8"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm text-slate-600">{detail}</p></div>;
}
