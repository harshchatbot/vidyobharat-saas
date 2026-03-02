import { Layers, Globe, Sparkles, Cpu } from "lucide-react";

export default function PlatformPage() {
  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-6xl px-4">

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">
            The AI Video Platform Built for India
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            Hybrid template + AI workflows, multilingual voices, captions and async rendering pipelines.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </main>
  );
}