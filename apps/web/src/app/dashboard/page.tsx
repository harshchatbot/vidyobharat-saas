import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Grid } from '@/components/ui/Grid';
import { api } from '@/lib/api';
import { getUserIdFromCookie } from '@/lib/session';

const startOptions = [
  {
    title: 'From Script',
    description: 'Start with a script and generate scenes, narration, and captions automatically.',
    href: '/create/script',
  },
  {
    title: 'From Avatar',
    description: 'Pick a presenter first, then write your script and customize output.',
    href: '/create/avatar',
  },
  {
    title: 'From Template',
    description: 'Choose a production template and tailor the messaging for your audience.',
    href: '/create/template',
  },
];

const previewThumbs = [
  'https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=900&q=80',
  'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=900&q=80',
];

export default async function DashboardPage() {
  const userId = await getUserIdFromCookie();
  if (!userId) {
    redirect('/login');
  }

  const projects = await api.listProjects(userId, 10);

  return (
    <div className="space-y-6">
      <Card>
        <p className="text-sm text-muted">Create New Video</p>
        <h1 className="mt-1 font-heading text-3xl font-extrabold tracking-tight text-text">Guided video creation flow</h1>
        <p className="mt-2 text-sm text-muted">Choose your starting point and move through a clear step-by-step builder.</p>
      </Card>

      <Grid className="md:grid-cols-3">
        {startOptions.map((item) => (
          <Card key={item.title} className="flex h-full flex-col justify-between">
            <div>
              <h2 className="font-heading text-xl font-bold text-text">{item.title}</h2>
              <p className="mt-2 text-sm text-muted">{item.description}</p>
            </div>
            <Link href={item.href} className="mt-4">
              <Button className="w-full">Create</Button>
            </Link>
          </Card>
        ))}
      </Grid>

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-text">Recent Projects</h2>
          <Link href="/projects" className="text-sm font-semibold text-[hsl(var(--color-accent))]">View all</Link>
        </div>
        <Grid className="md:grid-cols-2 xl:grid-cols-3">
          {projects.slice(0, 6).map((project, index) => (
            <Card key={project.id} className="overflow-hidden p-0">
              <img
                src={previewThumbs[index % previewThumbs.length]}
                alt={project.title}
                className="h-32 w-full object-cover"
              />
              <div className="p-4">
                <p className="font-semibold text-text">{project.title}</p>
                <p className="text-xs text-muted">{project.language} • {project.voice}</p>
                <Link href={`/editor/${project.id}`} className="mt-3 inline-block text-sm font-semibold text-[hsl(var(--color-accent))]">
                  Open project
                </Link>
              </div>
            </Card>
          ))}
          {projects.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <p className="text-sm text-muted">No projects yet. Start with “From Script” to create your first video.</p>
            </Card>
          )}
        </Grid>
      </div>
    </div>
  );
}
