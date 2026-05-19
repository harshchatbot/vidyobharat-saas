'use client';

import React, { useState } from 'react';
import styles from './GuidedFlow.module.css';
import { api } from '@/lib/api';
import { getCurrentUserId } from '@/lib/authUser';

interface Step2Props {
  category: string;
  onNext: (briefData: BriefData) => void;
  onBack: () => void;
}

export interface BriefData {
  business_brief: string;
  tone: string;
  language: string;
  product_image_url?: string;
  product_reference_images?: string[];
  target_ad_duration_seconds?: number;
}

const TONES = [
  { id: 'casual', label: 'Casual', emoji: '😊' },
  { id: 'professional', label: 'Professional', emoji: '💼' },
  { id: 'emotional', label: 'Emotional', emoji: '❤️' },
  { id: 'energetic', label: 'Energetic', emoji: '⚡' },
];

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'hi', label: 'Hindi' },
  { id: 'hinglish', label: 'Hinglish' },
  { id: 'bn', label: 'Bengali' },
  { id: 'mr', label: 'Marathi' },
  { id: 'ta', label: 'Tamil' },
  { id: 'te', label: 'Telugu' },
];

export default function Step2BusinessBrief({ category, onNext, onBack }: Step2Props) {
  const [businessBrief, setBusinessBrief] = useState('');
  const [tone, setTone] = useState('casual');
  const [language, setLanguage] = useState('en');
  const [productImageUrl, setProductImageUrl] = useState<string>('');
  const [uploading, setUploading] = useState(false);

  const requiresProductImage = category === 'product_demo_lifestyle' || category === 'ugc_testimonial';

  const handleProductImageUpload = async (file: File) => {
    const userId = getCurrentUserId();
    if (!userId) {
      alert('Please sign in first');
      return;
    }
    setUploading(true);
    try {
      const uploaded = await api.uploadFileDirect(
        {
          file,
          kind: 'storyboard_product_reference',
        },
        userId,
      );
      setProductImageUrl(uploaded.public_url);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to upload product image');
    } finally {
      setUploading(false);
    }
  };

  const handleNext = () => {
    if (!businessBrief.trim()) {
      alert('Please describe your product/business');
      return;
    }
    if (businessBrief.trim().length < 10) {
      alert('Please provide more details (at least 10 characters)');
      return;
    }
    if (requiresProductImage && !productImageUrl.trim()) {
      alert('Please upload a product reference image');
      return;
    }

    onNext({
      business_brief: businessBrief,
      tone,
      language,
      product_image_url: productImageUrl || undefined,
      product_reference_images: productImageUrl ? [productImageUrl] : [],
    });
  };

  return (
    <div className={styles.stepContainer}>
      <div className={styles.stepHeader}>
        <div className={styles.stepNumber}>Step 2 of 3</div>
        <h2 className={styles.stepTitle}>Tell Us About Your Business</h2>
        <p className={styles.stepDescription}>
          Describe what you're selling and how you want it to feel
        </p>
      </div>

      <div className={styles.formLayout}>
        {/* Business Brief Section */}
        <div className={styles.formSection}>
          <label className={styles.formLabel}>
            What are you selling? <span className={styles.required}>*</span>
          </label>
          <p className={styles.formHint}>
            Example: "Premium skincare brand targeting women 25-40 with anti-aging moisturizer"
          </p>
          <textarea
            value={businessBrief}
            onChange={(e) => setBusinessBrief(e.target.value)}
            placeholder="Describe your product, target audience, and key message..."
            className={styles.formTextarea}
            rows={5}
          />
          <p className={styles.charCount}>{businessBrief.length} characters</p>
        </div>

        <div className={styles.formSection}>
          <label className={styles.formLabel}>
            Upload Product Reference Image {requiresProductImage ? <span className={styles.required}>*</span> : null}
          </label>
          <p className={styles.formHint}>
            Upload a clear product image so AI can preserve the product look across storyboard and video.
          </p>
          <input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                void handleProductImageUpload(file);
              }
            }}
          />
          {uploading ? <p className={styles.charCount}>Uploading product image…</p> : null}
          {productImageUrl ? (
            <div className="mt-3 space-y-2">
              <img src={productImageUrl} alt="Product reference" className="h-28 w-28 rounded-md object-cover border border-gray-200" />
              <div className="flex gap-2">
                <button type="button" className={styles.buttonSecondary} onClick={() => setProductImageUrl('')}>
                  Remove
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Quick Selectors */}
        <div className={styles.twoColumnLayout}>
          {/* Tone */}
          <div className={styles.formSection}>
            <label className={styles.formLabel}>Tone of Voice</label>
            <div className={styles.toneButtonsGrid}>
              {TONES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTone(t.id)}
                  className={`${styles.toneButton} ${tone === t.id ? styles.toneButtonSelected : ''}`}
                >
                  <span className={styles.toneEmoji}>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Language */}
          <div className={styles.formSection}>
            <label className={styles.formLabel}>Language</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={styles.formSelect}
            >
              {LANGUAGES.map(lang => (
                <option key={lang.id} value={lang.id}>
                  {lang.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className={styles.stepNavigation}>
        <button onClick={onBack} className={styles.buttonSecondary}>
          ← Back
        </button>
        <button
          onClick={handleNext}
          disabled={!businessBrief.trim()}
          className={styles.buttonPrimary}
        >
          Review & Generate →
        </button>
      </div>
    </div>
  );
}
