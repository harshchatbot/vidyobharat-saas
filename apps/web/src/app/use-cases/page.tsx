import Image from "next/image";

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
    <main className="bg-[hsl(var(--color-bg))] py-24">
      <div className="mx-auto max-w-6xl px-4">

        {/* HERO */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-4xl font-semibold text-[hsl(var(--color-text))]">
            Real-World Use Cases
          </h1>
          <p className="mt-4 text-lg text-[hsl(var(--color-muted))]">
            From AI influencers to multilingual advertising pipelines.
          </p>
        </div>

        {/* VERTICAL SECTIONS */}
        <div className="mt-20 space-y-24">
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
                    <button className="rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-6 py-3 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] shadow-[var(--shadow-soft)]">
                      Explore This Use Case
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}