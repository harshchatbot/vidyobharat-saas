'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Clapperboard, Languages, Mic2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { StatusChip } from '@/components/ui/StatusChip';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { Textarea } from '@/components/ui/Textarea';
import { api } from '@/lib/api';
import type { Project } from '@/types/api';

type Props = {
  initialProjects: Project[];
  userId: string;
};

function gradientForProject(index: number) {
  const gradients = [
    'radial-gradient(circle at top right, hsl(var(--color-accent)/0.22), transparent 40%), linear-gradient(155deg, hsl(var(--color-surface)/0.92), hsl(var(--color-elevated)/0.82))',
    'radial-gradient(circle at top left, hsl(190 78% 56% / 0.18), transparent 42%), linear-gradient(155deg, hsl(var(--color-surface)/0.92), hsl(var(--color-elevated)/0.82))',
    'radial-gradient(circle at 80% 20%, hsl(330 72% 62% / 0.14), transparent 42%), linear-gradient(155deg, hsl(var(--color-surface)/0.92), hsl(var(--color-elevated)/0.82))',
  ];
  return gradients[index % gradients.length];
}

function formatRelativeTime(value: string) {
  const created = new Date(value).getTime();
  const diffMs = Date.now() - created;
  const diffHours = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60)));
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  return `${diffMonths}mo ago`;
}

function resolveProjectTimestamp(project: Project) {
  return project.last_activity_at || project.updated_at || project.created_at;
}

function summarizeScript(script?: string | null) {
  const clean = script?.trim() ?? '';
  if (!clean) {
    return {
      preview: 'No script draft added yet. Use the editor to build your first scene flow.',
      words: 0,
      blocks: 0,
    };
  }
  return {
    preview: clean,
    words: clean.split(/\s+/).filter(Boolean).length,
    blocks: clean.split(/\n{2,}/).filter((block) => block.trim().length > 0).length,
  };
}

export function ProjectsClient({ initialProjects, userId }: Props) {
  const router = useRouter();
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
    <div className="rangmanch-page-stack">
      <StudioPageHeader
        eyebrow="Projects"
        title="Build and revisit working concepts"
        description="Store scripts, voice choices, and early creative directions in one calmer workspace before moving into final generation."
        actions={
          <Link href="/create">
            <Button className="gap-2">
              New video
              <Sparkles className="h-4 w-4" />
            </Button>
          </Link>
        }
      />

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div id="new-project" className="rangmanch-studio-panel scroll-mt-24 space-y-4 rounded-[28px] p-5 sm:p-6">
          <div className="space-y-1">
            <p className="rangmanch-section-eyebrow">New project</p>
            <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Start a new working file</h2>
            <p className="text-sm leading-6 text-muted">
              Capture a title, rough script, and keep iterating before sending it into the studio.
            </p>
          </div>
          <div className="space-y-3">
            <Input placeholder="Project title" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Textarea
              placeholder="Add your draft, narration notes, CTA, or scene direction..."
              value={script}
              onChange={(e) => setScript(e.target.value)}
              rows={7}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={createProject} disabled={loading || !title.trim()}>
              {loading ? 'Creating...' : 'Create project'}
            </Button>
            <StatusChip variant="default">Draft-first workflow</StatusChip>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="rangmanch-section-eyebrow">Project library</p>
              <h2 className="font-heading text-2xl font-extrabold tracking-tight text-text">Recent working files</h2>
            </div>
            <StatusChip variant="default">{projects.length} saved</StatusChip>
          </div>

          {projects.length === 0 ? (
            <div className="rangmanch-studio-panel rounded-[28px] px-5 py-8 text-center sm:px-6">
              <p className="font-heading text-xl font-extrabold text-text">No projects yet</p>
              <p className="mt-2 text-sm text-muted">Create your first working file and it will appear here for quick editing.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {projects.map((project, index) => (
                (() => {
                  const scriptSummary = summarizeScript(project.script);
                  return (
                <article
                  key={project.id}
                  className="rangmanch-poster-card group rounded-[22px] p-3.5"
                  style={{ background: gradientForProject(index) }}
                >
                  <div className="flex h-full flex-col gap-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusChip variant="success">Workspace</StatusChip>
                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">
                            Updated {formatRelativeTime(resolveProjectTimestamp(project))}
                          </span>
                        </div>
                        <div>
                          <h3 className="truncate font-heading text-lg font-extrabold tracking-tight text-text">{project.title}</h3>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-muted">
                          {project.last_prompt_snippet || scriptSummary.preview}
                        </p>
                      </div>
                    </div>
                    {project.last_output_thumbnail_url ? (
                      <img
                        src={project.last_output_thumbnail_url}
                        alt={project.title}
                        className="h-12 w-12 rounded-[14px] border border-[hsl(var(--color-border)/0.7)] object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg)/0.32)] text-text backdrop-blur-md">
                        <Clapperboard className="h-4 w-4" />
                      </span>
                    )}
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-bg)/0.22)] px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Draft</p>
                        <p className="mt-0.5 text-xs font-semibold text-text">{scriptSummary.words} words</p>
                      </div>
                      <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-bg)/0.22)] px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Scenes</p>
                        <p className="mt-0.5 text-xs font-semibold text-text">{scriptSummary.blocks || 1}</p>
                      </div>
                      <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-bg)/0.22)] px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Voice</p>
                        <p className="mt-0.5 text-xs font-semibold text-text">{project.voice}</p>
                      </div>
                      <div className="rounded-[14px] border border-[hsl(var(--color-border)/0.45)] bg-[hsl(var(--color-bg)/0.22)] px-2.5 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Outputs</p>
                        <p className="mt-0.5 text-xs font-semibold text-text">{project.image_count ?? 0} img · {project.video_count ?? 0} vid</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5 text-[11px] text-muted">
                      <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.5)] bg-[hsl(var(--color-bg)/0.22)] px-2 py-1">
                        <Languages className="h-3.5 w-3.5" />
                        {project.language}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.5)] bg-[hsl(var(--color-bg)/0.22)] px-2 py-1">
                        <Mic2 className="h-3.5 w-3.5" />
                        {project.voice}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[hsl(var(--color-border)/0.5)] bg-[hsl(var(--color-bg)/0.22)] px-2 py-1">
                        {project.template || 'Freeform'}
                      </span>
                    </div>

                    <div className="mt-auto flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => router.push(`/projects/${project.id}`)}
                        className="text-xs font-semibold text-[hsl(var(--color-accent))]"
                      >
                        Open workspace
                      </button>
                      <button
                        type="button"
                        onClick={() => router.push(`/create?projectId=${project.id}`)}
                        className="inline-flex items-center rounded-full border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-bg)/0.32)] px-2.5 py-1 text-xs font-semibold text-text transition group-hover:border-[hsl(var(--color-accent)/0.45)]"
                      >
                        Continue
                      </button>
                    </div>
                  </div>
                </article>
                  );
                })()
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
