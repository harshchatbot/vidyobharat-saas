import { redirect } from 'next/navigation';
import { safeReturnPath } from '@/lib/auth-return';

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = safeReturnPath((await searchParams).next, '/admin');
  const destination = requested.startsWith('/admin') && requested !== '/admin/login' ? requested : '/admin';
  redirect('/login?next=' + encodeURIComponent(destination));
}

export const dynamic = 'force-dynamic';
