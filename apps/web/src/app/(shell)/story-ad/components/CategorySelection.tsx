'use client';

import React, { useState } from 'react';

interface Category {
  id: string;
  name: string;
  description: string;
  icon: string;
  requiresAvatar: 'required' | 'optional' | 'not_needed';
  suggestion: string;
}

interface CategorySelectionProps {
  onSelectCategory: (categoryId: string) => void;
}

const CATEGORIES: Category[] = [
  {
    id: 'ugc_testimonial',
    name: 'UGC Testimonial',
    description: 'User-generated content style testimonial with authentic feel',
    icon: '👤',
    requiresAvatar: 'optional',
    suggestion: 'Can be created with AI Avatar OR as a Storyboard',
  },
  {
    id: 'founder_talking_head',
    name: 'Founder Talking Head',
    description: 'Founder or expert speaking directly to camera',
    icon: '🎤',
    requiresAvatar: 'required',
    suggestion: 'Best created with an AI Avatar speaking to camera',
  },
  {
    id: 'problem_solution',
    name: 'Problem-Solution',
    description: 'Showcase problem then reveal solution',
    icon: '💡',
    requiresAvatar: 'optional',
    suggestion: 'Can be created with AI Avatar OR as a visual Storyboard',
  },
  {
    id: 'product_demo_lifestyle',
    name: 'Product Demo & Lifestyle',
    description: 'Product in action with lifestyle context',
    icon: '✨',
    requiresAvatar: 'optional',
    suggestion: 'Avatar can demonstrate OR show as visual storyboard',
  },
  {
    id: 'inner_monologue',
    name: 'Inner Monologue',
    description: 'Person thinking aloud about the product',
    icon: '💭',
    requiresAvatar: 'required',
    suggestion: 'Best created with an AI Avatar thinking aloud',
  },
  {
    id: 'cinematic_narration',
    name: 'Cinematic Narration',
    description: 'High-quality cinematic style with voiceover',
    icon: '🎬',
    requiresAvatar: 'not_needed',
    suggestion: 'Best created as a visual Storyboard with voiceover',
  },
  {
    id: 'cinematic_broll',
    name: 'Cinematic B-Roll',
    description: 'Beautiful footage with minimal dialogue',
    icon: '🎥',
    requiresAvatar: 'not_needed',
    suggestion: 'Best created as a visual Storyboard',
  },
];

function getSuggestionColor(requiresAvatar: string): { bg: string; border: string; text: string } {
  switch (requiresAvatar) {
    case 'required':
      return {
        bg: 'hsl(var(--color-error) / 0.08)',
        border: 'hsl(var(--color-error) / 0.25)',
        text: 'hsl(var(--color-error))',
      };
    case 'optional':
      return {
        bg: 'hsl(var(--color-accent-amber) / 0.08)',
        border: 'hsl(var(--color-accent-amber) / 0.25)',
        text: 'hsl(var(--color-accent-amber))',
      };
    case 'not_needed':
      return {
        bg: 'hsl(var(--color-primary) / 0.08)',
        border: 'hsl(var(--color-primary) / 0.25)',
        text: 'hsl(var(--color-primary))',
      };
    default:
      return {
        bg: 'hsl(var(--color-surface) / 0.5)',
        border: 'hsl(var(--color-border) / 0.5)',
        text: 'hsl(var(--color-text))',
      };
  }
}

export default function CategorySelection({ onSelectCategory }: CategorySelectionProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(categoryId);
    onSelectCategory(categoryId);
  };

  const colors = getSuggestionColor('');

  return (
    <div className="mesh-bg min-h-screen px-4 py-8">
      <div className="max-w-3xl mx-auto">
        {/* Header Section */}
        <div className="glass-card-strong px-8 py-6 mb-8 rounded-xl">
          <div className="flex items-center justify-center mb-4">
            <div
              className="glass-card px-4 py-1.5 text-sm font-semibold animate-glow-pulse rounded-full border"
              style={{
                borderColor: 'hsl(var(--color-primary) / 0.3)',
                color: 'hsl(var(--color-primary))',
              }}
            >
              Step 1
            </div>
          </div>
          <h2 className="gradient-text text-3xl font-bold text-center mb-3" style={{ fontSize: '1.875rem' }}>
            Choose Your Ad Style
          </h2>
          <p className="text-center" style={{ color: 'hsl(var(--color-text-secondary))' }}>
            Select the style that best matches your brand and message. We'll suggest how to create it.
          </p>
        </div>

        {/* Category Grid */}
        <div className="space-y-4">
          {CATEGORIES.map(category => {
            const suggestionColors = getSuggestionColor(category.requiresAvatar);
            const isSelected = selectedCategory === category.id;

            return (
              <button
                key={category.id}
                onClick={() => handleCategorySelect(category.id)}
                className="w-full glass-card p-5 cursor-pointer text-left transition-all duration-300 rounded-xl"
                style={{
                  ...(isSelected && {
                    borderColor: 'hsl(var(--color-primary) / 0.5)',
                    boxShadow: 'var(--shadow-glow-sm)',
                  }),
                }}
              >
                {/* Icon Container */}
                <div
                  className="inline-flex items-center justify-center mb-4 rounded-md p-2"
                  style={{
                    background: 'hsl(var(--color-primary) / 0.12)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem',
                  }}
                >
                  <span className="text-2xl">{category.icon}</span>
                </div>

                {/* Content */}
                <h4
                  className="font-semibold mb-2"
                  style={{
                    color: 'hsl(var(--color-text))',
                    fontSize: '1rem',
                    fontWeight: 600,
                  }}
                >
                  {category.name}
                </h4>

                <p className="text-sm mb-4" style={{ color: 'hsl(var(--color-text-secondary))' }}>
                  {category.description}
                </p>

                {/* Suggestion Box */}
                <div
                  className="p-3 rounded-md border text-sm"
                  style={{
                    background: suggestionColors.bg,
                    borderColor: suggestionColors.border,
                    color: suggestionColors.text,
                  }}
                >
                  💡 {category.suggestion}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
