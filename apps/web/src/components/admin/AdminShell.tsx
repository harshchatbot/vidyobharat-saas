'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, FileSliders, LayoutTemplate, LogOut, Users } from 'lucide-react';

const links = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/guests', label: 'Guest sessions', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: FileSliders },
  { href: '/admin/templates', label: 'Templates', icon: LayoutTemplate },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  if (pathname === '/admin/login') return <>{children}</>;
  async function logout() {
    await fetch('/api/admin/session', {
      method: 'DELETE', headers: { 'X-RangManch-Admin-CSRF': '1' }, cache: 'no-store',
    });
    router.replace('/admin/login');
    router.refresh();
  }
  return (
    <div className="min-h-[calc(100vh-5rem)] bg-[#0a0a0f] text-slate-100">
      <div className="mx-auto flex max-w-[1600px] flex-col md:min-h-[calc(100vh-5rem)] md:flex-row">
        <aside className="border-b border-white/10 bg-[#111118] md:w-64 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-5 py-4 md:block">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-400">RangManch AI</p><h1 className="mt-1 text-lg font-semibold">Admin Studio</h1></div>
            <button onClick={logout} className="grid h-11 w-11 place-items-center rounded-lg text-slate-400 hover:bg-white/5 hover:text-white md:hidden" aria-label="Log out"><LogOut className="h-4 w-4" /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1" aria-label="Admin navigation">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
              return <Link key={href} href={href} className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? 'bg-violet-500/15 text-violet-300' : 'text-slate-400 hover:bg-white/5 hover:text-white'}`}><Icon className="h-4 w-4" />{label}</Link>;
            })}
          </nav>
          <button onClick={logout} className="mx-3 mt-6 hidden min-h-11 w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg px-3 text-sm text-slate-400 hover:bg-red-500/10 hover:text-red-300 md:flex"><LogOut className="h-4 w-4" />Log out</button>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
