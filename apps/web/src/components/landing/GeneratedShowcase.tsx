'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { motion } from 'framer-motion';

type Language = 'Hindi' | 'English' | 'Tamil';
type Ratio = '9:16' | '16:9';

type ShowcaseVideo = {
  id: string;
  title: string;
  language: Language;
  ratio: Ratio;
  src: string;
  description: string;
};

const videos: ShowcaseVideo[] = [
  {
    id: 'hindi-festival',
    title: 'Festival Campaign Reel',
    language: 'Hindi',
    ratio: '9:16',
    src: '/videos/samples/hindi-festival-9x16.mp4',
    description: 'Local commerce festive promo with captions and upbeat pacing.',
  },
  {
    id: 'english-startup',
    title: 'Startup Product Explainer',
    language: 'English',
    ratio: '16:9',
    src: '/videos/samples/english-startup-16x9.mp4',
    description: 'Clean business explainer for investor and website audiences.',
  },
  {
    id: 'tamil-education',
    title: 'Education Story Video',
    language: 'Tamil',
    ratio: '9:16',
    src: '/videos/samples/tamil-education-9x16.mp4',
    description: 'Short-form education narrative with natural local voice flow.',
  },
];

export function GeneratedShowcase() {
  const [selectedLanguage, setSelectedLanguage] = useState<Language | 'All'>('All');
  const [selectedRatio, setSelectedRatio] = useState<Ratio | 'All'>('All');

  const filteredVideos = useMemo(
    () =>
      videos.filter((video) => {
        const languageMatch = selectedLanguage === 'All' || video.language === selectedLanguage;
        const ratioMatch = selectedRatio === 'All' || video.ratio === selectedRatio;
        return languageMatch && ratioMatch;
      }),
    [selectedLanguage, selectedRatio],
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="space-y-5"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Generated Videos</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[hsl(var(--color-text))] sm:text-3xl">
            Real outputs, ready for launch.
          </h2>
          <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
            Browse sample videos by language and format. Each output includes captions, music timing, and voice.
          </p>
        </div>
        <Link
          href="/projects"
          className="inline-flex w-full items-center justify-center rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-5 py-2.5 text-sm font-semibold text-[hsl(var(--color-accent-contrast))] sm:w-auto"
        >
          Create Your Video
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(['All', 'Hindi', 'English', 'Tamil'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelectedLanguage(option)}
              className={`rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold transition ${
                selectedLanguage === option
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                  : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-muted))]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {(['All', '9:16', '16:9'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setSelectedRatio(option)}
              className={`rounded-[var(--radius-md)] border px-3 py-1 text-xs font-semibold transition ${
                selectedRatio === option
                  ? 'border-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent))] text-[hsl(var(--color-accent-contrast))]'
                  : 'border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-[hsl(var(--color-muted))]'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {filteredVideos.map((video, index) => (
          <motion.article
            key={video.id}
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.4, delay: 0.08 * index, ease: 'easeOut' }}
            className="overflow-hidden rounded-[var(--radius-lg)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] shadow-soft"
          >
            <div className="border-b border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-2">
              <video
                className="h-52 w-full rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] object-cover"
                src={video.src}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
              />
            </div>
            <div className="space-y-2 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[hsl(var(--color-text))]">{video.title}</p>
                <span className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-2 py-0.5 text-[10px] font-semibold text-[hsl(var(--color-muted))]">
                  {video.ratio}
                </span>
              </div>
              <p className="text-xs font-medium text-[hsl(var(--color-muted))]">{video.language}</p>
              <p className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">{video.description}</p>
            </div>
          </motion.article>
        ))}
      </div>
    </motion.section>
  );
}
