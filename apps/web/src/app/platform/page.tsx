import Link from "next/link";
import { Layers, Globe, Zap, Workflow, Subtitles, Shield, ArrowRight } from "lucide-react";

const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-4">{children}</div>
);

const Card = ({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) => (
  <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4B400]/10">
      <Icon className="h-5 w-5 text-[#F4B400]" />
    </div>
    <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
    <p className="mt-2 text-sm text-slate-600">{desc}</p>
  </div>
);

export default function PlatformPage() {
  return (
    <main className="bg-[#F8F6F2] py-20">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-slate-800">
            A unified AI video platform
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Templates, multilingual narration, captions and async rendering —
            built for scale and consistency.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            icon={Layers}
            title="Template + AI Hybrid"
            desc="Structured layouts enhanced with AI b-roll for reliable scale."
          />
          <Card
            icon={Globe}
            title="India-first Voices"
            desc="Hindi and regional language narration built into workflow."
          />
          <Card
            icon={Subtitles}
            title="Mobile-first Captions"
            desc="Auto-generated captions optimized for retention."
          />
          <Card
            icon={Workflow}
            title="Project Workflow"
            desc="Reusable creative settings and structured scene control."
          />
          <Card
            icon={Zap}
            title="Async Render Jobs"
            desc="Track progress and receive final delivery URLs."
          />
          <Card
            icon={Shield}
            title="Secure Multi-tenant"
            desc="User-scoped architecture with clean ownership model."
          />
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F4B400] px-8 py-3 text-sm font-semibold text-black hover:opacity-90"
          >
            Get Started for Free <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </main>
  );
}