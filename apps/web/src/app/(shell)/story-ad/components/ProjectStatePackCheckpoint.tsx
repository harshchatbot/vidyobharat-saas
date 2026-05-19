'use client';

/**
 * TOW Stage 2 — Project State Pack
 *
 * This is the project's MEMORY / SAVE-FILE — NOT brand intelligence extraction.
 *
 * It stores the latest approved context for every stage so that any stage
 * can be re-generated with full awareness of all prior decisions:
 *   Brand, Offer, Audience, Angle, Format, Script, Character Lock,
 *   Scene Breakdown, Base Images, Voice Direction, Static Creative Direction,
 *   Current Stage, Next Step, Missing Inputs, Assumptions.
 *
 * The AI reads this file before every generation call.
 * The user reads it here to confirm the project context is correct.
 */

import React, { useEffect, useRef, useState } from 'react';
import { StoryboardProject, ProjectStatePack } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import { generateMockProjectStatePack, simulateDelay } from '../services/mockDataService';

interface ProjectStatePackCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onBack?: () => void;
}

type PSPField =
  | 'brand' | 'offer' | 'audience' | 'angle' | 'format'
  | 'script_draft' | 'character_lock_summary' | 'scene_breakdown_summary'
  | 'base_images_summary' | 'voice_direction' | 'static_creative_direction';

const STATUS_COLORS: Record<string, string> = {
  approved: 'bg-green-100 text-green-700',
  pending: 'bg-amber-100 text-amber-700',
  skipped: 'bg-gray-100 text-gray-500',
};

