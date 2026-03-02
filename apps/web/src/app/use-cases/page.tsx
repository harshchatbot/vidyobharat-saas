import { Sparkles, Megaphone, GraduationCap, Video } from "lucide-react";

export default function UseCasesPage() {
  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-6xl px-4">

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">
            Real-World Use Cases
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            From AI influencers to multilingual product advertisements.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Sparkles,
              title: "AI Influencers",
              desc: "Manage AI-driven influencer pages at scale.",
            },
            {
              icon: Megaphone,
              title: "Product Ads",
              desc: "Create high-converting regional advertisements.",
            },
            {
              icon: GraduationCap,
              title: "EdTech",
              desc: "Localized explainers and educational content.",
            },
            {
              icon: Video,
              title: "Agency Production",
              desc: "Handle multi-client video pipelines efficiently.",
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