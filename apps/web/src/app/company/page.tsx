import { Target, Lightbulb, Globe, Rocket } from "lucide-react";

export default function CompanyPage() {
  return (
    <main className="bg-[hsl(var(--color-bg))] py-20">
      <div className="mx-auto max-w-6xl px-4">

        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">
            Building India-First AI Video Infrastructure
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            RangManch AI blends reliability, speed and regional storytelling into a unified platform.
          </p>
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </main>
  );
}