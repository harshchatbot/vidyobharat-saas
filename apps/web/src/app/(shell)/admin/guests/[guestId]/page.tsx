import { AdminGuestDetailClient } from '@/components/admin/AdminGuestsClient';

export default async function AdminGuestPage({ params }: { params: Promise<{ guestId: string }> }) {
  const { guestId } = await params;
  return <AdminGuestDetailClient guestId={guestId} />;
}
