import { Target, Lightbulb, Globe, Rocket } from "lucide-react";
import { PublicPageTemplate } from "@/components/landing/PublicPageTemplate";

export default function CompanyPage() {
  return (
    <PublicPageTemplate
      title="Building India-First AI Video Infrastructure"
      subtitle="RangManch AI blends reliability, speed and regional storytelling into a unified platform."
      stats={[
        { label: 'Mission', value: 'Creator-first output quality' },
        { label: 'Approach', value: 'Pragmatic product workflows' },
        { label: 'Focus', value: 'Multilingual conversion impact' },
        { label: 'Roadmap', value: 'Enterprise-grade scaling' },
      ]}
      ctaTitle="Join the RangManch creator ecosystem"
      ctaSubtitle="Start with the free plan and scale to production as your output grows."
    >
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Target,
            title: "Our Mission",
            desc: "Help teams create better videos in less time.",
          },
          {
            icon: Lightbulb,
            title: "Our Approach",
            desc: "Product-led development with practical workflows.",
          },
          {
            icon: Globe,
            title: "Our Focus",
            desc: "Multilingual accessibility and conversion outcomes.",
          },
          {
            icon: Rocket,
            title: "Our Roadmap",
            desc: "Enterprise governance and scalable infrastructure.",
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
