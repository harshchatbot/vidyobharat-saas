'use client';

import Link from 'next/link';
import { FolderOpen, Link2 } from 'lucide-react';

import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Project } from '@/types/api';

export function ActiveProjectBar({
  project,
  description = 'New outputs from this workspace will be attached to the active project.',
}: {
  project: Project;
  description?: string;
}) {
  return (
    <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.44)] px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Active project</Badge>
            <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted">
              <Link2 className="h-3.5 w-3.5" />
              Project context
            </span>
          </div>
          <p className="mt-2 truncate text-sm font-semibold text-text">{project.title}</p>
          <p className="mt-1 text-xs text-muted">{description}</p>
        </div>
        <Link href={`/projects/${project.id}`}>
          <Button variant="secondary" className="gap-2">
            <FolderOpen className="h-4 w-4" />
            Back to project
          </Button>
        </Link>
      </div>
    </div>
  );
}
