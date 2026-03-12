'use client';

import { useMemo, useState } from 'react';
import { FolderPlus, MoveRight } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Dropdown } from '@/components/ui/Dropdown';
import { Modal } from '@/components/ui/Modal';
import type { Project } from '@/types/api';

export function ProjectAssignmentDialog({
  open,
  onClose,
  projects,
  currentProjectId,
  assetLabel,
  onConfirm,
  submitting = false,
}: {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  currentProjectId?: string | null;
  assetLabel: string;
  onConfirm: (projectId: string) => Promise<void> | void;
  submitting?: boolean;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(currentProjectId || '');
  const currentProject = useMemo(
    () => projects.find((project) => project.id === currentProjectId) ?? null,
    [currentProjectId, projects],
  );

  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-5">
        <div className="space-y-2">
          <div className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.56)]">
            <FolderPlus className="h-5 w-5 text-[hsl(var(--color-accent))]" />
          </div>
          <h3 className="text-2xl font-bold text-text">Move asset to project</h3>
          <p className="text-sm text-muted">
            Attach <span className="font-semibold text-text">{assetLabel}</span> to an existing project so it stays grouped with related prompts, scripts, and outputs.
          </p>
        </div>

        <div className="rounded-[20px] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)] px-4 py-3 text-sm text-muted">
          Current project: <span className="font-semibold text-text">{currentProject?.title || 'Not assigned yet'}</span>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-text">Destination project</label>
          <Dropdown value={selectedProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
            <option value="">Select project</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.title}
              </option>
            ))}
          </Dropdown>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            className="gap-2"
            onClick={() => void onConfirm(selectedProjectId)}
            disabled={!selectedProjectId || submitting}
          >
            <MoveRight className="h-4 w-4" />
            {submitting ? 'Saving...' : currentProjectId ? 'Move to project' : 'Add to project'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
