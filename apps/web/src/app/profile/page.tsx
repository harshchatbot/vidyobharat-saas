import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { getUserEmailFromCookie, getUserIdFromCookie, getUserNameFromCookie } from '@/lib/session';

export default async function ProfilePage() {
  const userId = await getUserIdFromCookie();
  const userName = await getUserNameFromCookie();
  const userEmail = await getUserEmailFromCookie();

  if (!userId) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <h1 className="font-heading text-2xl font-bold text-text">Profile</h1>
        <p className="mt-1 text-sm text-muted">Basic account details for your RangManch AI workspace.</p>
      </Card>

      <Card className="space-y-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Name</p>
          <p className="text-sm font-medium text-text">{userName ?? 'User'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Email</p>
          <p className="text-sm font-medium text-text">{userEmail ?? 'No email set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">User ID</p>
          <p className="break-all text-sm font-medium text-text">{userId}</p>
        </div>
      </Card>
    </div>
  );
}
