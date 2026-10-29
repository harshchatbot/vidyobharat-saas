'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LockKeyhole } from 'lucide-react';

import { signInWithPassword } from '@/lib/firebase-auth';

export function AdminLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault(); setLoading(true); setError('');
    try {
      const session = await signInWithPassword(email.trim(), password);
      const response = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-RangManch-Admin-CSRF': '1' },
        body: JSON.stringify({ idToken: session.idToken }), cache: 'no-store',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof body?.detail === 'string' ? body.detail : 'Admin access denied.');
      router.replace('/admin'); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Admin sign-in failed.'); }
    finally { setLoading(false); }
  }
  return (
    <main className="grid min-h-[calc(100vh-5rem)] place-items-center bg-[#0a0a0f] px-4 py-12 text-white">
      <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-white/10 bg-[#111118] p-6 shadow-2xl sm:p-8">
        <div className="mb-7 grid h-12 w-12 place-items-center rounded-xl bg-amber-400 text-slate-950"><LockKeyhole className="h-6 w-6" /></div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">Restricted access</p>
        <h1 className="mt-2 text-3xl font-semibold">Admin sign in</h1>
        <p className="mt-2 text-sm text-slate-400">Use an explicitly allowlisted Firebase account.</p>
        <label className="mt-7 block text-sm text-slate-300">Email<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20" /></label>
        <label className="mt-4 block text-sm text-slate-300">Password<input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-2 min-h-11 w-full rounded-lg border border-white/10 bg-white/5 px-3 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-500/20" /></label>
        {error ? <p role="alert" className="mt-4 rounded-lg bg-red-500/10 p-3 text-sm text-red-300">{error}</p> : null}
        <button disabled={loading} className="mt-6 min-h-11 w-full rounded-lg bg-amber-400 px-4 font-semibold text-slate-950 hover:bg-amber-300 disabled:opacity-60">{loading ? 'Verifying…' : 'Sign in securely'}</button>
        <p className="mt-4 text-xs leading-5 text-slate-500">Sessions expire after approximately 55 minutes and require reauthentication.</p>
      </form>
    </main>
  );
}
