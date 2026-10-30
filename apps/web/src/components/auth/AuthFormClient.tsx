'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Check, Film, LoaderCircle, ShieldCheck } from 'lucide-react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Input } from '@/components/ui/Input';
import { getProfileFields, getUserForIdToken, persistAppSession, signInWithGooglePopup, signInWithPassword, signOutFirebaseUser, signUpWithPassword } from '@/lib/firebase-auth';
import { safeReturnPath } from '@/lib/auth-return';

type Props = { mode: 'login' | 'signup'; next?: string };

export function AuthFormClient({ mode, next = '/dashboard' }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const isLogin = mode === 'login';
  const returnPath = safeReturnPath(next);
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(params.get('error') ?? '');
  const [message, setMessage] = useState('');

  async function finish(idToken: string) {
    const user = await getUserForIdToken(idToken);
    if (isLogin && !user.emailVerified) {
      await signOutFirebaseUser();
      throw new Error('Please verify your email before signing in.');
    }
    const profile = getProfileFields(user);
    await persistAppSession({ accessToken: idToken, userId: user.id, ...profile });
    router.replace(returnPath);
    router.refresh();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setError(''); setMessage('');
    if (!isLogin && name.trim().length < 2) { setError('Enter your name to create an account.'); return; }
    if (!isLogin && password !== confirm) { setError('Passwords do not match.'); return; }
    setSubmitting(true);
    try {
      const session = isLogin ? await signInWithPassword(email.trim(), password) : await signUpWithPassword(email.trim(), password, name.trim());
      if (!session) { setMessage('Check your inbox to verify your email, then sign in.'); setSubmitting(false); return; }
      await finish(session.idToken);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Authentication failed. Please try again.'); setSubmitting(false); }
  }

  async function google() {
    if (submitting) return;
    setSubmitting(true); setError('');
    try { const session = await signInWithGooglePopup(); await finish(session.idToken); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Google sign-in failed. Please try again.'); setSubmitting(false); }
  }

  return (
    <main className="min-h-screen bg-[#0b0b10] text-white">
      <div className="mx-auto grid min-h-screen max-w-6xl lg:grid-cols-[1.05fr_0.95fr]">
        <section className="hidden flex-col justify-between border-r border-white/10 p-10 lg:flex">
          <BrandLogo href="/" variant="full" size="md" />
          <div className="max-w-lg space-y-6"><p className="text-xs font-semibold uppercase tracking-[0.24em] text-violet-300">RangManch AI · Video editor</p><h1 className="text-5xl font-semibold leading-[1.05] tracking-tight">Turn your photos into a reel worth sharing.</h1><p className="max-w-md text-base leading-7 text-white/60">Edit in your browser with local AI, precise timing, music, transitions, and a clean MP4 export.</p><div className="grid gap-3 text-sm text-white/70">{['Browser-first editing', 'AI Copilot when you need it', 'Your files stay in your editing session'].map((item) => <div key={item} className="flex items-center gap-2"><Check className="h-4 w-4 text-violet-300" />{item}</div>)}</div></div>
          <p className="text-xs text-white/35">A focused studio for short-form video.</p>
        </section>
        <section className="flex items-center px-5 py-8 sm:px-10"><div className="mx-auto w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden"><BrandLogo href="/" variant="full" size="sm" /><Link href="/" className="text-sm text-white/60">Back home</Link></div>
          <div className="mb-8 space-y-3"><div className="inline-flex items-center gap-2 text-sm text-violet-200"><Film className="h-4 w-4" />{isLogin ? 'Welcome back' : 'Start creating'}</div><h2 className="text-3xl font-semibold tracking-tight">{isLogin ? 'Sign in to My Studio' : 'Create your creator account'}</h2><p className="text-sm leading-6 text-white/55">{isLogin ? 'Continue editing where you left off.' : 'Use Google or email. Verify your email before your first password sign-in.'}</p></div>
          {error ? <div role="alert" className="mb-4 rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}{message ? <div role="status" className="mb-4 rounded-xl border border-violet-300/20 bg-violet-300/10 px-4 py-3 text-sm text-violet-100">{message}</div> : null}
          <button type="button" onClick={() => void google()} disabled={submitting} className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-white/15 bg-white/[0.06] text-sm font-medium transition hover:bg-white/[0.1] disabled:cursor-not-allowed disabled:opacity-60"><span className="grid h-6 w-6 place-items-center rounded-full bg-white text-xs font-bold text-[#4285f4]">G</span>Continue with Google</button>
          <div className="my-6 flex items-center gap-3 text-xs text-white/35"><span className="h-px flex-1 bg-white/10" />or use email<span className="h-px flex-1 bg-white/10" /></div>
          <form onSubmit={submit} className="space-y-3">{!isLogin ? <Input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required className="min-h-12 rounded-xl border-white/10 bg-white/[0.04]" /> : null}<Input aria-label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required className="min-h-12 rounded-xl border-white/10 bg-white/[0.04]" /><Input aria-label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" required minLength={8} className="min-h-12 rounded-xl border-white/10 bg-white/[0.04]" />{!isLogin ? <Input aria-label="Confirm password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" required minLength={8} className="min-h-12 rounded-xl border-white/10 bg-white/[0.04]" /> : null}<button type="submit" disabled={submitting} className="mt-2 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-violet-400 px-4 text-sm font-semibold text-[#160d24] transition hover:bg-violet-300 disabled:opacity-60">{submitting ? <><LoaderCircle className="h-4 w-4 animate-spin" />{isLogin ? 'Signing you in…' : 'Creating your account…'}</> : isLogin ? 'Sign in' : 'Create account'}</button></form>
          <div className="mt-8 flex items-center justify-between text-sm text-white/45"><span>{isLogin ? 'New to RangManch?' : 'Already have an account?'}</span><Link href={`${isLogin ? '/signup' : '/login'}?next=${encodeURIComponent(returnPath)}`} className="font-medium text-violet-200 hover:text-white">{isLogin ? 'Create account' : 'Sign in'} <ArrowRight className="inline h-3.5 w-3.5" /></Link></div><p className="mt-8 flex items-center justify-center gap-2 text-center text-xs text-white/30"><ShieldCheck className="h-3.5 w-3.5" />Secure Firebase authentication</p>
        </div></section>
      </div>
    </main>
  );
}
