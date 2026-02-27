import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { getUserIdFromCookie } from '@/lib/session';

export default async function SettingsPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card>
        <h1 className="font-heading text-2xl font-bold text-text">Settings</h1>
        <p className="mt-1 text-sm text-muted">Workspace preferences and account controls.</p>
      </Card>

      <Card className="space-y-3">
        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Theme</p>
          <p className="mt-1 text-xs text-muted">Use the light/dark toggle in the top navigation.</p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
          <p className="text-sm font-semibold text-text">Notifications</p>
          <p className="mt-1 text-xs text-muted">Email notifications are currently disabled in MVP mode.</p>
        </div>
      </Card>
    </div>
  );
}
