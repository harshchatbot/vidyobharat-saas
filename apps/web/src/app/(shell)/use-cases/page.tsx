import Image from "next/image";
import Link from "next/link";
import { PublicPageTemplate } from "@/components/landing/PublicPageTemplate";

const useCases = [
  {
    title: "AI Influencers",
    description:
      "Create and manage AI influencer pages with multilingual scripted content, regional voiceovers and scalable posting workflows.",
    image: "/illustrations/ai-influencer.png",
  },
  {
    title: "Product Advertisements",
    description:
      "Generate high-converting product ads in Hindi, Tamil and 20+ Indian languages with cinematic storytelling.",
    image: "/illustrations/product-ads.png",
  },
  {
    title: "Marketing Campaigns",
    description:
      "Launch multilingual ad creatives for performance marketing, social-first growth and brand storytelling.",
    image: "/illustrations/marketing.png",
  },
  {
    title: "EdTech & Training",
    description:
      "Build localized lessons, explainers and internal training videos at scale without expensive production.",
    image: "/illustrations/edtech.png",
  },
  {
    title: "Startup Launch Videos",
    description:
      "Ship feature announcements and launch trailers with AI avatars and regional voice layers.",
    image: "/illustrations/startup.png",
  },
  {
    title: "Agency Operations",
    description:
      "Manage multiple client pipelines with reusable templates and predictable output workflows.",
    image: "/illustrations/agency.png",
  },
];

export default function UseCasesPage() {
  return (
    <PublicPageTemplate
      title="Real-World Use Cases"
      subtitle="From AI influencers to multilingual advertising pipelines."
      stats={[
        { label: 'Creator tracks', value: '6 practical use-case lanes' },
        { label: 'Localization', value: 'India-first language support' },
        { label: 'Output', value: 'Image + video generation' },
        { label: 'Workflow', value: 'From prompt to publish' },
      ]}
      ctaTitle="Turn your use case into a live workflow"
      ctaSubtitle="Start with one scenario today and scale with reusable studio patterns."
    >
      <div className="space-y-24">
          {useCases.map((item, index) => {
            const isReversed = index % 2 !== 0;

            return (
              <div
                key={item.title}
                className={`grid items-center gap-12 lg:grid-cols-2 ${
                  isReversed ? "lg:grid-flow-dense" : ""
                }`}
              >
                {/* IMAGE */}
                <div
                  className={`relative h-72 overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-[var(--shadow-soft)] ${
                    isReversed ? "lg:col-start-2" : ""
                  }`}
                >
                  <Image
                    src={item.image}
                    alt={item.title}
                    fill
                    className="object-cover"
                  />
                </div>

                {/* TEXT */}
                <div>
                  <h2 className="text-2xl font-semibold text-[hsl(var(--color-text))]">
                    {item.title}
                  </h2>

                  <p className="mt-4 text-[hsl(var(--color-muted))]">
                    {item.description}
                  </p>

                  <div className="mt-6">
                    <Link href="/signup" className="inline-flex rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-6 py-3 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]">
                      Explore This Use Case
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </PublicPageTemplate>
  );
}
