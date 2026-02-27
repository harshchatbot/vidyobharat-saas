import { redirect } from 'next/navigation';

import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
import { getUserIdFromCookie } from '@/lib/session';

export default async function DashboardPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/projects');
  }

  const projects = await api.listProjects(userId);

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <p className="text-sm text-muted">Projects</p>
        <p className="text-3xl font-semibold">{projects.length}</p>
      </Card>
      <Card>
        <p className="text-sm text-muted">Active renders</p>
        <p className="text-3xl font-semibold">{projects.length > 0 ? 1 : 0}</p>
      </Card>
      <Card>
        <p className="text-sm text-muted">Plan</p>
        <p className="text-3xl font-semibold">Starter</p>
      </Card>
    </div>
  );
}
