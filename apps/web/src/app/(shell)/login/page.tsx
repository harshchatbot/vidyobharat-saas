import { redirect } from 'next/navigation';

import { AuthFormClient } from '@/components/auth/AuthFormClient';
import { getUserIdFromCookie } from '@/lib/session';
import { safeReturnPath } from '@/lib/auth-return';

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeReturnPath(params.next);
  const userId = await getUserIdFromCookie();
  if (userId) redirect(next);

  return <AuthFormClient mode="login" next={next} />;
}
