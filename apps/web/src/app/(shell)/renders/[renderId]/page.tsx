import { redirect } from 'next/navigation';

import { RenderStatusClient } from '@/components/create/RenderStatusClient';
import { Card } from '@/components/ui/Card';
import { getUserIdFromCookie } from '@/lib/session';

export default async function RenderStatusPage({ params }: { params: Promise<{ renderId: string }> }) {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const { renderId } = await params;

  return (
    <div className="space-y-4 py-2 sm:py-4">
      <Card>
        <p className="text-sm text-muted">Render Status</p>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text">Tracking video generation</h1>
      </Card>
      <RenderStatusClient renderId={renderId} userId={userId} />
    </div>
  );
}
