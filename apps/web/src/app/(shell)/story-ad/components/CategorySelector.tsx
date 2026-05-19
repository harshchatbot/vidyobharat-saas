'use client';

import React, { useState } from 'react';
import { InitializeProjectInput } from '../hooks/useStoryboardProject';
import styles from './CategorySelector.module.css';

interface CategorySelectorProps {
  onSelect: (input: InitializeProjectInput) => void;
}

const CATEGORIES = [
  {
    id: 'ugc_testimonial',
    name: 'UGC Testimonial',
    description: 'User-generated content style testimonial with authentic feel',
    icon: '👤',
    examples: 'Real people sharing product reviews',
  },
  {
    id: 'founder_talking_head',
    name: 'Founder Talking Head',
    description: 'Founder or expert speaking directly to camera',
    icon: '🎤',
    examples: 'Personal story or product insight',
  },
  {
    id: 'problem_solution',
    name: 'Problem-Solution',
    description: 'Showcase problem then reveal solution',
    icon: '💡',
    examples: 'Before/after style narrative',
  },
  {
    id: 'product_demo_lifestyle',
    name: 'Product Demo & Lifestyle',
    description: 'Product in action with lifestyle context',
    icon: '✨',
    examples: 'How to use, lifestyle benefits',
  },
  {
    id: 'inner_monologue',
    name: 'Inner Monologue',
    description: 'Person thinking aloud about the product',
    icon: '💭',
    examples: 'Stream of consciousness, relatability',
  },
  {
    id: 'cinematic_narration',
    name: 'Cinematic Narration',
    description: 'High-quality cinematic style with voiceover',
    icon: '🎬',
    examples: 'Premium brand storytelling',
  },
  {
    id: 'cinematic_broll',
    name: 'Cinematic B-Roll',
    description: 'Beautiful footage with minimal dialogue',
    icon: '🎥',
    examples: 'Visual storytelling focus',
  },
];

export default function CategorySelector({ onSelect }: CategorySelectorProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    ad_category: '',
    business_brief: '',
    platform: 'instagram_reels',
    language: 'en',
    tone: 'casual',
  });

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    setFormData(prev => ({ ...prev, ad_category: categoryId }));
    setShowForm(true);
  };

  const handleFormChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.business_brief.trim()) {
      alert('Please enter a business brief');
      return;
    }

    setLoading(true);
    try {
      await onSelect({
        ad_category: formData.ad_category,
        business_brief: formData.business_brief,
        platform: formData.platform,
        language: formData.language,
        tone: formData.tone,
      });
    } finally {
      setLoading(false);
    }
  };

  if (showForm && selectedCategory) {
    const category = CATEGORIES.find(c => c.id === selectedCategory);
    return (
      <div className={styles.formContainer}>
        <button
          onClick={() => {
            setShowForm(false);
            setSelectedCategory(null);
          }}
          className={styles.backButton}
        >
          ← Back to categories
        </button>

        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <span className={styles.formHeaderIcon}>{category?.icon}</span>
            <div className={styles.formHeaderText}>
              <h2>{category?.name}</h2>
              <p>{category?.description}</p>
            </div>
          </div>

          <div className={styles.exampleBox}>
            <label className={styles.exampleBoxLabel}>Example:</label>
            <p className={styles.exampleBoxText}>{category?.examples}</p>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Business Brief <span className={styles.formRequired}>*</span>
            </label>
            <textarea
              value={formData.business_brief}
              onChange={(e) => handleFormChange('business_brief', e.target.value)}
              placeholder="Describe your product, target audience, and key message (e.g., 'Skincare brand targeting women 25-40 with anti-aging moisturizer')"
              className={styles.formInput}
              rows={5}
            />
            <p className={styles.formCharCount}>
              {formData.business_brief.length} characters
            </p>
          </div>

          <div className={styles.formFieldsGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Platform
              </label>
              <select
                value={formData.platform}
                onChange={(e) => handleFormChange('platform', e.target.value)}
                className={styles.formSelect}
              >
                <option value="instagram_reels">Instagram Reels</option>
                <option value="facebook_feed">Facebook Feed</option>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="linkedin">LinkedIn</option>
                <option value="tiktok">TikTok</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Language
              </label>
              <select
                value={formData.language}
                onChange={(e) => handleFormChange('language', e.target.value)}
                className={styles.formSelect}
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="hinglish">Hinglish</option>
                <option value="bn">Bengali</option>
                <option value="mr">Marathi</option>
                <option value="ta">Tamil</option>
                <option value="te">Telugu</option>
              </select>
            </div>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>
              Tone
            </label>
            <div className={styles.toneGrid}>
              {['casual', 'professional', 'emotional', 'energetic'].map(tone => (
                <button
                  key={tone}
                  onClick={() => handleFormChange('tone', tone)}
                  className={`${styles.toneButton} ${formData.tone === tone ? styles.selected : ''}`}
                >
                  {tone}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.formButtons}>
            <button
              onClick={handleSubmit}
              disabled={loading || !formData.business_brief.trim()}
              className={styles.formButtonPrimary}
            >
              {loading ? 'Creating project...' : 'Create Project'}
            </button>
            <button
              onClick={() => {
                setShowForm(false);
                setSelectedCategory(null);
              }}
              className={styles.formButtonSecondary}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>Choose Your Ad Style</h2>
        <p className={styles.headerDescription}>Select the style that best matches your brand and message</p>
      </div>

      <div className={styles.categoriesGrid}>
        {CATEGORIES.map(category => (
          <button
            key={category.id}
            onClick={() => handleCategorySelect(category.id)}
            className={styles.categoryCard}
          >
            <div className={styles.categoryIcon}>{category.icon}</div>
            <h3 className={styles.categoryName}>{category.name}</h3>
            <p className={styles.categoryDescription}>{category.description}</p>
            <div className={styles.categoryExamples}>
              {category.examples}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
