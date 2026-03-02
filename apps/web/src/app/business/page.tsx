import Link from "next/link";
import { TrendingUp, Users, Globe, Clock, ArrowRight } from "lucide-react";

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

export default function BusinessPage() {
  return (
    <main className="bg-[#F8F6F2] py-20">
      <Container>
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-slate-800">
            AI video infrastructure for growing businesses
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Ship campaigns, product explainers and regional content —
            without scaling production overhead.
          </p>
        </div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            icon={TrendingUp}
            title="Marketing Campaigns"
            desc="Launch ad creatives and social content at scale."
          />
          <Card
            icon={Users}
            title="Sales & Onboarding"
            desc="Create personalized demo and onboarding videos."
          />
          <Card
            icon={Globe}
            title="Regional Localization"
            desc="Deliver content in Hindi and regional markets."
          />
          <Card
            icon={Clock}
            title="Faster Turnaround"
            desc="Move from script to final delivery URL quickly."
          />
        </div>

        <div className="mt-16 text-center">
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl bg-[#F4B400] px-8 py-3 text-sm font-semibold text-black hover:opacity-90"
          >
            Explore Plans <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </Container>
    </main>
  );
}