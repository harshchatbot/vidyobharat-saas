'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, FileSliders, LayoutTemplate, LogOut, Users, Music2, UserRoundCheck } from 'lucide-react';

const links = [
  { href: '/admin', label: 'Overview', icon: BarChart3 },
  { href: '/admin/users', label: 'Registered users', icon: UserRoundCheck },
  { href: '/admin/guests', label: 'Guest sessions', icon: Users },
  { href: '/admin/settings', label: 'Settings', icon: FileSliders },
  { href: '/admin/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/admin/audio-library', label: 'Audio library', icon: Music2 },
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
    <div className="admin-studio min-h-[calc(100vh-5rem)] bg-[#fff9ed] text-[#292034]">
      <div className="mx-auto flex max-w-[1600px] flex-col md:min-h-[calc(100vh-5rem)] md:flex-row">
        <aside className="border-b border-[#40324b] bg-[#efe2f9] md:w-64 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-5 py-4 md:block">
            <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#73518f]">RangManch AI</p><h1 className="mt-1 text-lg font-semibold">Admin Studio</h1></div>
            <button onClick={logout} className="grid h-11 w-11 place-items-center rounded-lg text-[#473850] hover:bg-[#e2cafa] md:hidden" aria-label="Log out"><LogOut className="h-4 w-4" /></button>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1" aria-label="Admin navigation">
            {links.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));
              return <Link key={href} href={href} className={`flex min-h-11 shrink-0 items-center gap-3 rounded-lg px-3 text-sm font-medium transition ${active ? 'bg-[#ffdb77] text-[#292034] font-extrabold border border-[#40324b] shadow-[2px_2px_0_#40324b]' : 'text-[#473850] hover:bg-[#e2cafa] hover:text-[#292034]'}`}><Icon className="h-4 w-4" />{label}</Link>;
            })}
          </nav>
          <button onClick={logout} className="mx-3 mt-6 hidden min-h-11 w-[calc(100%-1.5rem)] items-center gap-3 rounded-lg px-3 text-sm text-[#473850] hover:bg-[#f9dce8] hover:text-[#7b2545] md:flex"><LogOut className="h-4 w-4" />Log out</button>
        </aside>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
