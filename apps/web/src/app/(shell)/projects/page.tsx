import { ProjectsClient } from '@/components/projects/ProjectsClient';
import { Button } from '@/components/ui/Button';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { getUserIdFromCookie } from '@/lib/session';
import { api } from '@/lib/api';
import Link from 'next/link';

export default async function ProjectsPage() {
  const userId = await getUserIdFromCookie();
  const projects = userId ? await api.listProjects(userId, 0, 45_000).catch(() => []) : [];

  return (
    <div className="space-y-6">
      {!userId && (
        <div className="rangmanch-studio-panel rounded-[28px] px-5 py-6 sm:px-6">
          <StudioPageHeader
            eyebrow="Projects"
            title="Save drafts after you sign in"
            description="Projects let you keep scripts, voice preferences, and working concepts organized before you move into final renders."
            actions={
              <>
                <Link href="/login"><Button>Login</Button></Link>
                <Link href="/signup"><Button variant="secondary">Sign Up</Button></Link>
              </>
            }
            className="border-none bg-transparent px-0 py-0 shadow-none"
          />
          <div className="flex flex-wrap gap-2">
            <p className="text-sm text-muted">Please login or create your account to manage projects.</p>
          </div>
        </div>
      )}
      {userId && <ProjectsClient initialProjects={projects} userId={userId} />}
    </div>
  );
}
