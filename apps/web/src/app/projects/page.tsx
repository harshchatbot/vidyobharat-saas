import { ProjectsClient } from '@/components/projects/ProjectsClient';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getUserIdFromCookie } from '@/lib/session';
import { api } from '@/lib/api';
import Link from 'next/link';

export default async function ProjectsPage() {
  const userId = await getUserIdFromCookie();
  const projects = userId ? await api.listProjects(userId, 10) : [];

  return (
    <div className="space-y-6">
      {!userId && (
        <Card>
          <p className="mb-3 text-sm text-muted">Please login or create your account to manage projects.</p>
          <div className="flex flex-wrap gap-2">
            <Link href="/login"><Button>Login</Button></Link>
            <Link href="/signup"><Button variant="secondary">Sign Up</Button></Link>
          </div>
        </Card>
      )}
      {userId && <ProjectsClient initialProjects={projects} userId={userId} />}
    </div>
  );
}
