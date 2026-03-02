import { BookOpen, Lightbulb, Mic, BarChart } from "lucide-react";

export default function LearningPage() {
  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-6xl px-4">

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">
            Learn to Create Better AI Videos
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            Practical workflows and creative frameworks for high-performing video production.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </main>
  );
}