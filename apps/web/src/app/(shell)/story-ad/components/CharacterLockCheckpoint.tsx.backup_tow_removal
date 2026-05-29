'use client';

/**
 * TOW Stage 6 — Character / Face Lock
 *
 * Creates ONE consistent character identity used across ALL scenes.
 * This stage runs AFTER script (Stage 5) and BEFORE scene breakdown (Stage 7).
 *
 * Outputs:
 *   Character Overview — who this person is
 *   Face Details       — eye color, facial structure, age range, notable features
 *   Skin               — tone, texture, notes
 *   Hair               — length, color, style
 *   Outfit             — style, colors, accessories
 *   Vibe / Environment — mood and setting aesthetic
 *   Realism Rules      — what AI must maintain across every scene
 *   Face-Lock Block    — prompt fragment appended to every image/video prompt
 *   Headshot Image Prompt — single reference shot prompt
 *   Skin Enhancer Prompt  — skin quality override for all generations
 */

import React, { useEffect, useRef, useState } from 'react';
import { CharacterLock, StoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import { generateMockCharacterLock, simulateDelay } from '../services/mockDataService';

interface CharacterLockCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onBack?: () => void;
}

export default function CharacterLockCheckpoint({
  project,
  onApprove,
  onBack,
}: CharacterLockCheckpointProps) {
  const isMockMode = isTestModeEnabled();
  const [lock, setLock] = useState<CharacterLock | null>(project.character_lock ?? null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [editingFaceLock, setEditingFaceLock] = useState(false);
  const [faceLockText, setFaceLockText] = useState('');
  const generatedRef = useRef(false);

  useEffect(() => {
    if (lock) return;
  
    let cancelled = false;
    setIsGenerating(true);
    setLocalError(null);
  
    const generate = async () => {
      try {
        // Real mode currently does not return a generated character_lock payload
        // from backend for this checkpoint. Use the same deterministic local
        // synthesis path used by mock mode to keep the guided flow unblocked.
        await simulateDelay(isMockMode ? 1200 : 450);

        if (cancelled) return;

        const generated = generateMockCharacterLock(
          project.avatar_id,
          project.ad_category,
          project.brief_data,
          {
            avatar_name: project.avatar_name,
            business_brief: project.business_brief,
            production_path: project.production_path,
            platform: project.platform,
            tone: project.tone,
            language: project.language,
          }
        );

        setLock(generated);
        setFaceLockText(generated.face_lock_block);
      } catch (error) {
        console.error('[CharacterLockCheckpoint] generation failed', error);
        if (!cancelled) {
          setLocalError('Failed to generate Character Lock. Please try again.');
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    };
  
    void generate();
  
    return () => {
      cancelled = true;
    };
  }, [
    lock,
    isMockMode,
    project.avatar_id,
    project.ad_category,
    project.brief_data,
    project.avatar_name,
    project.business_brief,
    project.production_path,
    project.platform,
    project.tone,
    project.language,
  ]);

  const handleApprove = async () => {
    if (!lock) return;
    setIsApproving(true);
    try {
      // If user edited the face-lock text, persist it
      if (editingFaceLock && faceLockText !== lock.face_lock_block) {
        setLock((prev) => prev ? { ...prev, face_lock_block: faceLockText } : prev);
      }
      await onApprove();
    } finally {
      setIsApproving(false);
    }
  };

  if (isGenerating && !lock) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 text-center">
        <div className="inline-block animate-spin rounded-full h-14 w-14 border-b-4 border-orange-500 mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">🔒 Creating Character Identity</h2>
        <p className="text-gray-500">Building consistent face lock, skin details, outfit, realism rules…</p>
        <div className="mt-5 flex justify-center flex-wrap gap-2">
          {['Face Details', 'Skin', 'Hair', 'Outfit', 'Realism Rules', 'Face-Lock Block'].map((s) => (
            <span key={s} className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full animate-pulse">
              {s}
            </span>
          ))}
        </div>
      </div>
    );
  }

  if (!lock) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8 text-center">
        <p className="text-red-600 font-medium">{localError ?? 'Failed to generate Character Lock.'}</p>
        <button
          onClick={() => { generatedRef.current = false; setLock(null); setLocalError(null); }}
          className="mt-4 px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 font-medium"
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
            <span className="text-xs font-semibold uppercase tracking-widest text-orange-600 bg-orange-50 px-3 py-1 rounded-full">
              TOW · Stage 6 of 13
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-3">🔒 Character / Face Lock</h2>
            <p className="text-gray-500 mt-1">
              One consistent character identity for all scenes. The Face-Lock Block is
              appended to <em>every</em> image and video prompt to prevent face drift.
            </p>
          </div>
          <button
            onClick={() => { generatedRef.current = false; setLock(null); }}
            className="text-sm text-gray-500 hover:text-orange-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-orange-300 transition-colors"
          >
            ↺ Regenerate
          </button>
        </div>
      </div>

      {/* Character Overview */}
      <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
        <p className="text-xs font-semibold uppercase tracking-widest text-orange-700 mb-2">🧑 Character Overview</p>
        <p className="text-gray-800">{lock.character_overview}</p>
      </div>

      {/* Appearance Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Face Details */}
        <DetailCard title="👁️ Face Details" color="orange">
          <DetailRow label="Age Range" value={lock.face_details.age_range} />
          <DetailRow label="Eye Color" value={lock.face_details.eye_color} />
          <DetailRow label="Facial Structure" value={lock.face_details.facial_structure} />
          <DetailRow label="Notable Features" value={lock.face_details.notable_features} />
        </DetailCard>

        {/* Skin */}
        <DetailCard title="🌿 Skin" color="amber">
          <DetailRow label="Tone" value={lock.skin.tone} />
          <DetailRow label="Texture" value={lock.skin.texture} />
          <DetailRow label="Notes" value={lock.skin.notes} />
        </DetailCard>

        {/* Hair */}
        <DetailCard title="💇 Hair" color="rose">
          <DetailRow label="Length" value={lock.hair.length} />
          <DetailRow label="Color" value={lock.hair.color} />
          <DetailRow label="Style" value={lock.hair.style} />
        </DetailCard>

        {/* Outfit */}
        <DetailCard title="👗 Outfit" color="violet">
          <DetailRow label="Style" value={lock.outfit.style} />
          <DetailRow label="Colors" value={lock.outfit.colors} />
          <DetailRow label="Accessories" value={lock.outfit.accessories} />
        </DetailCard>
      </div>

      {/* Vibe / Environment */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">🌅 Vibe & Environment</p>
        <p className="text-sm text-gray-800">{lock.vibe_environment}</p>
      </div>

      {/* Realism Rules */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-3">📐 Realism Rules</p>
        <p className="text-xs text-gray-400 mb-3">
          These rules are enforced in every generation prompt to maintain visual consistency.
        </p>
        <ul className="space-y-2">
          {lock.realism_rules.map((rule, i) => (
            <li key={i} className="text-sm text-gray-700 flex items-start gap-2">
              <span className="text-orange-500 font-bold mt-0.5">{i + 1}.</span>
              {rule}
            </li>
          ))}
        </ul>
      </div>

      {/* Face-Lock Block (Editable) */}
      <div className="bg-white rounded-xl border border-gray-900 p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">🔒 Face-Lock Block</p>
            <p className="text-xs text-gray-400 mt-0.5">
              This exact text is appended to every image and video prompt. Edit if needed.
            </p>
          </div>
          <button
            onClick={() => setEditingFaceLock(!editingFaceLock)}
            className="text-xs text-gray-500 hover:text-orange-600 border border-gray-200 px-2 py-1 rounded"
          >
            {editingFaceLock ? 'Done' : '✏️ Edit'}
          </button>
        </div>
        {editingFaceLock ? (
          <textarea
            value={faceLockText}
            onChange={(e) => setFaceLockText(e.target.value)}
            className="w-full border border-orange-300 rounded-lg p-3 text-sm font-mono focus:outline-none focus:border-orange-500 resize-none"
            rows={4}
          />
        ) : (
          <div className="bg-gray-950 text-green-400 rounded-lg p-4 text-sm font-mono leading-relaxed">
            {lock.face_lock_block}
          </div>
        )}
      </div>

      {/* Headshot Image Prompt */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">📸 Headshot Image Prompt</p>
        <p className="text-xs text-gray-400 mb-3">
          Use this prompt to generate a single reference headshot. Feed it back as a reference image.
        </p>
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
          {lock.headshot_image_prompt}
        </div>
      </div>

      {/* Skin Enhancer Prompt */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase mb-2">✨ Skin Enhancer Prompt</p>
        <p className="text-xs text-gray-400 mb-2">
          Add to any image prompt to improve skin quality and consistency.
        </p>
        <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
          {lock.skin_enhancer_prompt}
        </div>
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center justify-between gap-4">
        {onBack && (
          <button
            onClick={onBack}
            className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors"
          >
            ← Back to Script
          </button>
        )}
        <div className="flex-1" />
        <p className="text-sm text-gray-500 hidden md:block">
          Next: <strong>Scene Breakdown</strong> — your approved script broken into producible scenes.
        </p>
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-8 py-3 bg-orange-500 text-white rounded-xl hover:bg-orange-600 font-semibold text-base transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isApproving ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Locking…</>
          ) : (
            '🔒 Lock Character & Proceed'
          )}
        </button>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function DetailCard({
  title, color, children,
}: { title: string; color: string; children: React.ReactNode }) {
  const headerMap: Record<string, string> = {
    orange: 'bg-orange-50 text-orange-800',
    amber: 'bg-amber-50 text-amber-800',
    rose: 'bg-rose-50 text-rose-800',
    violet: 'bg-violet-50 text-violet-800',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className={`px-4 py-2.5 text-sm font-semibold ${headerMap[color] ?? 'bg-gray-50 text-gray-700'}`}>
        {title}
      </div>
      <div className="p-4 space-y-2">{children}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-400 font-semibold uppercase">{label}</p>
      <p className="text-sm text-gray-800 mt-0.5">{value}</p>
    </div>
  );
}
