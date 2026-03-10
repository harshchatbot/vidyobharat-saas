import { Layers, Globe, Sparkles, Cpu } from "lucide-react";
import { PublicPageTemplate } from "@/components/landing/PublicPageTemplate";

export default function PlatformPage() {
  return (
    <PublicPageTemplate
      title="The AI Video Platform Built for India"
      subtitle="Hybrid template + AI workflows, multilingual voices, captions and async rendering pipelines."
      stats={[
        { label: 'Languages', value: '20+ regional options' },
        { label: 'Formats', value: '9:16, 16:9, 1:1' },
        { label: 'Render mode', value: 'Async with live status' },
        { label: 'Workflow', value: 'Template + AI hybrid' },
      ]}
      ctaTitle="Start building on the full RangManch platform"
      ctaSubtitle="Use one production flow for script, voice, visuals, and final output."
    >
      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Layers,
            title: "Hybrid Workflow",
            desc: "Template + AI b-roll engine for predictable, scalable output.",
          },
          {
            icon: Globe,
            title: "Indian Language First",
            desc: "Hindi, Tamil and 20+ regional voices built-in.",
          },
          {
            icon: Sparkles,
            title: "Reusable Projects",
            desc: "Save creative configurations and scale production.",
          },
          {
            icon: Cpu,
            title: "Async Rendering",
            desc: "Background rendering with real-time progress tracking.",
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
