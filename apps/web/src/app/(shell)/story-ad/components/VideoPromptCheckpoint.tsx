'use client';

/**
 * TOW Stage 9 — Video Prompts
 *
 * Creates MOTION PROMPTS from approved base images.
 * Does NOT create new image prompts (that was Stage 8).
 *
 * Per scene, this stage outputs:
 *   Camera Behavior       — Static / pan-left / slow push-in / tracking shot + timing
 *   Subject Movement      — How avatar/product moves during the clip
 *   Environment Movement  — Background / ambient / light motion
 *   Continuity Rules      — What MUST remain consistent with the base image
 *   Negative Motion Rules — What AI must NOT do (face drift, artifacts, repositioning)
 */

import React, { useEffect, useRef, useState } from 'react';
import { SceneVideoPrompt, StoryboardProject, useStoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import { generateMockVideoPrompts, simulateDelay } from '../services/mockDataService';

interface VideoPromptCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onBack?: () => void;
}

export default function VideoPromptCheckpoint({
  project,
  onApprove,
  onBack,
}: VideoPromptCheckpointProps) {
  const isMockMode = isTestModeEnabled();
  const { getProject } = useStoryboardProject();
  const [usedLocalFallback, setUsedLocalFallback] = useState(false);
  const [prompts, setPrompts] = useState<SceneVideoPrompt[]>(project.video_prompts ?? []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(0);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const generatedRef = useRef(false);

  const normalizePrompt = (input: any, index: number): SceneVideoPrompt | null => {
    if (!input || typeof input !== 'object') return null;
    const sceneNumber = Number(input.scene_number ?? index + 1);
    const continuity = Array.isArray(input.continuity_rules)
      ? input.continuity_rules.map((item: any) => String(item))
      : [];
    const negative = Array.isArray(input.negative_motion_rules)
      ? input.negative_motion_rules.map((item: any) => String(item))
      : [];
    return {
      scene_number: Number.isFinite(sceneNumber) ? sceneNumber : index + 1,
      camera_behavior: String(input.camera_behavior || input.camera || 'Static medium shot with gentle handheld stability'),
      subject_movement: String(input.subject_movement || 'Natural small gestures with readable face framing'),
      environment_movement: String(input.environment_movement || 'Subtle ambient background motion only'),
      continuity_rules: continuity.length ? continuity : ['Preserve identity, outfit, and product continuity from approved storyboard frame'],
      negative_motion_rules: negative.length ? negative : ['No face drift, no limb warping, no abrupt camera jump'],
      lipsync_required: Boolean(input.lipsync_required ?? true),
      duration_seconds: Number(input.duration_seconds || 5),
      reference_mood: String(input.reference_mood || input.mood || 'Natural'),
    };
  };

  const extractPromptsFromProject = (value: any): SceneVideoPrompt[] => {
    const projectObj = value?.project || value;
    const candidates = [
      projectObj?.video_prompts,
      projectObj?.motion_prompts,
      projectObj?.scene_video_prompts,
      value?.video_prompts,
      value?.motion_prompts,
      value?.scene_video_prompts,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        return candidate
          .map((item, index) => normalizePrompt(item, index))
          .filter((item): item is SceneVideoPrompt => Boolean(item));
      }
    }
    const scenes = Array.isArray(projectObj?.scenes) ? projectObj.scenes : [];
    const sceneDerived = scenes
      .map((scene: any, index: number) =>
        normalizePrompt(
          scene.video_prompt || scene.motion_prompt
            ? {
                scene_number: scene.scene_number,
                camera_behavior: scene.video_prompt || scene.motion_prompt,
                subject_movement: scene.avatar_action,
                environment_movement: scene.environment,
                duration_seconds: scene.duration_seconds,
                reference_mood: scene.mood,
              }
            : null,
          index,
        ),
      )
      .filter((item: SceneVideoPrompt | null): item is SceneVideoPrompt => Boolean(item));
    return sceneDerived;
  };

  const deriveLocalPromptsFromApprovedScenes = (value: any): SceneVideoPrompt[] => {
    const projectObj = value?.project || value;
    const scenes = Array.isArray(projectObj?.scenes) ? projectObj.scenes : [];
    const approvedScenes = scenes.filter((scene: any) => scene?.user_approved === true || scene?.base_image_url);
    return approvedScenes
      .map((scene: any, index: number) =>
        normalizePrompt(
          {
            scene_number: scene.scene_number || index + 1,
            camera_behavior: `Start with ${scene.shot_type || 'medium'} framing and keep camera stable with subtle handheld drift.`,
            subject_movement: scene.avatar_action || 'Natural product demonstration with small controlled gestures.',
            environment_movement: scene.environment
              ? `Maintain continuity with ${scene.environment}; only subtle ambient movement.`
              : 'Keep background movement minimal and consistent.',
            continuity_rules: [
              'Preserve face identity and outfit exactly as approved frame.',
              'Preserve product shape, texture, and placement continuity.',
            ],
            negative_motion_rules: [
              'No sudden zooms, no perspective warping.',
              'No identity drift, no extra limbs or hand artifacts.',
            ],
            lipsync_required: true,
            duration_seconds: scene.duration_seconds || 5,
            reference_mood: scene.mood || 'Natural',
          },
          index,
        ),
      )
      .filter((item: SceneVideoPrompt | null): item is SceneVideoPrompt => Boolean(item));
  };

  useEffect(() => {
    const fromProject = extractPromptsFromProject(project);
    if (fromProject.length > 0) {
      setPrompts(fromProject);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, project.workflow_state]);

  useEffect(() => {
    if (prompts.length > 0 || generatedRef.current) return;
    generatedRef.current = true;
    setIsGenerating(true);
    setLocalError(null);
    setUsedLocalFallback(false);

    const generate = async () => {
      try {
        if (isMockMode) {
          await simulateDelay(1600);
          setPrompts(generateMockVideoPrompts(3));
          return;
        }

        console.log('[VideoPromptCheckpoint] motion generation started', { projectId: project.id });
        const initial = await getProject(project.id);
        let extracted = extractPromptsFromProject(initial);
        console.log('[VideoPromptCheckpoint] prompts found count', {
          projectId: project.id,
          count: extracted.length,
          source: 'initial_project_fetch',
        });

        const deadline = Date.now() + 90_000;
        while (extracted.length === 0 && Date.now() < deadline) {
          console.log('[VideoPromptCheckpoint] polling motion prompts', { projectId: project.id });
          await new Promise((resolve) => setTimeout(resolve, 2000));
          const latest = await getProject(project.id);
          extracted = extractPromptsFromProject(latest);
          console.log('[VideoPromptCheckpoint] prompts found count', {
            projectId: project.id,
            count: extracted.length,
            source: 'poll_project_fetch',
          });
        }

        if (extracted.length > 0) {
          setPrompts(extracted);
          return;
        }

        const localFallback = deriveLocalPromptsFromApprovedScenes(initial);
        if (localFallback.length > 0) {
          setPrompts(localFallback);
          setUsedLocalFallback(true);
          setLocalError(null);
          return;
        }
        setLocalError('No video prompts generated. Try Again');
      } catch {
        setLocalError('Failed to generate video prompts. Please try again.');
      } finally {
        setIsGenerating(false);
      }
    };

    void generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMockMode, prompts.length, project.id, getProject]);

  const handleFieldEdit = (
    idx: number,
    field: keyof SceneVideoPrompt,
    value: string | boolean | string[]
  ) => {
    setPrompts((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const handleApprove = async () => {
    console.log('[VideoPromptCheckpoint] approve clicked', {
      projectId: project.id,
      promptCount: prompts.length,
      usedLocalFallback,
    });
    setIsApproving(true);
    try { await onApprove(); }
    finally { setIsApproving(false); }
  };

  if (isGenerating) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 text-center">
        <div className="inline-block animate-spin rounded-full h-14 w-14 border-b-4 border-violet-600 mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">🎯 Building Motion Plan</h2>
        <p className="text-gray-500">Deriving per-scene camera moves, avatar behavior, and motion rules from your Visual Storyboard…</p>
        <p className="text-xs text-gray-400 mt-2">
          No new image prompts are created here — only motion directives for video generation.
        </p>
        <div className="mt-5 flex justify-center flex-wrap gap-2">
          {['Camera Behavior', 'Subject Motion', 'Environment', 'Continuity', 'Negative Rules'].map((s) => (
            <span key={s} className="text-xs bg-violet-100 text-violet-700 px-3 py-1 rounded-full animate-pulse">{s}</span>
          ))}
        </div>
      </div>
    );
  }

  if (prompts.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8 text-center">
        <p className="text-red-600 font-medium">{localError ?? 'No video prompts generated.'}</p>
        <button
          onClick={() => { generatedRef.current = false; setPrompts([]); setLocalError(null); }}
          className="mt-4 px-6 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 font-medium"
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
            <span className="text-xs font-semibold uppercase tracking-widest text-violet-600 bg-violet-50 px-3 py-1 rounded-full">
              TOW · Stage 9 of 13 — Motion Planning
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-3">🎯 Motion Planning</h2>
            <p className="text-gray-500 mt-1">
              Per-scene camera behavior, avatar movement, environment motion, continuity rules,
              and negative-motion rules — derived from your approved Visual Storyboard frames.
              No video generated here. This locks the motion blueprint before production.
            </p>
          </div>
          <button
            onClick={() => { generatedRef.current = false; setPrompts([]); }}
            className="text-sm text-gray-500 hover:text-violet-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-violet-300 transition-colors"
          >
            ↺ Regenerate All
          </button>
        </div>

        {/* Context note */}
        <div className="mt-4 p-3 bg-violet-50 border border-violet-100 rounded-lg text-xs text-violet-700">
          🎯 Motion rules are derived FROM your approved Visual Storyboard (Stage 8) — they describe
          how each approved frame animates, not how to create a new image. The Face-Lock Block
          from Character Lock (Stage 6) is embedded in every video generation call.
        </div>
        {usedLocalFallback ? (
          <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
            Local fallback mode: motion prompts were derived from approved scenes without calling paid generation APIs.
          </div>
        ) : null}
      </div>

      {/* Prompt Cards */}
      <div className="space-y-4">
        {prompts.map((prompt, idx) => (
          <div key={idx} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {/* Scene header */}
            <div
              className="flex items-center gap-3 px-5 py-3 bg-violet-50 border-b border-violet-100 cursor-pointer"
              onClick={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            >
              <div className="w-8 h-8 rounded-full bg-violet-200 text-violet-800 font-bold flex items-center justify-center text-sm">
                {prompt.scene_number}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-violet-900 text-sm">Scene {prompt.scene_number}</span>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                    {prompt.reference_mood}
                  </span>
                  <span className="text-xs text-gray-400">{prompt.duration_seconds}s</span>
                  {prompt.lipsync_required && (
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                      🎤 Lipsync
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setEditingIdx(editingIdx === idx ? null : idx); }}
                className="text-xs text-violet-600 border border-violet-200 px-2 py-0.5 rounded hover:bg-violet-100"
              >
                {editingIdx === idx ? 'Done' : '✏️ Edit'}
              </button>
              <span className="text-gray-400 text-sm">{expandedIdx === idx ? '▲' : '▼'}</span>
            </div>

            {expandedIdx === idx && (
              <div className="p-5 space-y-5">
                {/* Camera Behavior */}
                <PromptField
                  icon="📷"
                  label="Camera Behavior"
                  hint="Static shot, slow push-in, pan, tracking — include timing"
                  value={prompt.camera_behavior}
                  isEditing={editingIdx === idx}
                  onChange={(v) => handleFieldEdit(idx, 'camera_behavior', v)}
                />

                {/* Subject Movement */}
                <PromptField
                  icon="🧑"
                  label="Subject Movement"
                  hint="How avatar/product moves during the clip"
                  value={prompt.subject_movement}
                  isEditing={editingIdx === idx}
                  onChange={(v) => handleFieldEdit(idx, 'subject_movement', v)}
                />

                {/* Environment Movement */}
                <PromptField
                  icon="🌿"
                  label="Environment Movement"
                  hint="Background, ambient, light changes"
                  value={prompt.environment_movement}
                  isEditing={editingIdx === idx}
                  onChange={(v) => handleFieldEdit(idx, 'environment_movement', v)}
                />

                {/* Continuity Rules */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                    <span>🔗</span> Continuity Rules
                    <span className="font-normal text-gray-300 ml-1">— must remain consistent with base image</span>
                  </p>
                  <div className="space-y-1.5">
                    {prompt.continuity_rules.map((rule, ri) => (
                      <p key={ri} className="text-sm text-green-800 bg-green-50 rounded px-3 py-1.5 flex items-start gap-2">
                        <span className="text-green-500 mt-0.5 font-bold">✓</span> {rule}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Negative Motion Rules */}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase mb-2 flex items-center gap-1.5">
                    <span>🚫</span> Negative Motion Rules
                    <span className="font-normal text-gray-300 ml-1">— what AI must NOT do</span>
                  </p>
                  <div className="space-y-1.5">
                    {prompt.negative_motion_rules.map((rule, ri) => (
                      <p key={ri} className="text-sm text-red-800 bg-red-50 rounded px-3 py-1.5 flex items-start gap-2">
                        <span className="text-red-500 mt-0.5 font-bold">✗</span> {rule}
                      </p>
                    ))}
                  </div>
                </div>

                {/* Lipsync toggle */}
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
                  <span className="text-sm text-gray-600">Lipsync required for this scene</span>
                  <button
                    onClick={() => handleFieldEdit(idx, 'lipsync_required', !prompt.lipsync_required)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      prompt.lipsync_required ? 'bg-violet-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        prompt.lipsync_required ? 'translate-x-4' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Action Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center justify-between gap-4">
        {onBack && (
          <button onClick={onBack} className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors">
            ← Back to Visual Storyboard
          </button>
        )}
        <div className="flex-1" />
        <p className="text-sm text-gray-500 hidden md:block">
          Next: <strong>Voice Selection</strong> — choose TTS voice, pacing, and delivery style.
        </p>
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-8 py-3 bg-violet-600 text-white rounded-xl hover:bg-violet-700 font-semibold text-base transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isApproving ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Approving…</>
          ) : (
            '🎯 Approve Motion Plan'
          )}
        </button>
      </div>
    </div>
  );
}

// ── Field helper ──────────────────────────────────────────────────────────────

function PromptField({
  icon, label, hint, value, isEditing, onChange,
}: {
  icon: string;
  label: string;
  hint: string;
  value: string;
  isEditing: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5 flex items-center gap-1.5">
        <span>{icon}</span> {label}
        <span className="font-normal text-gray-300">— {hint}</span>
      </p>
      {isEditing ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full border border-violet-300 rounded-lg p-3 text-sm focus:outline-none focus:border-violet-500 resize-none"
          rows={3}
        />
      ) : (
        <p className="text-sm text-gray-800 bg-gray-50 rounded-lg px-3 py-2 leading-relaxed">{value}</p>
      )}
    </div>
  );
}
