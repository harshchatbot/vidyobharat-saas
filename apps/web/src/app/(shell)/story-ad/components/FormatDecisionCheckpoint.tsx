'use client';

/**
 * TOW Stage 4 — Format Decision
 *
 * Compares 6 ad format types and selects ONE.
 * The selected format determines:
 *   - Narrative path (UGC or Cinematic)
 *   - Script template used in Stage 5
 *   - Whether lipsync is required
 *   - Whether an avatar / human is needed
 *
 * UGC path narrative:    Hook → Problem → Shift → Proof → CTA
 * Cinematic path narrative: Hook → Tension → Shift → Proof → CTA
 */

import React, { useState } from 'react';
import { AdFormat, FormatDecision, FormatOption, NarrativePath, StoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';

interface FormatDecisionCheckpointProps {
  project: StoryboardProject;
  onApprove: (decision: FormatDecision) => Promise<void> | void;
  onBack?: () => void;
}

// ── Format catalogue ──────────────────────────────────────────────────────

const FORMAT_OPTIONS: FormatOption[] = [
  {
    format: 'ugc_direct_to_camera',
    label: 'UGC Direct-to-Camera',
    description: 'Raw, authentic confession-style. Avatar speaks directly to lens.',
    narrative_structure: 'Hook → Problem → Shift → Proof → CTA',
    lipsync_required: true,
    requires_avatar: true,
    recommended_for: ['Trust building', 'High-ticket products', 'Personal testimonials'],
    pros: ['Highest trust signal', 'Feels native on Reels/TikTok', 'Easy to iterate hooks'],
    cons: ['Needs a credible avatar', 'Quality avatar required'],
  },
  {
    format: 'ugc_lifestyle_mixed',
    label: 'UGC Lifestyle / Mixed UGC',
    description: 'Avatar in real context — using the product, on the go, at home.',
    narrative_structure: 'Hook → Problem → Shift → Proof → CTA',
    lipsync_required: true,
    requires_avatar: true,
    recommended_for: ['FMCG', 'Beauty', 'Fitness', 'Home products'],
    pros: ['Aspirational yet relatable', 'Product shown in use', 'Strong social proof'],
    cons: ['More complex scene setup', 'Product placement critical'],
  },
  {
    format: 'cinematic_broll_voiceover',
    label: 'Cinematic B-Roll + Voiceover',
    description: 'No avatar on screen. Product and lifestyle visuals with professional VO.',
    narrative_structure: 'Hook → Tension → Shift → Proof → CTA',
    lipsync_required: false,
    requires_avatar: false,
    recommended_for: ['Premium brands', 'Aspirational products', 'Real estate', 'Cars'],
    pros: ['Premium feel', 'No avatar needed', 'Works for any product'],
    cons: ['Less personal', 'VO must be compelling'],
  },
  {
    format: 'founder_talking_head',
    label: 'Founder-Led Talking Head',
    description: 'Structured authority pitch. Founder or expert speaks directly.',
    narrative_structure: 'Hook → Problem → Shift → Proof → CTA',
    lipsync_required: true,
    requires_avatar: true,
    recommended_for: ['SaaS', 'B2B', 'New product launches', 'High-consideration buys'],
    pros: ['Strong authority signal', 'Builds brand trust', 'Explains complex products'],
    cons: ['Formal — may not suit impulse categories', 'Requires polished delivery'],
  },
  {
    format: 'product_led_visual',
    label: 'Product-Led Visual Ad',
    description: 'Product is the hero. Minimal or no dialogue. Visual storytelling only.',
    narrative_structure: 'Hook → Tension → Shift → Proof → CTA',
    lipsync_required: false,
    requires_avatar: false,
    recommended_for: ['Jewellery', 'Fashion', 'Food & beverage', 'Tech gadgets'],
    pros: ['Pure visual impact', 'Works without sound', 'Premium product showcase'],
    cons: ['Less emotional connection', 'No spoken proof points'],
  },
  {
    format: 'ui_screen_demo',
    label: 'UI / Screen-Led Product Demo',
    description: 'App or software screen recording with annotations and VO.',
    narrative_structure: 'Hook → Tension → Shift → Proof → CTA',
    lipsync_required: false,
    requires_avatar: false,
    recommended_for: ['SaaS', 'Mobile apps', 'EdTech', 'Fintech'],
    pros: ['Shows exactly how it works', 'High conversion for apps', 'No avatar needed'],
    cons: ['Only works for digital products', 'UI must look polished'],
  },
];

const PATH_NARRATIVES: Record<NarrativePath, { steps: string[]; color: string; label: string }> = {
  ugc: {
    label: 'UGC Path',
    color: 'text-green-700 bg-green-50 border-green-200',
    steps: ['Hook', 'Problem', 'Shift', 'Proof', 'CTA'],
  },
  cinematic: {
    label: 'Cinematic Path',
    color: 'text-blue-700 bg-blue-50 border-blue-200',
    steps: ['Hook', 'Tension', 'Shift', 'Proof', 'CTA'],
  },
};

function getPath(format: AdFormat): NarrativePath {
  return ['ugc_direct_to_camera', 'ugc_lifestyle_mixed', 'founder_talking_head'].includes(format)
    ? 'ugc'
    : 'cinematic';
}

// Map setup-wizard ad_category → recommended AdFormat
const CATEGORY_TO_FORMAT: Record<string, AdFormat> = {
  ugc_testimonial: 'ugc_direct_to_camera',
  founder_talking_head: 'founder_talking_head',
  problem_solution: 'ugc_lifestyle_mixed',
  product_demo_lifestyle: 'product_led_visual',
  inner_monologue: 'ugc_direct_to_camera',
  cinematic_narration: 'cinematic_broll_voiceover',
  cinematic_broll: 'cinematic_broll_voiceover',
};

const CATEGORY_LABELS: Record<string, string> = {
  ugc_testimonial: 'UGC Testimonial',
  founder_talking_head: 'Founder Talking Head',
  problem_solution: 'Problem-Solution',
  product_demo_lifestyle: 'Product Demo & Lifestyle',
  inner_monologue: 'Inner Monologue',
  cinematic_narration: 'Cinematic Narration',
  cinematic_broll: 'Cinematic B-Roll',
};

export default function FormatDecisionCheckpoint({
  project,
  onApprove,
  onBack,
}: FormatDecisionCheckpointProps) {
  const isMockMode = isTestModeEnabled();

  // Auto-select from category; allow user to override
  const recommendedFormat: AdFormat =
    project.format_decision?.selected_format ??
    CATEGORY_TO_FORMAT[project.ad_category] ??
    'ugc_direct_to_camera';

  const [selected, setSelected] = useState<AdFormat>(recommendedFormat);
  const [showAllFormats, setShowAllFormats] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  const categoryLabel = CATEGORY_LABELS[project.ad_category] ?? project.ad_category;
  const isRecommended = selected === recommendedFormat;

  const selectedOption = FORMAT_OPTIONS.find((f) => f.format === selected)!;
  const selectedPath = getPath(selected);
  const narrative = PATH_NARRATIVES[selectedPath];

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const decision: FormatDecision = {
        selected_format: selected,
        selected_path: selectedPath,
        narrative_structure: selectedOption.narrative_structure,
        lipsync_required: selectedOption.lipsync_required,
        requires_avatar: selectedOption.requires_avatar,
        recommended_tone: selectedPath === 'ugc' ? 'Conversational, authentic, direct' : 'Cinematic, evocative, measured',
      };
      await onApprove(decision);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <span className="text-xs font-semibold uppercase tracking-widest text-green-600 bg-green-50 px-3 py-1 rounded-full">
          TOW · Stage 4 of 13
        </span>
        <h2 className="text-2xl font-bold text-gray-900 mt-3">🎬 Format Confirmation</h2>
        <p className="text-gray-500 mt-1">
          Based on your ad style selection, we've matched the optimal format and narrative path.
          Review and confirm — or switch if you want a different approach.
        </p>

        {/* From setup wizard — shows what user already chose */}
        {project.ad_category && (
          <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
            <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full font-medium text-xs">
              🎬 Your Ad Style: {categoryLabel}
            </span>
            <span className="text-gray-400">→ mapped to →</span>
            <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full font-medium text-xs">
              {FORMAT_OPTIONS.find(f => f.format === recommendedFormat)?.label}
            </span>
          </div>
        )}
      </div>

      {/* Recommended format — large confirmation card */}
      {(() => {
        const opt = FORMAT_OPTIONS.find(f => f.format === selected)!;
        const path = getPath(selected);
        const narrative = PATH_NARRATIVES[path];
        return (
          <div className="bg-white rounded-xl border-2 border-green-400 shadow-md p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex flex-wrap gap-2 mb-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                    path === 'ugc' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                  }`}>
                    {path === 'ugc' ? 'UGC Path' : 'Cinematic Path'}
                  </span>
                  {opt.lipsync_required && (
                    <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">🎤 Lipsync</span>
                  )}
                  {!opt.requires_avatar && (
                    <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">No Avatar</span>
                  )}
                  {isRecommended && (
                    <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-semibold">✓ Recommended</span>
                  )}
                </div>
                <h3 className="text-lg font-bold text-gray-900">{opt.label}</h3>
                <p className="text-sm text-gray-600 mt-1">{opt.description}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Narrative */}
              <div className={`p-3 rounded-lg border ${narrative.color}`}>
                <p className="text-xs font-bold mb-2">{narrative.label}</p>
                <div className="flex items-center gap-1 flex-wrap">
                  {narrative.steps.map((step, i) => (
                    <React.Fragment key={step}>
                      <span className="text-xs font-medium">{step}</span>
                      {i < narrative.steps.length - 1 && <span className="text-xs opacity-50">→</span>}
                    </React.Fragment>
                  ))}
                </div>
                <p className="text-xs mt-1.5 opacity-70">Used to structure your script in Stage 5.</p>
              </div>

              {/* Pros */}
              <div className="p-3 rounded-lg bg-green-50 border border-green-100">
                <p className="text-xs font-bold text-green-800 mb-2">Why this works</p>
                {opt.pros.map((pro, i) => (
                  <p key={i} className="text-xs text-green-700">✓ {pro}</p>
                ))}
              </div>

              {/* Locked settings */}
              <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                <p className="text-xs font-bold text-gray-700 mb-2">Locked settings</p>
                <div className="space-y-1.5 text-xs text-gray-600">
                  <p>{opt.requires_avatar ? '✅' : '❌'} Avatar required</p>
                  <p>{opt.lipsync_required ? '✅' : '❌'} Lipsync</p>
                  <p>🎭 Tone: {path === 'ugc' ? 'Authentic, direct' : 'Cinematic, evocative'}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Toggle: switch format */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-5 py-4">
        <p className="text-sm text-gray-600">
          {showAllFormats ? 'Select a different format below:' : 'Want a different format?'}
        </p>
        <button
          onClick={() => setShowAllFormats(!showAllFormats)}
          className="text-sm text-green-600 hover:text-green-700 font-medium border border-green-200 hover:border-green-400 px-3 py-1.5 rounded-lg transition-colors"
        >
          {showAllFormats ? '↑ Collapse' : '⇄ Switch Format'}
        </button>
      </div>

      {/* All-format grid — only visible when user wants to override */}
      {showAllFormats && (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {FORMAT_OPTIONS.map((opt) => {
          const isSelected = selected === opt.format;
          const path = getPath(opt.format);
          return (
            <button
              key={opt.format}
              onClick={() => setSelected(opt.format)}
              className={`p-5 rounded-xl border-2 text-left transition-all ${
                isSelected
                  ? 'border-green-500 bg-green-50 shadow-md ring-2 ring-green-200'
                  : 'border-gray-200 bg-white hover:border-green-200 hover:shadow-sm'
              }`}
            >
              {/* Badges */}
              <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${
                  path === 'ugc' ? 'bg-green-100 text-green-700 border-green-200' : 'bg-blue-100 text-blue-700 border-blue-200'
                }`}>
                  {path === 'ugc' ? 'UGC Path' : 'Cinematic Path'}
                </span>
                {opt.lipsync_required && (
                  <span className="text-xs bg-orange-100 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full">
                    🎤 Lipsync
                  </span>
                )}
                {!opt.requires_avatar && (
                  <span className="text-xs bg-gray-100 text-gray-500 border border-gray-200 px-2 py-0.5 rounded-full">
                    No Avatar
                  </span>
                )}
              </div>

              <p className="font-semibold text-gray-900 text-sm">{opt.label}</p>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{opt.description}</p>

              {/* Pros */}
              <div className="mt-3 space-y-0.5">
                {opt.pros.slice(0, 2).map((pro, i) => (
                  <p key={i} className="text-xs text-green-700 flex items-start gap-1">
                    <span className="mt-0.5">✓</span> {pro}
                  </p>
                ))}
              </div>

              {/* Recommended for */}
              <div className="mt-2 flex flex-wrap gap-1">
                {opt.recommended_for.slice(0, 2).map((r, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                    {r}
                  </span>
                ))}
              </div>

              {isSelected && (
                <div className="mt-3 pt-3 border-t border-green-200">
                  <p className="text-xs font-semibold text-green-700">✅ Selected</p>
                </div>
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* Action Bar */}
      {(() => {
        const opt = FORMAT_OPTIONS.find(f => f.format === selected)!;
        const path = getPath(selected);
        const narrative = PATH_NARRATIVES[path];
        return (
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center justify-between gap-4">
            {onBack && (
              <button
                onClick={onBack}
                className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors"
              >
                ← Back to Foundation
              </button>
            )}
            <div className="flex-1" />
            <p className="text-sm text-gray-500 hidden md:block">
              Next: <strong>Script</strong> — written using the {narrative.label} template.
            </p>
            <button
              onClick={handleApprove}
              disabled={isApproving}
              className="px-8 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 font-semibold text-base transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isApproving ? (
                <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Confirming Format…</>
              ) : (
                `✅ Confirm — ${opt.label}`
              )}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
