'use client';

import React, { useState, useEffect } from 'react';
import styles from './GuidedFlow.module.css';

interface Step3Props {
  category: string;
  platform: string;
  briefData: {
    business_brief: string;
    tone: string;
    language: string;
    product_image_url?: string;
    product_reference_images?: string[];
    target_ad_duration_seconds?: number;
  };
  avatarName?: string;
  onGenerate: () => Promise<void>;
  onBack: () => void;
  loading?: boolean;
  estimatedCost?: number;
}

const CATEGORY_NAMES: Record<string, string> = {
  'ugc_testimonial': 'UGC Testimonial',
  'founder_talking_head': 'Founder Talking Head',
  'problem_solution': 'Problem-Solution',
  'product_demo_lifestyle': 'Product Demo & Lifestyle',
  'inner_monologue': 'Inner Monologue',
  'cinematic_narration': 'Cinematic Narration',
  'cinematic_broll': 'Cinematic B-Roll',
};

const PLATFORM_NAMES: Record<string, string> = {
  'instagram_reels': 'Instagram Reels',
  'youtube_shorts': 'YouTube Shorts',
  'tiktok': 'TikTok',
  'facebook_feed': 'Facebook Feed',
  'linkedin': 'LinkedIn',
};

const TONE_NAMES: Record<string, string> = {
  'casual': 'Casual',
  'professional': 'Professional',
  'emotional': 'Emotional',
  'energetic': 'Energetic',
};

const LANGUAGE_NAMES: Record<string, string> = {
  'en': 'English',
  'hi': 'Hindi',
  'hinglish': 'Hinglish',
  'bn': 'Bengali',
  'mr': 'Marathi',
  'ta': 'Tamil',
  'te': 'Telugu',
};

export default function Step3ReviewGenerate({
  category,
  platform,
  briefData,
  avatarName,
  onGenerate,
  onBack,
  loading = false,
  estimatedCost = 50,
}: Step3Props) {
  const [agreed, setAgreed] = useState(false);

  const handleGenerate = async () => {
    if (!agreed) {
      alert('Please confirm you want to proceed');
      return;
    }
    await onGenerate();
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepNumber}>Step 3 of 3</div>
        <h2 className={styles.stepTitle}>Review & Generate Your Ad</h2>
        <p className={styles.stepDescription}>
          Check your settings and create your storyboard ad
        </p>
      </div>

      {/* Review Cards */}
      <div className={styles.reviewCardsGrid}>
        {/* Category */}
        <div className={styles.reviewCard}>
          <div className={styles.reviewCardLabel}>Ad Style</div>
          <div className={styles.reviewCardValue}>{CATEGORY_NAMES[category]}</div>
          <p className={styles.reviewCardHint}>Based on your creative preference</p>
        </div>

        {/* Platform */}
        <div className={styles.reviewCard}>
          <div className={styles.reviewCardLabel}>Platform</div>
          <div className={styles.reviewCardValue}>{PLATFORM_NAMES[platform]}</div>
          <p className={styles.reviewCardHint}>Optimized for this platform</p>
        </div>

        {/* Tone */}
        <div className={styles.reviewCard}>
          <div className={styles.reviewCardLabel}>Tone</div>
          <div className={styles.reviewCardValue}>{TONE_NAMES[briefData.tone]}</div>
          <p className={styles.reviewCardHint}>Voice and messaging style</p>
        </div>

        {/* Language */}
        <div className={styles.reviewCard}>
          <div className={styles.reviewCardLabel}>Language</div>
          <div className={styles.reviewCardValue}>{LANGUAGE_NAMES[briefData.language]}</div>
          <p className={styles.reviewCardHint}>Script and voiceover language</p>
        </div>

        <div className={styles.reviewCard}>
          <div className={styles.reviewCardLabel}>Target Duration</div>
          <div className={styles.reviewCardValue}>{briefData.target_ad_duration_seconds || 15}s</div>
          <p className={styles.reviewCardHint}>Used to constrain script and scene plan</p>
        </div>

        {avatarName ? (
          <div className={styles.reviewCard}>
            <div className={styles.reviewCardLabel}>Selected Avatar</div>
            <div className={styles.reviewCardValue}>{avatarName}</div>
            <p className={styles.reviewCardHint}>Character consistency will use avatar references</p>
          </div>
        ) : null}
      </div>

      {/* Business Brief Summary */}
      <div className={styles.briefSummary}>
        <h3 className={styles.briefSummaryTitle}>Your Business Brief</h3>
        <div className={styles.briefSummaryContent}>{briefData.business_brief}</div>
      </div>

      {briefData.product_image_url ? (
        <div className={styles.briefSummary}>
          <h3 className={styles.briefSummaryTitle}>Product Reference</h3>
          <img src={briefData.product_image_url} alt="Product reference" className="h-36 w-36 rounded-md object-cover border border-gray-200" />
          <p className={styles.formHint}>This image will be used to preserve product consistency across scenes.</p>
        </div>
      ) : null}

      {/* Cost Breakdown */}
      <div className={styles.costSection}>
        <div className={styles.costHeader}>
          <h3>Estimated Cost</h3>
          <div className={styles.costAmount}>{estimatedCost} credits</div>
        </div>
        <p className={styles.costDescription}>
          This includes script generation, storyboard planning, image creation, video generation, and audio synthesis.
          You can edit and regenerate individual scenes if needed.
        </p>
      </div>

      {/* Agreement Checkbox */}
      <div className={styles.agreementSection}>
        <label className={styles.agreementLabel}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className={styles.agreementCheckbox}
          />
          <span>I'm ready to generate my ad for {estimatedCost} credits</span>
        </label>
      </div>

      {/* Navigation */}
      <div className={styles.stepNavigation}>
        <button
          onClick={onBack}
          disabled={loading}
          className={styles.buttonSecondary}
        >
          ← Back
        </button>
        <button
          onClick={handleGenerate}
          disabled={!agreed || loading}
          className={styles.buttonPrimary}
        >
          {loading ? 'Generating...' : 'Generate My Ad'}
        </button>
      </div>
    </div>
  );
}
