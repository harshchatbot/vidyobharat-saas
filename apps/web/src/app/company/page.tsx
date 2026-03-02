import Link from "next/link";
import {
  Target,
  Lightbulb,
  Globe,
  Rocket,
  ArrowRight,
} from "lucide-react";

const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-4">{children}</div>
);

function Card({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4B400]/10">
        <Icon className="h-5 w-5 text-[#F4B400]" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{desc}</p>
    </div>
  );
}

export default function CompanyPage() {
  return (
    <main className="bg-[#F8F6F2] py-20">
      <Container>
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-slate-800">
            Building India-first AI video infrastructure
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            RangManch AI blends reliability, speed and regional storytelling
            into a unified video creation platform.
          </p>
        </div>

        {/* Mission & Approach */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card
            icon={Target}
            title="Our Mission"
            desc="Help teams create better videos in less time with structured AI-assisted workflows."
          />
          <Card
            icon={Lightbulb}
            title="Our Approach"
            desc="Product-led development focused on practical creative execution, not gimmicks."
          />
          <Card
            icon={Globe}
            title="Our Focus"
            desc="Multilingual accessibility and regional storytelling built for Indian markets."
          />
          <Card
            icon={Rocket}
            title="Our Roadmap"
            desc="Deeper authentication, scalable storage and enterprise governance capabilities."
          />
        </div>

        {/* Philosophy Section */}
        <div className="mt-24 rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-slate-800">
                Why RangManch AI exists
              </h2>
              <p className="mt-4 text-slate-600">
                Video production should not require fragmented tools,
                expensive shoots or inconsistent output.
              </p>

              <p className="mt-4 text-slate-600">
                We believe structured AI workflows can empower
                marketing teams, creators and agencies to scale storytelling
                without scaling chaos.
              </p>
            </div>

            <div className="rounded-xl bg-[#F4B400]/10 p-8 text-center">
              <p className="text-slate-800 font-medium">
                Our Vision
              </p>
              <p className="mt-3 text-slate-600 text-sm">
                To become the foundational AI video infrastructure layer
                for India’s digital growth ecosystem.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-24 text-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F4B400] px-8 py-3 text-sm font-semibold text-black hover:opacity-90"
          >
            Join the Platform <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </main>
  );
}