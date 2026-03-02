import Link from "next/link";
import {
  BookOpen,
  Mic,
  Lightbulb,
  Workflow,
  ArrowRight,
} from "lucide-react";

const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-4">{children}</div>
);

function ResourceCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: any;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md">
      <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4B400]/10">
        <Icon className="h-5 w-5 text-[#F4B400]" />
      </div>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-600">{desc}</p>
    </div>
  );
}

export default function LearningPage() {
  return (
    <main className="bg-[#F8F6F2] py-20">
      <Container>
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-slate-800">
            Learn how to produce high-performing AI videos
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Practical guides, creative workflows and operational playbooks
            to help your team consistently ship better content.
          </p>
        </div>

        {/* Resource Categories */}
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <ResourceCard
            icon={BookOpen}
            title="Script Frameworks"
            desc="Proven templates for ads, explainers, product launches and regional campaigns."
          />
          <ResourceCard
            icon={Mic}
            title="Voice & Delivery"
            desc="Best practices for pacing, multilingual narration and retention-focused tone."
          />
          <ResourceCard
            icon={Lightbulb}
            title="Creative Testing"
            desc="Hook variations, CTA optimization and high-volume ad iteration strategies."
          />
          <ResourceCard
            icon={Workflow}
            title="Team Playbooks"
            desc="Operational workflows for agencies, marketing teams and AI influencer pages."
          />
        </div>

        {/* Featured Learning Block */}
        <div className="mt-24 rounded-2xl border border-slate-200 bg-white p-10 shadow-sm">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-2xl font-semibold text-slate-800">
                Structured workflow - random creativity
              </h2>
              <p className="mt-4 text-slate-600">
                The highest-performing AI video teams don’t rely on guesswork.
                They use repeatable frameworks for scripting, voice, captions
                and iteration.
              </p>

              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                <li>• Hook-first script writing models</li>
                <li>• Regional language optimization tactics</li>
                <li>• Ad creative testing cycles</li>
                <li>• AI influencer content calendars</li>
              </ul>

              <div className="mt-8">
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 rounded-xl bg-[#F4B400] px-8 py-3 text-sm font-semibold text-black hover:opacity-90"
                >
                  Start Applying These Workflows <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="rounded-xl bg-[#F4B400]/10 p-8 text-center">
              <p className="text-slate-800 font-medium">
                Coming soon:
              </p>
              <p className="mt-3 text-slate-600 text-sm">
                In-depth guides, downloadable templates,
                and structured video strategy resources for teams.
              </p>
            </div>
          </div>
        </div>
      </Container>
    </main>
  );
}