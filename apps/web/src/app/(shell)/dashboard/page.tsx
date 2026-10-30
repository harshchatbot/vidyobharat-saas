import Link from 'next/link';
import { ArrowRight, Film, ShieldCheck } from 'lucide-react';
import { getUserEmailFromCookie, getUserIdFromCookie, getUserNameFromCookie } from '@/lib/session';

export const metadata = {
  title: 'My Studio',
  description: 'Your browser-first RangManch AI video editing studio.',
};

export default async function DashboardPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) return <main className="mx-auto max-w-2xl px-6 py-24 text-center"><h1 className="text-3xl font-semibold">Sign in to open My Studio</h1><Link className="mt-6 inline-flex rounded-xl bg-violet-500 px-5 py-3 font-semibold text-white" href="/login?next=%2Fdashboard">Sign in</Link></main>;
  const name = await getUserNameFromCookie();
  const email = await getUserEmailFromCookie();
  return (
    <main className="mx-auto max-w-5xl px-5 py-12 sm:px-8 lg:py-20">
      <header className="max-w-2xl"><p className="text-sm font-medium text-violet-500">My Studio</p><h1 className="mt-3 text-4xl font-semibold tracking-tight text-text sm:text-5xl">Make something worth sharing{name ? `, ${name.split(' ')[0]}` : ''}.</h1><p className="mt-5 text-base leading-7 text-muted">A calm, browser-first space for turning photos into short videos. Your editing session stays local unless you explicitly use a server-backed feature.</p></header>
      <section className="mt-12 grid gap-5 sm:grid-cols-2">
        <Link href="/editor" className="group rounded-3xl border border-primary/20 bg-primary/10 p-7 transition hover:-translate-y-0.5 hover:bg-primary/15"><div className="flex items-center justify-between"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-primary text-primary-contrast"><Film className="h-5 w-5" /></span><ArrowRight className="h-5 w-5 text-primary transition group-hover:translate-x-1" /></div><h2 className="mt-12 text-2xl font-semibold text-text">Create a new reel</h2><p className="mt-2 text-sm leading-6 text-muted">Upload photos, describe an edit, preview it, and export an MP4 in your browser.</p></Link>
        <div className="rounded-3xl border border-border bg-surface p-7"><div className="flex items-center gap-3 text-sm font-medium text-text"><ShieldCheck className="h-5 w-5 text-primary" />Account</div><p className="mt-6 text-sm text-muted">{email ?? 'Signed-in creator'}</p><p className="mt-2 text-xs leading-5 text-muted">No cloud project library is created by this page. Browser drafts and exports remain under your control.</p><Link href="/profile" className="mt-6 inline-flex text-sm font-medium text-primary hover:underline">Account settings <ArrowRight className="ml-1 h-4 w-4" /></Link></div>
      </section>
      <p className="mt-10 text-xs text-muted">AI Copilot usage and limits are shown where a server-backed AI request is available. Browser-local editing does not consume a cloud generation allowance.</p>
    </main>
  );
}