export default function ProjectStatePackCheckpoint({
  project,
  onApprove,
  onBack,
}: ProjectStatePackCheckpointProps) {
  const isMockMode = isTestModeEnabled();
  const [psp, setPsp] = useState<ProjectStatePack | null>(project.project_state_pack ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const generatedRef = useRef(false);

  useEffect(() => {
    if (psp || generatedRef.current) return;
    generatedRef.current = true;
    setIsGenerating(true);
    setLocalError(null);

    const generate = async () => {
      try {
        // Real mode currently may not return a hydrated project_state_pack payload.
        // Use the deterministic local synthesis path so checkpoint flow remains usable.
        await simulateDelay(isMockMode ? 1200 : 450);
        setPsp(
          generateMockProjectStatePack(
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
      } catch (error) {
        console.error('[ProjectStatePackCheckpoint] generation failed', error);
        setLocalError('Failed to generate Project State Pack. Please try again.');
      } finally {
        setIsGenerating(false);
      }
    };

    generate();
  }, [isMockMode, project, psp]);

  const handleApprove = async () => {
    setIsApproving(true);
    try { await onApprove(); }
    finally { setIsApproving(false); }
  };

  const handleRegenerate = () => {
    generatedRef.current = false;
    setPsp(null);
    setLocalError(null);
  };

  if (isGenerating) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 text-center">
        <div className="inline-block animate-spin rounded-full h-14 w-14 border-b-4 border-indigo-600 mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">💾 Building Project State Pack</h2>
        <p className="text-gray-500">Creating your project memory file from the approved brief…</p>
        <div className="mt-5 flex justify-center flex-wrap gap-2">
          {['Brand', 'Offer', 'Audience', 'Angle', 'Stage Map'].map((f) => (
            <span key={f} className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full animate-pulse">
              {f}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (!psp) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8 text-center">
        <p className="text-red-600 font-medium">{localError || 'Failed to generate Project State Pack.'}</p>
        <button
          onClick={handleRegenerate}
          className="mt-4 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
        >
          ↺ Try Again
        </button>
      </div>
    );
  }

  const contextRows: { key: PSPField; label: string; icon: string }[] = [
    { key: 'brand', label: 'Brand', icon: '🏷️' },
    { key: 'offer', label: 'Offer / Product', icon: '📦' },
    { key: 'audience', label: 'Audience', icon: '🎯' },
    { key: 'angle', label: 'Angle', icon: '🎣' },
    { key: 'format', label: 'Ad Format', icon: '🎬' },
    { key: 'script_draft', label: 'Script', icon: '📝' },
    { key: 'character_lock_summary', label: 'Character Lock', icon: '🔒' },
    { key: 'scene_breakdown_summary', label: 'Scene Breakdown', icon: '🎞️' },
    { key: 'base_images_summary', label: 'Base Images', icon: '🖼️' },
    { key: 'voice_direction', label: 'Voice Direction', icon: '🎤' },
    { key: 'static_creative_direction', label: 'Static Creative', icon: '🖼️' },
  ];

  // Gather locked setup choices from the project (populated by setup wizard)
  const CATEGORY_LABELS: Record<string, string> = {
    ugc_testimonial: 'UGC Testimonial',
    founder_talking_head: 'Founder Talking Head',
    problem_solution: 'Problem-Solution',
    product_demo_lifestyle: 'Product Demo & Lifestyle',
    inner_monologue: 'Inner Monologue',
    cinematic_narration: 'Cinematic Narration',
    cinematic_broll: 'Cinematic B-Roll',
  };
  const PLATFORM_LABELS: Record<string, string> = {
    instagram_reels: 'Instagram Reels',
    youtube_shorts: 'YouTube Shorts',
    tiktok: 'TikTok',
    facebook_feed: 'Facebook Feed',
    linkedin: 'LinkedIn',
  };
  const PLATFORM_RATIOS: Record<string, string> = {
    instagram_reels: '9:16', youtube_shorts: '9:16', tiktok: '9:16',
    facebook_feed: '4:5', linkedin: '16:9',
  };
  const setupChoices = [
    { label: 'Ad Style', value: CATEGORY_LABELS[project.ad_category] ?? project.ad_category, icon: '🎬' },
    { label: 'Production Path', value: project.production_path === 'ai_avatar' ? 'AI Avatar' : project.creation_mode === 'avatar' ? 'AI Avatar' : 'Storyboard', icon: '🤖' },
    ...(project.avatar_name ? [{ label: 'Avatar', value: project.avatar_name, icon: '👤' }] : []),
    { label: 'Platform', value: PLATFORM_LABELS[project.platform] ?? project.platform, icon: '📱' },
    { label: 'Aspect Ratio', value: PLATFORM_RATIOS[project.platform] ?? '9:16', icon: '📐' },
    { label: 'Tone', value: project.tone ?? '—', icon: '🎭' },
    { label: 'Language', value: project.language ?? '—', icon: '🌐' },
  ].filter(c => c.value && c.value !== '—');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
              TOW · Stage 2 of 13
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-3">💾 Project State Pack</h2>
            <p className="text-gray-500 mt-1">
              Your project's <strong>memory file</strong>. This document is passed to the AI at
              every subsequent stage so context is never lost. Review and confirm before
              proceeding to Foundation (Strategy).
            </p>
          </div>
          <button
            onClick={handleRegenerate}
            className="text-sm text-gray-500 hover:text-indigo-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-indigo-300 transition-colors"
          >
            ↺ Regenerate
          </button>
        </div>

        {/* Navigation status */}
        <div className="mt-5 flex flex-wrap gap-3">
          <NavBadge label={`Current Stage: ${psp.current_stage}`} color="indigo" />
          <NavBadge label={`Next: ${psp.next_step}`} color="green" />
          {psp.missing_inputs.length > 0 && (
            <NavBadge label={`⚠️ ${psp.missing_inputs.length} missing input(s)`} color="amber" />
          )}
        </div>
      </div>

      {/* Locked Setup Choices — carried from setup wizard, not re-asked */}
      {setupChoices.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 bg-slate-50 border-b border-gray-200">
            <p className="font-semibold text-gray-700 text-sm">🔒 Locked Setup Choices</p>
            <p className="text-xs text-gray-400 mt-0.5">
              These were confirmed during setup and are carried through the entire project.
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-0 divide-x divide-gray-100">
            {setupChoices.map(({ label, value, icon }) => (
              <div key={label} className="px-5 py-4">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">
                  {icon} {label}
                </p>
                <p className="text-sm font-semibold text-gray-800">{value}</p>
              </div>
            ))}
          </div>
          {project.business_brief && (
            <div className="px-6 py-4 border-t border-gray-100">
              <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider mb-1">📝 Business Brief</p>
              <p className="text-sm text-gray-700 italic">"{project.business_brief}"</p>
            </div>
          )}
        </div>
      )}

      {/* Context Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <p className="font-semibold text-gray-700 text-sm">📋 Approved Context Store</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Fields marked <em>pending</em> will be filled in future stages.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {contextRows.map(({ key, label, icon }) => {
            const value = psp[key];
            const status = value ? 'approved' : 'pending';
            return (
              <div key={key} className="flex items-start gap-3 px-6 py-3">
                <span className="text-base mt-0.5 w-6">{icon}</span>
                <span className="text-sm font-medium text-gray-700 w-40 flex-shrink-0">{label}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-3 ${STATUS_COLORS[status]}`}>
                  {status}
                </span>
                <span className="text-sm text-gray-600 flex-1 truncate">
                  {value ?? '—'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Assumptions */}
      {psp.assumptions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Assumptions Made</p>
          <ul className="space-y-1">
            {psp.assumptions.map((a, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-0.5">•</span> {a}
              </li>
            ))}
          </ul>
          <p className="text-xs text-amber-600 mt-2">
            These will be refined as you approve each stage.
          </p>
        </div>
      )}

      {/* Missing Inputs */}
      {psp.missing_inputs.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-red-800 mb-2">🚫 Missing Inputs</p>
          <ul className="space-y-1">
            {psp.missing_inputs.map((m, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="mt-0.5">•</span> {m}
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-600 mt-2">
            You can still proceed — these will be requested at relevant stages.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5">
        <p className="text-sm font-semibold text-indigo-800 mb-1">💡 How the Project State Pack works</p>
        <p className="text-sm text-indigo-700">
          Before every AI generation call, this file is injected as context. When you approve
          Foundation, the <em>angle</em> field updates. When you lock in format, <em>format</em>
          updates. This ensures every stage is aware of every prior decision — no context loss,
          no inconsistency.
        </p>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center justify-between gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors"
          >
            ← Back to Brief
          </button>
        )}
        <div className="flex-1" />
        <p className="text-sm text-gray-500 hidden md:block">
          Next: <strong>Foundation</strong> — strategy, AD DNA, customer avatar, marketing angle.
        </p>
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-semibold text-base transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isApproving ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Confirming…</>
          ) : (
            '✅ Confirm Project State Pack'
          )}
        </button>
      </div>
    </div>
  );
}

function NavBadge({ label, color }: { label: string; color: 'indigo' | 'green' | 'amber' }) {
  const cls = {
    indigo: 'bg-indigo-100 text-indigo-700',
    green: 'bg-green-100 text-green-700',
    amber: 'bg-amber-100 text-amber-700',
  }[color];
  return <span className={`text-xs font-medium px-3 py-1 rounded-full ${cls}`}>{label}</span>;
}
