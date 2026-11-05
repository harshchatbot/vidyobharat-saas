'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw, UsersRound } from 'lucide-react';
import { AdminApiError, adminRequest } from '@/lib/admin-api';
import { AdminState } from './AdminDashboardClient';

type RegisteredUser = {
  uid: string;
  email: string | null;
  display_name: string | null;
  email_verified: boolean;
  disabled: boolean;
  providers: string[];
  created_at: number | null;
  last_sign_in_at: number | null;
};
type UsersPage = { items: RegisteredUser[]; next_cursor: string | null };
function displayTime(timestamp: number | null) {
  return typeof timestamp === 'number' && timestamp > 0
    ? new Date(timestamp).toLocaleString()
    : 'Not available';
}

export function AdminRegisteredUsersClient() {
  const router = useRouter();
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('');

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      const data = await adminRequest<UsersPage>(`registered-users?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`);
      setUsers((current) => cursor ? [...current, ...data.items] : data.items);
      setNextCursor(data.next_cursor);
    } catch (caught) {
      if (caught instanceof AdminApiError && caught.status === 401) {
        router.replace('/admin/login');
        return;
      }
      setError(caught instanceof AdminApiError && caught.status === 403
        ? 'This account does not have administrator access.'
        : caught instanceof Error ? caught.message : 'Registered users unavailable.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);
  const visible = users.filter((user) => {
    const value = filter.trim().toLowerCase();
    return !value || [user.email, user.display_name, user.uid].some((part) => part?.toLowerCase().includes(value));
  });

  return <div className="space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="admin-eyebrow">Accounts</p>
        <h2 className="mt-2 text-3xl font-semibold">Registered users</h2>
        <p className="mt-2 text-sm text-slate-500">Firebase Authentication accounts, not anonymous editor sessions. Read-only access.</p>
      </div>
      <button type="button" disabled={loading || loadingMore} onClick={() => void load()} className="admin-secondary-button inline-flex items-center gap-2">
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
      </button>
    </header>

    <div className="admin-card flex flex-wrap items-center justify-between gap-4 p-5">
      <div className="flex items-center gap-3">
        <span className="rounded-xl bg-violet-100 p-2 text-violet-800"><UsersRound className="h-5 w-5" /></span>
        <div><p className="text-sm font-semibold">Loaded accounts</p><p className="text-2xl font-semibold tabular-nums">{users.length}</p></div>
      </div>
      <div className="w-full max-w-sm">
        <label htmlFor="admin-user-search" className="mb-1 block text-xs font-medium text-slate-600">Search loaded accounts</label>
        <input id="admin-user-search" value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Email, name or user ID" className="admin-input w-full" />
      </div>
    </div>

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}<button className="ml-3 font-semibold underline" type="button" onClick={() => void load()}>Retry</button></div>}
    {loading && !users.length
      ? <div role="status" aria-live="polite" className="admin-card space-y-4 p-6"><p className="text-sm font-medium text-slate-600">Loading registered users…</p>{Array.from({length: 5}, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-violet-100/70" />)}</div>
      : <div className="admin-card overflow-hidden">
        <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm">
          <thead className="bg-violet-50 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-4">Account</th><th className="px-4 py-4">Sign-in method</th><th className="px-4 py-4">Joined</th><th className="px-4 py-4">Last sign-in</th><th className="px-4 py-4">Status</th></tr></thead>
          <tbody className="divide-y divide-violet-100">
            {visible.map((user) => <tr key={user.uid} className="hover:bg-violet-50/60">
              <td className="px-5 py-4"><p className="font-semibold text-slate-900">{user.display_name || user.email || 'Unnamed account'}</p><p className="text-xs text-slate-600">{user.email || 'No email address'}{user.email_verified ? ' · Verified' : ''}</p><p className="mt-1 max-w-[280px] truncate font-mono text-[11px] text-slate-500" title={user.uid}>{user.uid}</p></td>
              <td className="px-4 py-4 text-slate-700">{user.providers.length ? user.providers.join(', ') : 'Firebase account'}</td>
              <td className="px-4 py-4 whitespace-nowrap text-slate-700">{displayTime(user.created_at)}</td>
              <td className="px-4 py-4 whitespace-nowrap text-slate-700">{displayTime(user.last_sign_in_at)}</td>
              <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.disabled ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800'}`}>{user.disabled ? 'Disabled' : 'Enabled'}</span></td>
            </tr>)}
          </tbody>
        </table></div>
        {!visible.length && !loading ? <p className="p-6 text-center text-sm text-slate-600">{filter ? 'No matching accounts in the loaded pages.' : 'No registered users found.'}</p> : null}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-100 px-5 py-4">
          <p className="text-xs text-slate-600">Showing {visible.length} of {users.length} loaded accounts. Load more to see additional users.</p>
          <button type="button" disabled={!nextCursor || loadingMore || loading} onClick={() => nextCursor && void load(nextCursor)} className="admin-secondary-button">{loadingMore ? 'Loading…' : nextCursor ? 'Load more' : 'All pages loaded'}</button>
        </div>
      </div>}
  </div>;
}
