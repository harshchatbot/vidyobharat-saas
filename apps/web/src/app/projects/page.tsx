import { ProjectsClient } from '@/components/projects/ProjectsClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { getUserIdFromCookie } from '@/lib/session';
import { api } from '@/lib/api';

import { mockLoginAction } from './actions';

export default async function ProjectsPage() {
  const userId = await getUserIdFromCookie();
  const projects = userId ? await api.listProjects(userId, 10) : [];

  return (
    <div className="space-y-6">
      {!userId && (
        <Card>
          <p className="mb-3 text-sm text-muted">Authenticate for MVP using mock login.</p>
          <form action={mockLoginAction} className="grid gap-3 sm:max-w-sm">
            <Input name="email" type="email" placeholder="demo@vidyobharat.in" />
            <p className="text-xs text-muted">No password required in MVP. Any valid email works.</p>
            <Button type="submit">Mock Login</Button>
          </form>
        </Card>
      )}
      {userId && <ProjectsClient initialProjects={projects} userId={userId} />}
    </div>
  );
}
