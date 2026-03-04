import { Rocket, TrendingUp, Users, Target } from "lucide-react";
import { PublicPageTemplate } from "@/components/landing/PublicPageTemplate";

export default function BusinessPage() {
  return (
    <PublicPageTemplate
      title="AI Video Infrastructure for Businesses"
      subtitle="Scale campaigns, product explainers and regional content without scaling production costs."
      stats={[
        { label: 'Team workflow', value: 'Standardized output' },
        { label: 'Campaign speed', value: 'Faster turnaround' },
        { label: 'Localization', value: 'Regional storytelling' },
        { label: 'Scale', value: 'Agency-ready operations' },
      ]}
      ctaTitle="Deploy a business-ready AI video pipeline"
      ctaSubtitle="Start with a focused workflow, then scale with plans and credits."
    >
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Target,
            title: "Standardized Quality",
            desc: "Consistent video output across teams and campaigns.",
          },
          {
            icon: Rocket,
            title: "Faster Turnarounds",
            desc: "Reusable templates reduce iteration cycles.",
          },
          {
            icon: TrendingUp,
            title: "Localized Growth",
            desc: "Regional storytelling for Indian audiences.",
          },
          {
            icon: Users,
            title: "Agency Ready",
            desc: "Built for teams managing multiple clients.",
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
