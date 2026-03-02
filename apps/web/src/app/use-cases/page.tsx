import Link from "next/link";
import Image from "next/image";
import {
  Megaphone,
  GraduationCap,
  Rocket,
  Users,
  Sparkles,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";

const Container = ({ children }: { children: React.ReactNode }) => (
  <div className="mx-auto max-w-6xl px-4">{children}</div>
);

function UseCaseBlock({
  icon: Icon,
  title,
  description,
  points,
  image,
  reverse = false,
}: {
  icon: any;
  title: string;
  description: string;
  points: string[];
  image: string;
  reverse?: boolean;
}) {
  return (
    <div
      className={`grid items-center gap-12 lg:grid-cols-2 ${
        reverse ? "lg:grid-flow-col-dense" : ""
      }`}
    >
      {/* Text */}
      <div className={`${reverse ? "lg:col-start-2" : ""}`}>
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F4B400]/10">
          <Icon className="h-5 w-5 text-[#F4B400]" />
        </div>

        <h2 className="text-2xl font-semibold text-slate-800">
          {title}
        </h2>

        <p className="mt-4 text-slate-600">{description}</p>

        <ul className="mt-6 space-y-2 text-sm text-slate-600">
          {points.map((p) => (
            <li key={p}>• {p}</li>
          ))}
        </ul>
      </div>

      {/* Illustration */}
      <div
        className={`rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ${
          reverse ? "lg:col-start-1" : ""
        }`}
      >
        <Image
          src={image}
          alt={title}
          width={600}
          height={400}
          className="rounded-xl object-cover"
        />
      </div>
    </div>
  );
}

export default function UseCasesPage() {
  return (
    <main className="bg-[#F8F6F2] py-20">
      <Container>
        {/* Hero */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-slate-800">
            Real-world AI video use cases
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            From AI influencers to regional ad campaigns — power your growth
            engine with one structured video workflow.
          </p>
        </div>

        {/* AI Influencers */}
        <div className="mt-20 space-y-24">
          <UseCaseBlock
            icon={Sparkles}
            title="AI Influencer Pages"
            description="Manage AI influencer content pipelines for Instagram, YouTube Shorts and brand collaborations."
            points={[
              "Consistent persona-based voice & style",
              "Daily short-form content automation",
              "Regional language expansion",
              "Sponsored product video generation",
            ]}
            image="/illustrations/ai-influencer.jpg"
          />

          {/* Product Ads */}
          <UseCaseBlock
            icon={ShoppingBag}
            title="D2C Product Advertisements"
            description="Launch high-volume ad creatives in Hindi and regional languages without studio shoots."
            points={[
              "Multi-language ad variations",
              "Mobile-first caption styling",
              "9:16 & 1:1 exports",
              "Creative testing at scale",
            ]}
            image="/illustrations/product-ads.jpg"
            reverse
          />

          {/* Growth Marketing */}
          <UseCaseBlock
            icon={Megaphone}
            title="Performance Marketing Teams"
            description="Enable marketing teams to iterate campaigns faster with template-driven creative production."
            points={[
              "Reusable ad templates",
              "Async render pipeline",
              "Parallel campaign launches",
              "Brand-safe structured layouts",
            ]}
            image="/illustrations/marketing.jpg"
          />

          {/* EdTech */}
          <UseCaseBlock
            icon={GraduationCap}
            title="EdTech & Learning Platforms"
            description="Deliver structured explainer videos and lessons in Indian regional languages."
            points={[
              "Course introduction videos",
              "Training modules",
              "Regional language narration",
              "Scalable lesson production",
            ]}
            image="/illustrations/edtech.jpg"
            reverse
          />

          {/* Startup Launch */}
          <UseCaseBlock
            icon={Rocket}
            title="Startup & SaaS Launch Videos"
            description="Announce features, product updates and launch campaigns without expensive production teams."
            points={[
              "Feature announcement clips",
              "Product demo walkthroughs",
              "Explainer videos",
              "Quick turnaround cycles",
            ]}
            image="/illustrations/startup.jpg"
          />

          {/* Agencies */}
          <UseCaseBlock
            icon={Users}
            title="Agencies Managing Multiple Clients"
            description="Standardize production workflows across brands without increasing headcount."
            points={[
              "Client-specific templates",
              "Multi-project management",
              "Parallel render jobs",
              "Faster delivery timelines",
            ]}
            image="/illustrations/agency.jpg"
            reverse
          />
        </div>

        {/* CTA */}
        <div className="mt-24 text-center">
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