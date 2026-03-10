import { redirect } from 'next/navigation';

import { SettingsClient } from '@/components/account/SettingsClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function SettingsPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <SettingsClient userId={userId} />;
}
