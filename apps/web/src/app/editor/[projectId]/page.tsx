import { notFound, redirect } from 'next/navigation';

import { EditorClient } from '@/components/editor/EditorClient';
import { getUserIdFromCookie } from '@/lib/session';
import { api } from '@/lib/api';

export default async function EditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/projects');
  }

  const detail = await api.getProject(projectId, userId, 'no-store').catch(() => null);
  if (!detail) {
    notFound();
  }

  return <EditorClient project={detail.project} initialRenders={detail.renders} userId={userId} />;
}
