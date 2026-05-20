'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Play, Calendar, Tag } from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';

interface StoryboardProject {
  id: string;
  adCategory: string;
  businessBrief: string;
  workflowState: string;
  productionStatus: string | null;
  thumbnailUrl: string | null;
  createdAt: string | null;
  completedAt: string | null;
}

type Props = {
  userId: string;
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  completed: { label: 'Completed', color: 'hsl(var(--color-success))' },
  production_failed: { label: 'Failed', color: 'hsl(var(--color-error))' },
  in_production: { label: 'In Production', color: 'hsl(var(--color-accent-cyan))' },
  script_approved: { label: 'Script Phase', color: 'hsl(var(--color-accent-amber))' },
  storyboard_awaiting_approval: { label: 'Storyboard Phase', color: 'hsl(var(--color-primary))' },
  initialized: { label: 'Starting', color: 'hsl(var(--color-muted))' },
};

const CATEGORY_LABELS: Record<string, string> = {
  ugc_testimonial: 'UGC Testimonial',
  product_demo_lifestyle: 'Product Demo',
  founder_talking_head: 'Founder Story',
  problem_solution: 'Problem Solution',
  before_after: 'Before & After',
  lifestyle: 'Lifestyle',
  tutorial: 'Tutorial',
};

function getStatus(state: string) {
  return STATUS_CONFIG[state] || { label: 'In Progress', color: 'hsl(var(--color-accent-cyan))' };
}

function getCategoryLabel(key: string) {
  return CATEGORY_LABELS[key] || key.replace(/_/g, ' ');
}

export function StoryboardProjects({ userId }: Props) {
  const router = useRouter();
  const [projects, setProjects] = useState<StoryboardProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await api.listStoryboardProjects(userId);
        setProjects(result.projects || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load ad projects');
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i} className="rangmanch-studio-panel h-24 border-none bg-transparent animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rangmanch-studio-panel border-none bg-transparent p-4">
        <p className="text-sm text-red-400">{error}</p>
      </Card>
    );
  }

  if (projects.length === 0) {
    return (
      <Card className="rangmanch-studio-panel border-none bg-transparent p-8 text-center">
        <div className="space-y-2">
          <Play className="h-8 w-8 mx-auto text-[hsl(var(--color-accent)/0.5)]" />
          <p className="text-sm text-muted">No ad projects yet</p>
          <p className="text-xs text-[hsl(var(--color-accent))]">
            <Link href="/create/avatar" className="underline hover:no-underline">
              Create your first ad
            </Link>
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {projects.map(project => {
        const status = getStatus(project.workflowState);
        const categoryLabel = getCategoryLabel(project.adCategory);
        const briefPreview = project.businessBrief.slice(0, 80);

        return (
          <div key={project.id} className="glass-card p-5 cursor-pointer mb-3">
            <div className="flex items-start gap-4">
              {/* Thumbnail */}
              {project.thumbnailUrl && (
                <div className="h-24 w-24 rounded-lg overflow-hidden flex-shrink-0 bg-[hsl(var(--color-bg)/0.5)]">
                  <img
                    src={project.thumbnailUrl}
                    alt={project.businessBrief}
                    className="w-full h-full object-cover hover:scale-105 transition"
                  />
                </div>
              )}

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1">
                    <p className="font-semibold text-text line-clamp-2">{briefPreview}</p>
                    <div className="flex items-center gap-2 mt-1.5">
                      <Tag className="h-3.5 w-3.5 flex-shrink-0" style={{ color: status.color }} />
                      <span className="text-xs px-2 py-1 rounded-full" style={{ background: `${status.color}20`, color: status.color }}>
                        {categoryLabel}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs px-2 py-1 rounded-full font-semibold flex-shrink-0" style={{ background: `${status.color}20`, color: status.color }}>
                    {status.label}
                  </span>
                </div>

                {/* Timeline */}
                <div className="flex items-center gap-4 text-xs text-muted mb-3">
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {project.createdAt
                        ? new Date(project.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: '2-digit',
                          })
                        : 'Unknown'}
                    </span>
                  </div>
                </div>

                {/* Button */}
                <button
                  onClick={() => router.push(`/story-ad?resumeProjectId=${project.id}`)}
                  className="glow-button text-xs px-4 py-1.5 mt-3 inline-flex items-center gap-1"
                >
                  {project.workflowState === 'completed' ? 'View' : 'Resume →'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
