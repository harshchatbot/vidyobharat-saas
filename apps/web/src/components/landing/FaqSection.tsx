'use client';

const faqs = [
  {
    q: 'Can I generate videos in Indian languages?',
    a: 'Yes. RangManch AI is designed for Indian language workflows including Hindi and Tamil in MVP.',
  },
  {
    q: 'Can I use both 9:16 and 16:9?',
    a: 'Yes. The render pipeline supports both short-form vertical and landscape export flows.',
  },
  {
    q: 'Does it support templates and AI b-roll together?',
    a: 'Yes. The platform is hybrid by design: template reliability plus optional AI b-roll enrichment.',
  },
  {
    q: 'How fast are renders?',
    a: 'For MVP demo workloads, renders complete quickly and stream status updates in real time.',
  },
];

export function FaqSection() {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">FAQs</h2>
        <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">Answering objections early improves conversion and trust.</p>
      </div>
      <div className="space-y-2">
        {faqs.map((item) => (
          <details
            key={item.q}
            className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3"
          >
            <summary className="cursor-pointer list-none text-sm font-semibold text-[hsl(var(--color-text))]">{item.q}</summary>
            <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
