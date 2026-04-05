import { redirect } from 'next/navigation';

import { HelpPageClient } from '@/components/help/HelpPageClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function HelpPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return <HelpPageClient />;
}
