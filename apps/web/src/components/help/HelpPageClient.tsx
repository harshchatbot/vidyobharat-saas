'use client';

import Link from 'next/link';
import { ChevronDown, HelpCircle, ImageIcon, Sparkles, Video } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';

type HelpItem = {
  question: string;
  answer: React.ReactNode;
};

type HelpSection = {
  title: string;
  items: HelpItem[];
};

const HELP_SECTIONS: HelpSection[] = [
  {
    title: 'Get Started in 60 Seconds',
    items: [
      {
        question: 'Create your first image',
        answer: (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-4 text-sm text-muted">
              <li>Go to Image Studio</li>
              <li>Choose a style</li>
              <li>Write your idea</li>
              <li>Click Generate</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Link href="/images">
                <Button className="gap-2 rounded-full px-4 py-2 text-xs">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Go to Image Studio
                </Button>
              </Link>
            </div>
          </div>
        ),
      },
      {
        question: 'Create your first video',
        answer: (
          <div className="space-y-3">
            <ol className="list-decimal space-y-1 pl-4 text-sm text-muted">
              <li>Go to Video Studio</li>
              <li>Click Quick Start like Viral, Story, or Explainer</li>
              <li>Edit the script</li>
              <li>Click Create Reel</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Link href="/create">
                <Button className="gap-2 rounded-full px-4 py-2 text-xs">
                  <Video className="h-3.5 w-3.5" />
                  Go to Video Studio
                </Button>
              </Link>
            </div>
          </div>
        ),
      },
    ],
  },
  {
    title: 'Image Generation',
    items: [
      {
        question: 'How do I generate an image?',
        answer: 'Open Image Studio, choose the result type you want, describe the visual, and click Create image. You can keep the default settings for your first few generations.',
      },
      {
        question: 'Which model should I choose?',
        answer: 'Most creators can stay with the recommended output goal cards. Fast Social is best for quick iterations, Creator Quality is better for polished posts, Design / Carousel suits branded graphics, and Character / Influencer is best for persona-led visuals.',
      },
      {
        question: 'What is a good prompt?',
        answer: 'Describe the subject, mood, setting, and style in one focused sentence. Example: a cinematic Indian street-food product shot at golden hour, premium ad style, vertical social composition.',
      },
      {
        question: 'Why are my images not good?',
        answer: 'Usually the prompt is too vague or trying to do too much at once. Keep it focused, add one clear visual direction, and generate a few versions instead of over-editing settings.',
      },
    ],
  },
  {
    title: 'Video Generation',
    items: [
      {
        question: 'How do I generate a video?',
        answer: 'Use Quick Start or pick a template, review the starter script, keep the reel short, and click Create Reel. You do not need to change advanced settings unless you already know why.',
      },
      {
        question: 'Which template should I use?',
        answer: 'Use Explainer for teaching, Story for journeys and listicles, Ad for promos, Character for persona-led videos, and Cute / Fun for playful shareable clips.',
      },
      {
        question: 'Why is my video not good?',
        answer: 'Video quality depends heavily on script quality. Keep the script short, give it an emotional hook, and make sure the ending has a clear CTA or closing thought.',
      },
      {
        question: 'Why is my video silent?',
        answer: 'Check that Voice is turned on before generating. The preview only tests the narration voice. The final reel still needs narration enabled when you click Create Reel.',
      },
      {
        question: 'Why does generation fail sometimes?',
        answer: 'AI video models can fail because of provider queueing, unsupported combinations, or temporary model issues. If that happens, keep the setup simple, retry once, or choose the recommended defaults.',
      },
    ],
  },
  {
    title: 'Templates',
    items: [
      {
        question: 'What are templates?',
        answer: 'Templates are ready-made reel formats. They prefill a strong starting setup so you can begin with a working structure instead of a blank screen.',
      },
      {
        question: 'How do I use templates?',
        answer: 'Pick a template, change the topic if needed, and generate. You do not need to fill every field because the defaults already work well.',
      },
      {
        question: 'What do the template fields mean?',
        answer: 'Topic is what the video is about. Tone controls how it feels. Audience is optional context for who it is for. Format controls the structure, like story, top 5, or before-after.',
      },
    ],
  },
  {
    title: 'Models & Settings',
    items: [
      {
        question: 'What is Creator Pro vs Premium?',
        answer: 'Creator Pro is the balanced default for most creators. Premium is better for standout hero visuals or when you want to spend more for a higher-end result.',
      },
      {
        question: 'When should I change settings?',
        answer: 'Change settings only when you have a clear reason. Most users should keep the recommended setup and only adjust things like format, clip length, or captions.',
      },
    ],
  },
  {
    title: 'Credits',
    items: [
      {
        question: 'How do credits work?',
        answer: 'Each image, video, voice, or premium action uses credits based on the selected setup. The estimate shown in the studio reflects your current settings.',
      },
      {
        question: 'Why do credits reduce?',
        answer: 'Credits reduce when a paid generation or paid enhancement is successfully started or completed, depending on the workflow.',
      },
      {
        question: 'What about retry and refund?',
        answer: 'Retries usually count as a new generation because they create a new output. If a generation fails in a supported failure path, the app may refund credits automatically.',
      },
    ],
  },
  {
    title: 'Best Practices',
    items: [
      {
        question: 'How do I get better outputs consistently?',
        answer: 'Keep scripts short, focus on the hook, avoid overthinking settings, and generate multiple versions when you want better options to compare.',
      },
    ],
  },
  {
    title: 'Common Mistakes',
    items: [
      {
        question: 'What mistakes should I avoid?',
        answer: 'Avoid writing long scripts, filling every template field just because it exists, and changing advanced settings without a specific reason. Start simple and refine only when needed.',
      },
    ],
  },
];

function HelpAccordionItem({ item }: { item: HelpItem }) {
  return (
    <details className="group rounded-[20px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.32)] p-4">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-left">
        <span className="text-sm font-semibold text-text sm:text-base">{item.question}</span>
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.52)] text-muted transition group-open:rotate-180 group-open:text-text">
          <ChevronDown className="h-4 w-4" />
        </span>
      </summary>
      <div className="mt-3 border-t border-[hsl(var(--color-border)/0.6)] pt-3 text-sm leading-7 text-muted">
        {item.answer}
      </div>
    </details>
  );
}

export function HelpPageClient() {
  return (
    <div className="space-y-6">
      <StudioPageHeader
        eyebrow="Help"
        title="Help, tips, and quick answers"
        description="Everything here is designed to get you from confusion to first result faster. Keep the defaults, start simple, and refine only when you need more control."
        actions={
          <>
            <Link href="/images">
              <Button variant="secondary" className="gap-2 rounded-full px-4 py-2 text-xs">
                <ImageIcon className="h-3.5 w-3.5" />
                Image Studio
              </Button>
            </Link>
            <Link href="/create">
              <Button className="gap-2 rounded-full px-4 py-2 text-xs">
                <Sparkles className="h-3.5 w-3.5" />
                Video Studio
              </Button>
            </Link>
          </>
        }
      />

      <section className="grid gap-4">
        {HELP_SECTIONS.map((section) => (
          <div
            key={section.title}
            className="rounded-[24px] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.2)] p-4 sm:p-5"
          >
            <div className="mb-4 flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.58)] text-[hsl(var(--color-accent))]">
                <HelpCircle className="h-4 w-4" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-extrabold tracking-tight text-text">{section.title}</h2>
              </div>
            </div>
            <div className="space-y-3">
              {section.items.map((item) => (
                <HelpAccordionItem key={`${section.title}-${item.question}`} item={item} />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
