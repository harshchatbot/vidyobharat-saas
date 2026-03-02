import { Rocket, TrendingUp, Users, Target } from "lucide-react";

export default function BusinessPage() {
  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-6xl px-4">

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">
            AI Video Infrastructure for Businesses
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            Scale campaigns, product explainers and regional content without scaling production costs.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </main>
  );
}