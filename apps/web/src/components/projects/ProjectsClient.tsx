'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import type { Project } from '@/types/api';

type Props = {
  initialProjects: Project[];
  userId: string;
};

export function ProjectsClient({ initialProjects, userId }: Props) {
  const [projects, setProjects] = useState(initialProjects);
  const [title, setTitle] = useState('');
  const [script, setScript] = useState('');
  const [loading, setLoading] = useState(false);

  const createProject = async () => {
    if (!title.trim()) return;
    setLoading(true);
    try {
      const project = await api.createProject(
        {
          user_id: userId,
          title,
          script,
          language: 'hi-IN',
          voice: 'Aarav',
          template: 'clean-corporate',
        },
        userId,
      );
      setProjects((prev) => [project, ...prev]);
      setTitle('');
      setScript('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="mb-3 text-lg font-semibold">Create Project</h2>
        <div className="grid gap-3">
          <Input placeholder="Project title" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            placeholder="Script draft"
            value={script}
            onChange={(e) => setScript(e.target.value)}
            rows={4}
          />
          <Button onClick={createProject} disabled={loading}>{loading ? 'Creating...' : 'Create Project'}</Button>
        </div>
      </Card>

      <div className="grid gap-3">
        {projects.map((project) => (
          <Card key={project.id} className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div>
              <p className="font-medium">{project.title}</p>
              <p className="text-sm text-muted">{project.language} · {project.voice}</p>
            </div>
            <Link href={`/editor/${project.id}`} className="text-sm font-semibold text-accent">Open Editor</Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
