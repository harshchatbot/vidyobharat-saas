'use client';

/**
 * TOW Stage 3 — Foundation
 *
 * STRATEGY ONLY. Does NOT generate the script or scene breakdown.
 *
 * Outputs:
 *   AD DNA           — Core strategic essence of the ad (1–2 sentences)
 *   CUSTOMER AVATAR  — Detailed profile of the target customer
 *   CAMPAIGN ROLE    — Awareness / Consideration / Conversion / Retention
 *   MESSAGE MAP      — Primary message, supporting points, emotional trigger
 *   MAIN MARKETING ANGLE — Sharpest single hook
 *   FINAL STRATEGIC SUMMARY — One-paragraph synthesis and recommendation
 *
 * Script generation (Stage 5) happens AFTER Format Decision (Stage 4).
 * Scene breakdown (Stage 7) happens AFTER Character Lock (Stage 6).
 */

import React, { useEffect, useRef, useState } from 'react';
import { Foundation, StoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import { generateMockFoundation, simulateDelay } from '../services/mockDataService';

interface FoundationCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onBack?: () => void;
}

export default function FoundationCheckpoint({ project, onApprove, onBack }: FoundationCheckpointProps) {
  const isMockMode = isTestModeEnabled();
  const [foundation, setFoundation] = useState<Foundation | null>(project.foundation ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const generatedRef = useRef(false);

  useEffect(() => {
    if (foundation || generatedRef.current) return;
    generatedRef.current = true;
    setIsGenerating(true);

    const generate = async () => {
      try {
        if (isMockMode) {
          await simulateDelay(2000);
          setFoundation(
            generateMockFoundation(
              project.ad_category,
              project.brief_data,
              project.business_brief,
              {
                avatar_name: project.avatar_name,
                platform: project.platform,
                tone: project.tone,
                language: project.language,
                production_path: project.production_path,
              }
            )
          );
        }
        // Real mode: backend calls Gemini Flash with PSP context
      } catch {
        setLocalError('Failed to generate Foundation. Please try again.');
      } finally {
        setIsGenerating(false);
      }
    };

    generate();
  }, [
    foundation,
    isMockMode,
    project.ad_category,
    project.brief_data,
    project.business_brief,
    project.avatar_name,
    project.platform,
    project.tone,
    project.language,
    project.production_path,
  ]);

  const handleApprove = async () => {
    setIsApproving(true);
    try { await onApprove(); }
    finally { setIsApproving(false); }
  };

  if (isGenerating) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 text-center">
        <div className="inline-block animate-spin rounded-full h-14 w-14 border-b-4 border-purple-600 mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">🧠 Building Strategic Foundation</h2>
        <p className="text-gray-500">Deriving AD DNA, Customer Avatar, Marketing Angle…</p>
        <p className="text-xs text-gray-400 mt-2">
          No script. No scenes. Pure strategy — everything the AI needs to make smart creative choices.
        </p>
        <div className="mt-6 flex justify-center flex-wrap gap-2">
          {['AD DNA', 'Customer Avatar', 'Campaign Role', 'Message Map', 'Angle', 'Summary'].map((s) => (
            <span key={s} className="text-xs bg-purple-100 text-purple-700 px-3 py-1 rounded-full animate-pulse">
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (!foundation) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8 text-center">
        <p className="text-red-600 font-medium">{localError ?? 'Failed to generate Foundation.'}</p>
        <button
          onClick={() => { generatedRef.current = false; setFoundation(null); setLocalError(null); }}
          className="mt-4 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium"
        >
          ↺ Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-purple-600 bg-purple-50 px-3 py-1 rounded-full">
              TOW · Stage 3 of 13
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-3">🧠 Foundation — Strategy</h2>
            <p className="text-gray-500 mt-1">
              Strategic foundation only — no script, no scenes yet. Approve to proceed
              to <strong>Format Decision</strong>, which determines your narrative path and script template.
            </p>
          </div>
          <button
            onClick={() => { generatedRef.current = false; setFoundation(null); }}
            className="text-sm text-gray-500 hover:text-purple-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-purple-300 transition-colors"
          >
            ↺ Regenerate
          </button>
        </div>
      </div>

      {/* AD DNA */}
      <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-purple-600 mb-2">🧬 AD DNA</p>
        <p className="text-lg font-semibold text-gray-900">{foundation.ad_dna}</p>
        <p className="text-xs text-gray-400 mt-2">
          Core strategic essence — this phrase guides every creative decision downstream.
        </p>
      </div>

      {/* Main Marketing Angle */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
        <p className="text-xs font-semibold uppercase tracking-widest text-amber-700 mb-2">🎣 Main Marketing Angle</p>
        <p className="text-lg font-semibold text-gray-900">{foundation.main_marketing_angle}</p>
        <p className="text-xs text-gray-400 mt-2">
          The sharpest single hook — this is the angle the script will be built around.
        </p>
      </div>

      {/* Customer Avatar */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wider">🧑 Customer Avatar</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AvatarRow label="Name / Persona" value={foundation.customer_avatar.name} />
          <AvatarRow label="Age Range" value={foundation.customer_avatar.age_range} />
          <AvatarRow label="Occupation" value={foundation.customer_avatar.occupation} />
          <AvatarRow label="Daily Struggle" value={foundation.customer_avatar.daily_struggle} />
          <AvatarRow label="What They've Tried" value={foundation.customer_avatar.what_they_have_tried} />
          <AvatarRow label="What They Truly Want" value={foundation.customer_avatar.what_they_truly_want} />
        </div>
        <div className="mt-4 p-4 bg-purple-50 rounded-lg">
          <p className="text-xs font-semibold text-purple-700 mb-1">Desired Transformation</p>
          <p className="text-sm text-gray-800">{foundation.customer_avatar.desired_transformation}</p>
        </div>
      </div>

      {/* Campaign Role + Message Map */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">🗺️ Campaign Role</p>
          <p className="text-sm text-gray-800">{foundation.campaign_role}</p>
          <p className="text-xs text-gray-400 mt-3">
            Where this ad sits in the funnel determines pacing, CTA strength, and proof requirements.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <p className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">💬 Message Map</p>
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Primary Message</p>
              <p className="text-sm text-gray-800 mt-0.5">{foundation.message_map.primary_message}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase">Emotional Trigger</p>
              <p className="text-sm text-amber-700 mt-0.5">{foundation.message_map.emotional_trigger}</p>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase mb-1">Supporting Points</p>
              <ul className="space-y-1">
                {foundation.message_map.supporting_points.map((p, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className="text-purple-400 mt-0.5">✦</span> {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Final Strategic Summary */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wider">📋 Final Strategic Summary</p>
        <p className="text-sm text-gray-700 leading-relaxed">{foundation.final_strategic_summary}</p>
      </div>

      {/* What comes next callout */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-5">
        <p className="text-sm font-semibold text-blue-800">📌 What happens after approval?</p>
        <ol className="mt-2 space-y-1.5 text-sm text-blue-700">
          <li><strong>Stage 4:</strong> Format Decision — compare 6 ad formats, choose one, lock narrative path</li>
          <li><strong>Stage 5:</strong> Script — written using the chosen format's template (UGC or Cinematic path)</li>
          <li><strong>Stage 6:</strong> Character / Face Lock — consistent identity across all scenes</li>
          <li><strong>Stage 7:</strong> Scene Breakdown — based on approved script + character</li>
        </ol>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center justify-between gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors"
          >
            ← Back to PSP
          </button>
        )}
        <div className="flex-1" />
        <p className="text-sm text-gray-500 hidden md:block">
          Next: <strong>Format Decision</strong> — choose your ad format and narrative path.
        </p>
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-8 py-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 font-semibold text-base transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isApproving ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Approving…</>
          ) : (
            '✅ Approve Foundation'
          )}
        </button>
      </div>
    </div>
  );
}

function AvatarRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase mb-0.5">{label}</p>
      <p className="text-sm text-gray-800">{value}</p>
    </div>
  );
}
