import { redirect } from 'next/navigation';

import { AuthFormClient } from '@/components/auth/AuthFormClient';
import { getUserIdFromCookie } from '@/lib/session';
import { safeReturnPath } from '@/lib/auth-return';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const userId = await getUserIdFromCookie();
  // An app-session cookie is not proof of admin authorization. Keep the
  // unified login visible for admin destinations so a stale creator cookie
  // cannot create a redirect loop.
  if (userId && next !== '/admin') redirect(next);

  return <AuthFormClient mode="login" next={next} />;
}
