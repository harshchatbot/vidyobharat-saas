import { redirect } from 'next/navigation';

import { AuthFormClient } from '@/components/auth/AuthFormClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function SignupPage() {
  const userId = await getUserIdFromCookie();
  if (userId) {
    redirect('/dashboard');
  }

  return <AuthFormClient mode="signup" />;
}
