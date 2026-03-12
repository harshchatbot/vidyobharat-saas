import { notFound, redirect } from 'next/navigation';

import { ProjectWorkspaceClient } from '@/components/projects/ProjectWorkspaceClient';
import { getUserIdFromCookie } from '@/lib/session';
import { api } from '@/lib/api';

export default async function ProjectWorkspacePage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/projects');
  }

  const detail = await api.getProject(projectId, userId, 'no-store').catch(() => null);
  if (!detail) {
    notFound();
  }

  return <ProjectWorkspaceClient detail={detail} userId={userId} />;
}
