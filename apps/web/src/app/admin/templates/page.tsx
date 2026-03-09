import { redirect } from 'next/navigation';

import { AdminTemplatesClient } from '@/components/templates/AdminTemplatesClient';
import { getUserIdFromCookie } from '@/lib/session';

export default async function AdminTemplatesPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) redirect('/login');
  return <AdminTemplatesClient userId={userId} />;
}
