import type { Metadata } from 'next';
import { BookOpen, Lightbulb, Mic, BarChart } from "lucide-react";
import { PublicPageTemplate } from "@/components/landing/PublicPageTemplate";
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({
  title: 'Learn AI Video Creation, Prompting, and Creator Workflows',
  description:
    'Learn practical AI video creation, prompting, voice, testing, and production workflows for creators, marketers, educators, and brands.',
  path: '/learning',
  keywords: [
    'AI video learning',
    'AI prompting guide',
    'AI video workflows',
    'creator education',
    'AI video tutorials India',
  ],
});

export default function LearningPage() {
  return (
    <PublicPageTemplate
      title="Learn to Create Better AI Videos"
      subtitle="Practical workflows and creative frameworks for high-performing video production."
      stats={[
        { label: 'Frameworks', value: 'Hooks, scripts, CTA flow' },
        { label: 'Voice', value: 'Pacing and narration quality' },
        { label: 'Testing', value: 'Prompt and style iteration' },
        { label: 'Ops', value: 'Team playbooks' },
      ]}
      ctaTitle="Turn learning into production output"
      ctaSubtitle="Apply these workflows directly in Create, Image Studio, and Influencer Studio."
    >
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: BookOpen,
            title: "Script Frameworks",
            desc: "Templates for hooks, CTAs and structured storytelling.",
          },
          {
            icon: Mic,
            title: "Voice Best Practices",
            desc: "Optimize pacing, tone and caption flow.",
          },
          {
            icon: Lightbulb,
            title: "Creative Testing",
            desc: "Test hooks and variations for better performance.",
          },
          {
            icon: BarChart,
            title: "Operational Playbooks",
            desc: "Team workflows for scalable production.",
          },
        ].map((item) => (
          <div
            key={item.title}
            className="rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] p-6 shadow-[var(--shadow-soft)]"
          >
            <item.icon className="h-6 w-6 text-[hsl(var(--color-accent))]" />
            <h3 className="mt-4 text-lg font-semibold text-[hsl(var(--color-text))]">
              {item.title}
            </h3>
            <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
              {item.desc}
            </p>
          </div>
        ))}
      </div>
    </PublicPageTemplate>
  );
}
