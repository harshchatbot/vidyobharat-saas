'use client';

import React, { useState } from 'react';
import styles from './GuidedFlow.module.css';

interface Step1Props {
  /** Category already chosen in CategorySelection — passed through so Step1 only handles platform. */
  preselectedCategory: string;
  onNext: (category: string, platform: string, durationSeconds: number) => void;
}

const PLATFORMS = [
  { id: 'instagram_reels', name: 'Instagram Reels', aspect: '9:16', icon: '📱' },
  { id: 'youtube_shorts', name: 'YouTube Shorts', aspect: '9:16', icon: '▶️' },
  { id: 'tiktok', name: 'TikTok', aspect: '9:16', icon: '🎵' },
  { id: 'facebook_feed', name: 'Facebook Feed', aspect: '4:5', icon: '👥' },
  { id: 'linkedin', name: 'LinkedIn', aspect: '16:9', icon: '💼' },
];

const CATEGORY_LABELS: Record<string, string> = {
  ugc_testimonial: 'UGC Testimonial',
  founder_talking_head: 'Founder Talking Head',
  problem_solution: 'Problem-Solution',
  product_demo_lifestyle: 'Product Demo & Lifestyle',
  inner_monologue: 'Inner Monologue',
  cinematic_narration: 'Cinematic Narration',
  cinematic_broll: 'Cinematic B-Roll',
};

export default function Step1CategoryPlatform({ preselectedCategory, onNext }: Step1Props) {
  const [selectedPlatform, setSelectedPlatform] = useState<string>('instagram_reels');
  const [selectedDurationSeconds, setSelectedDurationSeconds] = useState<number>(15);

  const handleNext = () => {
    onNext(preselectedCategory, selectedPlatform, selectedDurationSeconds);
  };

  const categoryLabel = CATEGORY_LABELS[preselectedCategory] ?? preselectedCategory;

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepNumber}>Step 1 of 3</div>
        <h2 className={styles.stepTitle}>Choose Your Platform</h2>
        <p className={styles.stepDescription}>
          Select the platform and target ad duration before script generation.
        </p>
      </div>

      {/* Locked ad style — shown as confirmation, not re-selection */}
      <div className="mb-6 px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center gap-3">
        <span className="text-indigo-500 text-lg">🎬</span>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-500">Ad Style (locked from previous step)</p>
          <p className="text-sm font-semibold text-indigo-900">{categoryLabel}</p>
        </div>
      </div>

      {/* Platform Selection */}
      <div className="space-y-3">
        <h3 className={styles.columnTitle}>Platform</h3>
        <div className={styles.platformGrid}>
          {PLATFORMS.map(platform => (
            <button
              key={platform.id}
              onClick={() => setSelectedPlatform(platform.id)}
              className={`${styles.platformCard} ${
                selectedPlatform === platform.id ? styles.platformCardSelected : ''
              }`}
            >
              <span className="text-xl mr-2">{platform.icon}</span>
              <div className={styles.platformCardContent}>
                <h4 className={styles.platformCardTitle}>{platform.name}</h4>
                <p className={styles.platformCardAspect}>Aspect: {platform.aspect}</p>
              </div>
              {selectedPlatform === platform.id && (
                <div className={styles.platformCardCheck}>✓</div>
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 mt-6">
        <h3 className={styles.columnTitle}>Target Duration</h3>
        <div className="flex flex-wrap gap-2">
          {[10, 15, 20, 30].map((duration) => (
            <button
              key={duration}
              type="button"
              onClick={() => setSelectedDurationSeconds(duration)}
              className={`${styles.toneButton} ${selectedDurationSeconds === duration ? styles.toneButtonSelected : ''}`}
            >
              {duration}s
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className={styles.stepNavigation}>
        <button
          onClick={handleNext}
          className={styles.buttonPrimary}
        >
          Continue to Brief →
        </button>
      </div>
    </div>
  );
}
