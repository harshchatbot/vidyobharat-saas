'use client';

/**
 * TOW Stage 8 — Visual Storyboard (Storyboard Frames)
 *
 * Shows generated scene images in a professional agency-style storyboard grid.
 * Each card displays:
 *   - Generated image / placeholder frame
 *   - Scene number + scene type + duration + approval state
 *   - Spoken line (VO dialogue)
 *   - Visual description, shot type, mood, environment, avatar action
 * Actions per scene: Approve · Reject · Regenerate · Edit Prompt
 *
 * Thumbnail strip at the top lets users jump to any scene.
 * Layout: 2-column responsive grid (desktop), single column (mobile).
 */

import React, { useEffect, useRef, useState } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import BeautifulLoadingScreen from './BeautifulLoadingScreen';
import { generateMockScenes, simulateDelay } from '../services/mockDataService';
import { getCurrentUserIdOrThrow } from '@/lib/authUser';
import { motion, AnimatePresence } from 'framer-motion';

interface Scene {
  id: string;
  scene_number: number;
  scene_type: string;
  spoken_line: string;
  dialogue?: string;
  voice_line?: string;
  tts_text?: string;
  script_line?: string;
  narration?: string;
  visual_description: string;
  shot_type: string;
  mood?: string;
  environment?: string;
  avatar_action?: string;
  duration_seconds: number;
  base_image_url: string | null;
  image_url?: string | null;
  generated_image_url?: string | null;
  frame_url?: string | null;
  state: string;
  user_approved: boolean | null;
}

interface ImageCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onBack?: () => void;
  canGoBack?: boolean;
  isLoading?: boolean;
}

export default function ImageCheckpoint({
  project,
  onApprove,
  onBack,
  canGoBack = true,
  isLoading = false,
}: ImageCheckpointProps) {
  const {
    generateImages,
    approveImages,
    approveSceneImage,
    rejectSceneImage,
    regenerateSceneImage,
    loading,
  } = useStoryboardProject();

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [rejectionFeedback, setRejectionFeedback] = useState<Record<string, string>>({});
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null);
  const [editingPromptFor, setEditingPromptFor] = useState<string | null>(null);
  const [promptDraft, setPromptDraft] = useState<string>('');
  const [activeThumb, setActiveThumb] = useState<number>(1);
  const [showGeneratingImagesLoader, setShowGeneratingImagesLoader] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'review' | 'board'>('review');
  const [clientPreview, setClientPreview] = useState(false);
  const [previewSceneId, setPreviewSceneId] = useState<string | null>(null);
  const [previewImageFailed, setPreviewImageFailed] = useState(false);
  const [staleApprovalCount, setStaleApprovalCount] = useState(0);
  const sceneRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const isMockMode = isTestModeEnabled();
  const showDebug = process.env.NODE_ENV !== 'production';
  const getUserId = () => getCurrentUserIdOrThrow('Image checkpoint');
  const getSceneSpokenLine = (scene: Partial<Scene>): string =>
    String(scene.tts_text || '').trim() ||
    String(scene.voice_line || '').trim() ||
    String(scene.dialogue || '').trim() ||
    String(scene.script_line || '').trim() ||
    String(scene.narration || '').trim() ||
    String(scene.spoken_line || '').trim();

  const normalizeMockScenes = (count = 4): Scene[] =>
    generateMockScenes(count, {
      business_brief: project.business_brief,
      avatar_name: project.avatar_name,
      ad_style: project.ad_category,
      platform: project.platform,
      tone: project.tone,
      language: project.language,
    }).map((s) => ({
      id: s.id,
      scene_number: s.scene_number,
      scene_type: s.scene_type,
      spoken_line: s.spoken_line,
      visual_description: s.visual_description,
      shot_type: s.shot_type,
      mood: s.mood,
      environment: s.environment,
      avatar_action: s.avatar_action,
      duration_seconds: s.duration_seconds,
      base_image_url: s.base_image_url || null,
      image_url: s.base_image_url || null,
      generated_image_url: s.base_image_url || null,
      frame_url: s.base_image_url || null,
      state: s.state || 'image_awaiting_approval',
      user_approved: null,
    }));

  const resolveSceneFrameUrl = (scene: Partial<Scene>): string | null => {
    const candidates = [
      scene.base_image_url,
      scene.image_url,
      scene.generated_image_url,
      scene.frame_url,
    ];
    for (const item of candidates) {
      const value = String(item || '').trim();
      if (value) return value;
    }
    return null;
  };
  const hasFrameUrl = (scene: Partial<Scene>): boolean => Boolean(resolveSceneFrameUrl(scene));

  const normalizeFetchedScenes = (rawScenes: any[]): Scene[] =>
    rawScenes.map((raw) => {
      const frameUrl = resolveSceneFrameUrl(raw);
      const spokenLine =
        String(raw.tts_text || '').trim() ||
        String(raw.voice_line || '').trim() ||
        String(raw.dialogue || '').trim() ||
        String(raw.script_line || '').trim() ||
        String(raw.narration || '').trim() ||
        String(raw.spoken_line || '').trim();
      return {
        id: String(raw.id || ''),
        scene_number: Number(raw.scene_number || 0),
        scene_type: String(raw.scene_type || ''),
        spoken_line: spokenLine,
        dialogue: String(raw.dialogue || '').trim() || undefined,
        voice_line: String(raw.voice_line || '').trim() || undefined,
        tts_text: String(raw.tts_text || '').trim() || undefined,
        script_line: String(raw.script_line || '').trim() || undefined,
        narration: String(raw.narration || '').trim() || undefined,
        visual_description: String(raw.visual_description || ''),
        shot_type: String(raw.shot_type || ''),
        mood: raw.mood || undefined,
        environment: raw.environment || undefined,
        avatar_action: raw.avatar_action || undefined,
        duration_seconds: Number(raw.duration_seconds || 0),
        base_image_url: frameUrl,
        image_url: String(raw.image_url || frameUrl || ''),
        generated_image_url: String(raw.generated_image_url || frameUrl || ''),
        frame_url: String(raw.frame_url || frameUrl || ''),
        state: String(raw.state || ''),
        user_approved: raw.user_approved ?? null,
      };
    });

  const fetchScenes = async (showSpinner = false) => {
    if (isMockMode) return;
    try {
      if (showSpinner) setScenesLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/storyboard/${project.id}/storyboard`, {
        headers: { 'X-User-ID': getUserId() },
      });
      if (!response.ok) return;
      const data = await response.json();
      if (Array.isArray(data.scenes)) {
        const normalized = normalizeFetchedScenes(data.scenes);
        console.log('[ImageCheckpoint] normalized storyboard scenes', {
          projectId: project.id,
          sceneCount: normalized.length,
          withFrameCount: normalized.filter((scene) => Boolean(scene.base_image_url)).length,
          sample: normalized.slice(0, 2).map((scene) => ({ id: scene.id, base_image_url: scene.base_image_url })),
        });
        setScenes(normalized);
      }
      else setScenes([]);
    } catch (err) {
      console.error('[ImageCheckpoint] Failed to fetch scenes:', err);
    } finally {
      if (showSpinner) setScenesLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLocalError(null);
      if (isMockMode) {
        try {
          setScenesLoading(true);
          await simulateDelay(900);
          if (cancelled) return;
          setScenes(normalizeMockScenes(4));
        } catch {
          if (!cancelled) setLocalError('Failed to prepare mock storyboard frames.');
        } finally {
          if (!cancelled) setScenesLoading(false);
        }
        return;
      }
      if (project.id) await fetchScenes(true);
    };
    void load();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, isMockMode]);

  useEffect(() => {
    if (isMockMode || scenes.length === 0) return;
    let stale = 0;
    const normalized = scenes.map((scene) => {
      const hasImage = hasFrameUrl(scene);
      const isStaleApproval = scene.user_approved === true && !hasImage;
      if (isStaleApproval) stale += 1;
      return isStaleApproval ? { ...scene, user_approved: null, state: 'image_awaiting_approval' } : scene;
    });
    if (stale > 0) {
      setStaleApprovalCount(stale);
      setScenes(normalized);
      console.warn('[ImageCheckpoint] stale approvals cleared', {
        projectId: project.id,
        staleApprovalCount: stale,
      });
    } else {
      setStaleApprovalCount(0);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMockMode, scenes, project.id]);

  useEffect(() => {
    if (isMockMode || !project.id || scenes.length === 0) return;
    const hasMissing = scenes.some((s) => !s.base_image_url);
    const hasPending = scenes.some((s) => s.user_approved === null && s.base_image_url);
    if (!hasMissing && !hasPending) return;
    const interval = setInterval(() => void fetchScenes(false), 2000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, scenes, isMockMode]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleApproveAll = async () => {
    try {
      setLocalError(null);
      if (!isMockMode && scenes.some((scene) => !hasFrameUrl(scene))) {
        setLocalError('Generate all frames before approving.');
        return;
      }
      if (isMockMode) {
        setScenes((prev) => prev.map((s) => ({ ...s, user_approved: true, state: 'image_approved' })));
        await simulateDelay(500);
        await onApprove();
        return;
      }
      await approveImages(project.id);
      await fetchScenes(false);
      await onApprove();
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to approve frames.');
    }
  };

  const handleApproveScene = async (sceneId: string) => {
    try {
      setLocalError(null);
      const target = scenes.find((scene) => scene.id === sceneId);
      if (!target || !hasFrameUrl(target)) {
        setLocalError('Generate this frame before approving.');
        return;
      }
      if (isMockMode) {
        setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, user_approved: true, state: 'image_approved' } : s));
        return;
      }
      await approveSceneImage(project.id, sceneId);
      await fetchScenes(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to approve frame.');
    }
  };

  const handleRejectScene = (sceneId: string) => setShowFeedbackFor(sceneId);

  const handleSubmitRejection = async (sceneId: string) => {
    const feedback = rejectionFeedback[sceneId] || '';
    try {
      setLocalError(null);
      if (isMockMode) {
        setScenes((prev) => prev.map((s) => s.id === sceneId ? { ...s, user_approved: false, state: 'image_rejected' } : s));
        setShowFeedbackFor(null);
        setRejectionFeedback((prev) => ({ ...prev, [sceneId]: '' }));
        return;
      }
      await rejectSceneImage(project.id, sceneId, feedback);
      await fetchScenes(false);
      setShowFeedbackFor(null);
      setRejectionFeedback((prev) => ({ ...prev, [sceneId]: '' }));
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to reject frame.');
    }
  };

  const handleRegenerateScene = async (sceneId: string) => {
    if (isMockMode) {
      setShowGeneratingImagesLoader(true);
      await simulateDelay(800);
      const fresh = normalizeMockScenes(4);
      const replacement = fresh.find((s) => s.id === sceneId) ?? fresh[0];
      setScenes((prev) =>
        prev.map((s) => s.id === sceneId
          ? { ...s, base_image_url: replacement.base_image_url, user_approved: null, state: 'image_awaiting_approval' }
          : s
        )
      );
      setShowGeneratingImagesLoader(false);
      return;
    }
    try {
      setLocalError(null);
      const before = scenes.find((s) => s.id === sceneId)?.base_image_url || null;
      await regenerateSceneImage(project.id, sceneId);
      let attempts = 0;
      const maxAttempts = 60; // up to 2 minutes
      while (attempts < maxAttempts) {
        attempts += 1;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const response = await fetch(`${API_BASE_URL}/api/storyboard/${project.id}/scenes/${sceneId}`, {
          headers: { 'X-User-ID': getUserId() },
        });
        if (!response.ok) {
          continue;
        }
        const payload = await response.json();
        const refreshed = payload?.scene || null;
        const nextUrl = resolveSceneFrameUrl(refreshed);
        if (nextUrl && nextUrl !== before) {
          await fetchScenes(false);
          return;
        }
      }
      await fetchScenes(false);
      setLocalError('Scene regeneration is taking longer than expected. Please wait and refresh.');
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to regenerate scene.');
    }
  };

  const handleGenerateImages = async () => {
    try {
      setLocalError(null);
      if (scenes.length === 0) {
        setLocalError('No scenes found. Go back and regenerate the scene breakdown.');
        return;
      }
      if (isMockMode) {
        setShowGeneratingImagesLoader(true);
        await simulateDelay(1400);
        setScenes((prev) =>
          prev.map((s, i) => {
            const fresh = normalizeMockScenes(prev.length)[i];
            return { ...s, base_image_url: fresh?.base_image_url || s.base_image_url, user_approved: null, state: 'image_awaiting_approval' };
          })
        );
        setShowGeneratingImagesLoader(false);
        return;
      }
      const estimateRes = await fetch(`${API_BASE_URL}/api/storyboard/${project.id}/credit-estimate?operation=generate_base_images`, {
        headers: { 'X-User-ID': getUserId() },
      });
      if (estimateRes.ok) {
        const { estimate } = await estimateRes.json();
        if (!confirm(`Image generation costs ${estimate.cost_credits} credits. Balance: ${estimate.available_credits}. Proceed?`)) return;
        if (!estimate.can_afford) { alert('Insufficient credits.'); return; }
      }
      await generateImages(project.id, true);
      await fetchScenes(false);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Failed to generate images.');
      setShowGeneratingImagesLoader(false);
    }
  };

  const scrollToScene = (sceneNumber: number) => {
    setActiveThumb(sceneNumber);
    const scene = scenes.find((s) => s.scene_number === sceneNumber);
    if (scene && sceneRefs.current[scene.id]) {
      sceneRefs.current[scene.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const startEditPrompt = (scene: Scene) => {
    setEditingPromptFor(scene.id);
    setPromptDraft(scene.visual_description);
  };

  const saveEditPrompt = (sceneId: string) => {
    setScenes((prev) =>
      prev.map((s) => s.id === sceneId ? { ...s, visual_description: promptDraft } : s)
    );
    setEditingPromptFor(null);
    setPromptDraft('');
  };

  // ── Derived stats ──────────────────────────────────────────────────────────
  const totalScenes = scenes.length;
  const approvedCount = scenes.filter((s) => s.user_approved === true && hasFrameUrl(s)).length;
  const rejectedCount = scenes.filter((s) => s.user_approved === false && hasFrameUrl(s)).length;
  const pendingCount = scenes.filter((s) => hasFrameUrl(s) && s.user_approved !== true && s.user_approved !== false).length;
  const missingCount = scenes.filter((s) => !hasFrameUrl(s)).length;
  const allApproved = totalScenes > 0 && approvedCount === totalScenes;
  const previewScene = scenes.find((scene) => scene.id === previewSceneId) || null;
  const previewSceneImage = previewScene ? resolveSceneFrameUrl(previewScene) : null;
  const workflowState = String(project.workflow_state || '').toLowerCase();
  const showCharacterSheetPreparing =
    !isMockMode &&
    ((String(project.production_path || '').toLowerCase() === 'ai_avatar') ||
      (String(project.creation_mode || '').toLowerCase() === 'avatar') ||
      Boolean(project.avatar_id)) &&
    !project.character_reference_sheet_url &&
    (loading || isLoading || workflowState === 'images_generating');
  const showCharacterSheetFallback =
    !isMockMode &&
    Boolean(project.character_reference_sheet_fallback_to_golden_refs) &&
    !project.character_reference_sheet_url;
  const boardColumnsClass = totalScenes > 4 ? 'md:grid-cols-2 xl:grid-cols-3' : 'md:grid-cols-2';
  const productionStatusLabel = allApproved ? 'Ready for Motion Planning' : missingCount > 0 ? 'Awaiting Frame Generation' : 'In Review';
  const continuityFlags = {
    face: Boolean(project.character_reference_sheet_url || (project.avatar_reference_images || []).length > 0),
    product: Boolean((project.product_reference_images || []).length > 0 || project.product_image_url),
    outfit: Boolean((project.avatar_reference_images || []).length > 0),
    environment: scenes.some((scene) => Boolean(String(scene.environment || '').trim())),
  };

  useEffect(() => {
    if (!showDebug) return;
    console.log('[ImageCheckpoint] scene_approval_debug', {
      projectId: project.id,
      character_sheet_status: project.character_reference_sheet_status || null,
      character_sheet_fallback: Boolean(project.character_reference_sheet_fallback_to_golden_refs),
      scenes: scenes.map((scene) => {
        const imageExists = hasFrameUrl(scene);
        const computedStatus = scene.user_approved === true && imageExists
          ? 'approved'
          : scene.user_approved === false && imageExists
            ? 'rejected'
            : imageExists
              ? 'pending_review'
              : 'missing_frame';
        return {
          id: scene.id,
          image_url_exists: imageExists,
          user_approved: scene.user_approved,
          computed_approval_status: computedStatus,
        };
      }),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id, scenes, project.character_reference_sheet_status, project.character_reference_sheet_fallback_to_golden_refs]);

  useEffect(() => {
    if (!previewSceneId) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPreviewSceneId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [previewSceneId]);

  
  // ── Loading / error states ─────────────────────────────────────────────────
  if (showGeneratingImagesLoader) {
    return (
      <BeautifulLoadingScreen
        stage="images"
        isMockMode={isMockMode}
      />
    );
  }

  if (scenesLoading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center">
        <div className="text-center max-w-md">
          <div className="mx-auto mb-4 h-14 w-14 animate-spin rounded-full border-b-4 border-emerald-500" />
          <p className="font-bold text-gray-700 text-lg">
            {isMockMode ? 'Building mock storyboard frames…' : 'Loading storyboard…'}
          </p>
          <p className="mt-2 text-sm text-gray-500">Preparing scene images for review</p>
        </div>
      </div>
    );
  }

  if (!scenesLoading && scenes.length === 0) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <div className="text-center max-w-md">
          <p className="font-semibold text-gray-700">No storyboard frames yet</p>
          <p className="mt-2 text-sm text-gray-500">Go back to Scene Breakdown and generate scenes first.</p>
          <div className="mt-4 flex justify-center gap-3">
            {onBack && canGoBack && (
              <button onClick={onBack} className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                ← Back to Scene Breakdown
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Main render ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 rounded-2xl border border-border bg-bg p-3 sm:p-4 md:p-6">
      {showDebug && !clientPreview ? (
        <div className="rounded-xl border border-indigo-400/30 bg-indigo-500/10 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">Debug · Identity Locks</p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="text-xs text-indigo-900">
              <p>Avatar refs: {(project.avatar_reference_images || []).length}</p>
              <p>Product refs: {(project.product_reference_images || []).length}</p>
              <p>Character sheet: {project.character_reference_sheet_url ? 'available' : 'missing'}</p>
            </div>
            <div className="flex gap-3">
              {project.character_reference_sheet_url ? (
                <img
                  src={project.character_reference_sheet_url}
                  alt="Character reference sheet"
                  className="h-16 w-16 rounded border border-indigo-200 object-cover"
                />
              ) : null}
              {project.product_image_url ? (
                <img
                  src={project.product_image_url}
                  alt="Product reference"
                  className="h-16 w-16 rounded border border-indigo-200 object-cover"
                />
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Header ── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: 'easeOut' }}
        className="glass-card rounded-2xl border border-border p-5 sm:p-6 md:p-7"
      >
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[hsl(var(--color-accent))] bg-[hsl(var(--color-accent)/0.12)] px-3 py-1 rounded-full border border-[hsl(var(--color-accent)/0.3)]">
              Stage 8 · Visual Production Board
            </span>
            <h2 className="mt-3 text-2xl font-bold text-text sm:text-3xl">AI Creative Production Board</h2>
            <p className="mt-1 text-sm text-muted sm:text-base">
              Cinematic frame review with production-safe approvals, regeneration, and continuity visibility.
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {project.avatar_name ? <span className="rounded-full border border-border px-2.5 py-1 text-text">Avatar: {project.avatar_name}</span> : null}
              <span className="rounded-full border border-border px-2.5 py-1 text-text">{totalScenes} scenes</span>
              <span className="rounded-full border border-border px-2.5 py-1 text-text">{(project.target_ad_duration_seconds || project.selected_ad_duration_seconds || 0) || '?'}s</span>
              <span className="rounded-full border border-[hsl(var(--color-success)/0.4)] px-2.5 py-1 text-[hsl(var(--color-success))]">{productionStatusLabel}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center rounded-xl border border-border bg-surface p-1">
              <button
                onClick={() => setViewMode('review')}
                className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition ${viewMode === 'review' ? 'bg-bg text-text font-semibold' : 'text-muted hover:text-text'}`}
              >
                Review View
              </button>
              <button
                onClick={() => setViewMode('board')}
                className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition ${viewMode === 'board' ? 'bg-bg text-text font-semibold' : 'text-muted hover:text-text'}`}
              >
                Board View
              </button>
            </div>
            <button
              onClick={() => setClientPreview((prev) => !prev)}
              className={`px-3 py-2 text-xs sm:text-sm rounded-xl border transition ${clientPreview ? 'border-[hsl(var(--color-success)/0.6)] text-[hsl(var(--color-success))] bg-[hsl(var(--color-success)/0.1)]' : 'border-border text-text hover:bg-elevated'}`}
            >
              {clientPreview ? 'Exit Client Preview' : 'Client Preview'}
            </button>
            {!clientPreview ? (
              <>
                <button title="Coming soon" disabled className="px-3 py-2 text-xs rounded-xl border border-border text-muted cursor-not-allowed">Export PDF</button>
                <button title="Coming soon" disabled className="px-3 py-2 text-xs rounded-xl border border-border text-muted cursor-not-allowed">Share Board</button>
                <button title="Coming soon" disabled className="px-3 py-2 text-xs rounded-xl border border-border text-muted cursor-not-allowed">Presentation Mode</button>
              </>
            ) : null}
          </div>
        </div>

        {isMockMode && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2.5 text-sm text-green-800">
            🧪 Mock mode — placeholder images shown. No credits consumed.
          </div>
        )}
        {localError && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {localError}
          </div>
        )}
        {showCharacterSheetPreparing && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
            Creating character reference sheet…
          </div>
        )}
        {showCharacterSheetFallback && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Using golden avatar references because character sheet generation failed.
          </div>
        )}
        {staleApprovalCount > 0 && (
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
            {staleApprovalCount} stale approval{staleApprovalCount > 1 ? 's were' : ' was'} reset because frame URLs are missing.
          </div>
        )}
        {missingCount > 0 && (
          <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
            Generate all frames before approving.
          </div>
        )}
      </motion.div>

      {/* ── Thumbnail Strip ── */}
      <div className="rounded-xl border border-border bg-surface p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">
          Scene Navigator
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              onClick={() => scrollToScene(scene.scene_number)}
              className={`flex-shrink-0 group relative rounded-lg overflow-hidden border-2 transition-all ${
                activeThumb === scene.scene_number
                  ? 'border-[hsl(var(--color-accent))] shadow-soft'
                  : 'border-border hover:border-[hsl(var(--color-accent)/0.5)]'
              }`}
              style={{ width: 96, height: 64 }}
              title={`Scene ${scene.scene_number} — ${scene.scene_type}`}
            >
              {scene.base_image_url ? (
                <img
                  src={scene.base_image_url}
                  alt={`Scene ${scene.scene_number}`}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-elevated">
                  <span className="text-xs text-muted">🎬</span>
                </div>
              )}
              {/* Scene number overlay */}
              <div className="absolute inset-0 bg-black/30 flex items-end p-1">
                <span className="text-white text-xs font-bold leading-none">
                  {scene.scene_number}
                </span>
              </div>
              {/* Approval badge */}
              {scene.user_approved === true && hasFrameUrl(scene) && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs leading-none">✓</span>
                </div>
              )}
              {scene.user_approved === false && hasFrameUrl(scene) && (
                <div className="absolute top-1 right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs leading-none">✗</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats Bar ── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Total Scenes', value: totalScenes, color: 'blue' },
          { label: 'Approved', value: approvedCount, color: 'green' },
          { label: 'Pending', value: pendingCount, color: 'amber' },
          { label: 'Missing Frames', value: missingCount, color: 'amber' },
          { label: 'Rejected', value: rejectedCount, color: 'red' },
        ].map(({ label, value, color }) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className={`rounded-xl border p-4 ${
              color === 'blue' ? 'border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.1)]' :
              color === 'green' ? 'border-[hsl(var(--color-success)/0.35)] bg-[hsl(var(--color-success)/0.1)]' :
              color === 'red' ? 'border-[hsl(var(--color-danger)/0.35)] bg-[hsl(var(--color-danger)/0.1)]' :
              'border-[hsl(var(--color-warning)/0.35)] bg-[hsl(var(--color-warning)/0.1)]'
            }`}
          >
            <p className="mb-1 text-xs text-muted">{label}</p>
            <p className={`text-2xl font-bold ${
              color === 'blue' ? 'text-[hsl(var(--color-accent))]' :
              color === 'green' ? 'text-[hsl(var(--color-success))]' :
              color === 'red' ? 'text-[hsl(var(--color-danger))]' :
              'text-[hsl(var(--color-warning))]'
            }`}>{value}</p>
          </motion.div>
        ))}
      </div>

      {/* ── Storyboard Grid ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`${viewMode}-${clientPreview ? 'client' : 'ops'}`}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`grid grid-cols-1 ${viewMode === 'board' ? boardColumnsClass : 'md:grid-cols-2'} gap-6`}
        >
          {scenes.map((scene) => {
            const continuityBadges = [
              continuityFlags.face ? 'Face Locked' : null,
              continuityFlags.product ? 'Product Locked' : null,
              continuityFlags.outfit ? 'Outfit Locked' : null,
              continuityFlags.environment ? 'Environment Locked' : null,
            ].filter(Boolean) as string[];
            const frameReady = hasFrameUrl(scene);
            return (
          <motion.div
            key={scene.id}
            layout
            whileHover={{ y: -2 }}
            ref={(el) => { sceneRefs.current[scene.id] = el; }}
            className={`rounded-2xl overflow-hidden border backdrop-blur-sm transition-shadow ${
              frameReady
                ? 'bg-surface border-border hover:shadow-soft'
                : 'bg-[hsl(var(--color-surface)/0.7)] border-border'
            }`}
          >
            {/* Image Frame */}
            <div className="relative w-full" style={{ aspectRatio: viewMode === 'board' ? '9/16' : '16/9', background: '#0b1020' }}>
              {scene.base_image_url ? (
                <button
                  type="button"
                  onClick={() => {
                    setPreviewImageFailed(false);
                    setPreviewSceneId(scene.id);
                  }}
                  className="block h-full w-full focus:outline-none focus:ring-2 focus:ring-[hsl(var(--color-accent))] focus:ring-offset-2 focus:ring-offset-bg"
                  title={`Preview Scene ${scene.scene_number}`}
                >
                  <img
                    src={scene.base_image_url}
                    alt={`Scene ${scene.scene_number}`}
                    className="w-full h-full object-cover"
                  />
                </button>
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
                  <div className="h-20 w-20 rounded-full border border-slate-600 bg-slate-800/70 animate-pulse mb-3 flex items-center justify-center text-2xl">🎬</div>
                  <p className="text-sm font-medium text-text">Scene {scene.scene_number}</p>
                  <p className="mt-1 text-xs text-muted">Awaiting frame generation</p>
                </div>
              )}
              {/* Scene number badge */}
              <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-xs font-bold px-2.5 py-1 rounded-full border border-white/20">
                Scene {scene.scene_number}
              </div>
              <div className="absolute top-3 right-3 flex flex-col gap-1 items-end">
                <span className="rounded-full border border-border bg-[hsl(var(--color-surface)/0.8)] px-2.5 py-1 text-xs text-text">{scene.shot_type}</span>
                <span className="rounded-full border border-border bg-[hsl(var(--color-surface)/0.8)] px-2.5 py-1 text-xs text-text">{scene.duration_seconds}s</span>
              </div>
              {/* Approval ribbon */}
              {scene.user_approved === true && hasFrameUrl(scene) && (
                <div className="absolute bottom-3 right-3 bg-emerald-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  ✓ Approved
                </div>
              )}
              {scene.user_approved === false && hasFrameUrl(scene) && (
                <div className="absolute bottom-3 right-3 bg-red-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
                  ✗ Rejected
                </div>
              )}
            </div>

            {/* Scene Type + Duration header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                  scene.scene_type === 'hook' ? 'bg-orange-500/20 text-orange-200 border border-orange-400/30' :
                  scene.scene_type === 'cta' ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/30' :
                  scene.scene_type === 'proof' ? 'bg-blue-500/20 text-blue-200 border border-blue-400/30' :
                  'bg-slate-700/70 text-slate-200 border border-slate-500/40'
                }`}>
                  {scene.scene_type}
                </span>
                {scene.mood ? <span className="text-xs px-2 py-0.5 rounded-full border border-slate-500/40 text-slate-200">{scene.mood}</span> : null}
                {scene.environment ? <span className="text-xs px-2 py-0.5 rounded-full border border-slate-500/40 text-slate-200">{scene.environment}</span> : null}
              </div>
              <span className="text-xs font-medium tabular-nums text-muted">{scene.duration_seconds}s</span>
            </div>

            {/* Metadata */}
            <div className="px-5 pb-4 space-y-3">
              {/* Spoken line */}
              <p className="mt-2 border-l-2 border-[hsl(var(--color-accent)/0.6)] pl-3 text-sm italic leading-relaxed text-text">
                &ldquo;{getSceneSpokenLine(scene)}&rdquo;
              </p>

              {/* Edit Prompt inline */}
              {editingPromptFor === scene.id ? (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-400 uppercase">Editing Visual Prompt</p>
                  <textarea
                    value={promptDraft}
                    onChange={(e) => setPromptDraft(e.target.value)}
                    rows={3}
                    className="w-full border border-cyan-600/50 bg-slate-800 text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-cyan-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveEditPrompt(scene.id)}
                      className="flex-1 bg-cyan-500 text-slate-950 text-xs py-1.5 rounded-lg font-semibold hover:bg-cyan-400"
                    >
                      ✓ Save
                    </button>
                    <button
                      onClick={() => { setEditingPromptFor(null); setPromptDraft(''); }}
                      className="flex-1 bg-slate-700 text-slate-200 text-xs py-1.5 rounded-lg font-medium hover:bg-slate-600"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : viewMode === 'review' ? (
                <div className="grid grid-cols-1 gap-1.5">
                  <MetaRow icon="🖼️" label="Visual" value={scene.visual_description} />
                  {scene.mood && <MetaRow icon="🎭" label="Mood" value={scene.mood} />}
                  {scene.environment && <MetaRow icon="🌅" label="Setting" value={scene.environment} />}
                  {scene.avatar_action && <MetaRow icon="🧑" label="Action" value={scene.avatar_action} />}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="line-clamp-2 text-xs text-muted">
                    {scene.visual_description}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-500/40 text-slate-200">{scene.shot_type}</span>
                    {scene.mood ? <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-500/40 text-slate-200">{scene.mood}</span> : null}
                    {scene.environment ? <span className="text-[11px] px-2 py-0.5 rounded-full border border-slate-500/40 text-slate-200">{scene.environment}</span> : null}
                  </div>
                </div>
              )}

              {/* Rejection feedback box */}
              {!clientPreview && showFeedbackFor === scene.id && (
                <div className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-red-600">What would you like changed?</p>
                  <textarea
                    value={rejectionFeedback[scene.id] || ''}
                    onChange={(e) =>
                      setRejectionFeedback((prev) => ({ ...prev, [scene.id]: e.target.value }))
                    }
                    placeholder="Describe what needs to change…"
                    rows={3}
                    className="w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:outline-none focus:border-red-400 resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSubmitRejection(scene.id)}
                      className="flex-1 bg-red-600 text-white text-xs py-1.5 rounded-lg font-medium hover:bg-red-700"
                    >
                      Submit Feedback
                    </button>
                    <button
                      onClick={() => {
                        setShowFeedbackFor(null);
                        setRejectionFeedback((prev) => ({ ...prev, [scene.id]: '' }));
                      }}
                      className="flex-1 bg-gray-100 text-gray-600 text-xs py-1.5 rounded-lg font-medium hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
              {!clientPreview ? (
              <div className="flex gap-2 border-t border-border px-5 pb-5 pt-3">
              <button
                onClick={() => handleApproveScene(scene.id)}
                disabled={loading || !hasFrameUrl(scene)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  hasFrameUrl(scene)
                    ? 'bg-emerald-500/15 border border-emerald-400/40 text-emerald-200 hover:bg-emerald-500/25'
                    : 'cursor-not-allowed border border-border bg-elevated text-muted'
                } disabled:opacity-50`}
              >
                ✓ Approve
              </button>
              <button
                onClick={() => handleRejectScene(scene.id)}
                disabled={loading || !hasFrameUrl(scene)}
                className={`flex-1 rounded-xl py-2 text-xs font-semibold transition-colors ${
                  hasFrameUrl(scene)
                    ? 'bg-rose-500/15 border border-rose-400/40 text-rose-200 hover:bg-rose-500/25'
                    : 'cursor-not-allowed border border-border bg-elevated text-muted'
                } disabled:opacity-50`}
              >
                ✗ Reject
              </button>
              <button
                onClick={() => handleRegenerateScene(scene.id)}
                disabled={loading}
                className="flex-1 rounded-xl border border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.12)] py-2 text-xs font-semibold text-[hsl(var(--color-accent))] transition-colors hover:bg-[hsl(var(--color-accent)/0.2)] disabled:opacity-50"
              >
                🔄 Regen
              </button>
              <button
                onClick={() => startEditPrompt(scene)}
                disabled={loading}
                className="flex-1 rounded-xl border border-[hsl(var(--color-warning)/0.4)] bg-[hsl(var(--color-warning)/0.12)] py-2 text-xs font-semibold text-[hsl(var(--color-warning))] transition-colors hover:bg-[hsl(var(--color-warning)/0.2)] disabled:opacity-50"
              >
                ✏️ Prompt
              </button>
              </div>
              ) : (
                <div className="px-5 pb-5 pt-3 border-t border-slate-700/60">
                <div className="flex flex-wrap gap-2">
                  {continuityBadges.map((badge) => (
                      <span key={`${scene.id}-${badge}`} className="rounded-full border border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.12)] px-2.5 py-1 text-[11px] text-[hsl(var(--color-accent))]">
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
        )})}
      </motion.div>
      </AnimatePresence>

      {/* ── Action Bar ── */}
      {!clientPreview ? (
      <div className="glass-card rounded-2xl border border-border p-6 flex items-center justify-between gap-4 flex-wrap">
        {onBack && canGoBack && (
          <button
            onClick={onBack}
            disabled={loading || isLoading}
            className="rounded-xl border border-border px-5 py-2.5 font-medium text-text transition-colors hover:bg-elevated disabled:opacity-50"
          >
            ← Back to Scene Breakdown
          </button>
        )}
        <div className="flex-1" />
        <p className="hidden text-sm text-muted md:block">
          {allApproved
            ? 'All frames approved — ready to proceed to Motion Planning.'
            : `${approvedCount} of ${totalScenes} frames approved. Missing frames: ${missingCount}.`}
        </p>
        <button
          onClick={handleGenerateImages}
          disabled={loading || isLoading}
          className="rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Working…' : (localError || missingCount > 0 ? '🔄 Try Again' : '🖼️ Generate Frames')}
        </button>
        <button
          onClick={handleApproveAll}
          disabled={loading || missingCount > 0 || isLoading}
          className="flex items-center gap-2 rounded-xl bg-[hsl(var(--color-success))] px-8 py-3 text-base font-semibold text-white transition-colors hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Approving…</>
          ) : (
            '✅ Approve All Frames'
          )}
        </button>
      </div>
      ) : null}

      {/* ── Fullscreen Preview Modal ── */}
      {previewScene ? (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[hsl(var(--color-bg)/0.74)] p-3 backdrop-blur-sm sm:p-6"
          onClick={() => setPreviewSceneId(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`Scene ${previewScene.scene_number} preview`}
        >
          <div
            className="glass-card-strong flex max-h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-border"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Scene {previewScene.scene_number} · {previewScene.scene_type}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-text">
                  {previewScene.user_approved === true && previewSceneImage
                    ? 'Approved'
                    : previewScene.user_approved === false && previewSceneImage
                    ? 'Rejected'
                    : 'Pending review'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewSceneId(null)}
                className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-text transition hover:bg-elevated"
              >
                Close
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] min-h-0 flex-1">
              <div className="flex min-h-[260px] items-center justify-center bg-[hsl(var(--color-bg)/0.9)]">
                {previewSceneImage && !previewImageFailed ? (
                  <img
                    src={previewSceneImage}
                    alt={`Scene ${previewScene.scene_number} full preview`}
                    className="max-h-[70vh] w-full object-contain"
                    onError={() => setPreviewImageFailed(true)}
                  />
                ) : (
                  <div className="px-6 py-10 text-center text-text">
                    <p className="text-base font-semibold">Preview unavailable</p>
                    <p className="mt-1 text-sm text-muted">
                      This frame could not be loaded right now.
                    </p>
                  </div>
                )}
              </div>

              <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Spoken line</p>
                  <p className="text-sm italic text-text">&ldquo;{getSceneSpokenLine(previewScene)}&rdquo;</p>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted">Visual description</p>
                  <p className="text-sm text-text">{previewScene.visual_description}</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-text">
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted">Shot</p>
                    <p className="font-medium text-text">{previewScene.shot_type}</p>
                  </div>
                  <div className="rounded-lg border border-border bg-surface p-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted">Duration</p>
                    <p className="font-medium text-text">{previewScene.duration_seconds}s</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => void handleApproveScene(previewScene.id)}
                    disabled={loading || !previewSceneImage}
                    className="rounded-xl border border-[hsl(var(--color-success)/0.35)] bg-[hsl(var(--color-success)/0.1)] py-2 text-xs font-semibold text-[hsl(var(--color-success))] transition hover:bg-[hsl(var(--color-success)/0.18)] disabled:opacity-50"
                  >
                    ✓ Approve frame
                  </button>
                  <button
                    onClick={() => handleRejectScene(previewScene.id)}
                    disabled={loading || !previewSceneImage}
                    className="rounded-xl border border-[hsl(var(--color-danger)/0.35)] bg-[hsl(var(--color-danger)/0.1)] py-2 text-xs font-semibold text-[hsl(var(--color-danger))] transition hover:bg-[hsl(var(--color-danger)/0.18)] disabled:opacity-50"
                  >
                    ✗ Reject frame
                  </button>
                  <button
                    onClick={() => void handleRegenerateScene(previewScene.id)}
                    disabled={loading}
                    className="rounded-xl border border-[hsl(var(--color-accent)/0.35)] bg-[hsl(var(--color-accent)/0.1)] py-2 text-xs font-semibold text-[hsl(var(--color-accent))] transition hover:bg-[hsl(var(--color-accent)/0.18)] disabled:opacity-50"
                  >
                    🔄 Regenerate
                  </button>
                  {previewSceneImage ? (
                    <a
                      href={previewSceneImage}
                      download={`scene-${previewScene.scene_number}.jpg`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-border bg-surface py-2 text-center text-xs font-semibold text-text transition hover:bg-elevated"
                    >
                      ⬇ Download
                    </a>
                  ) : (
                    <button
                      disabled
                      className="cursor-not-allowed rounded-xl border border-border bg-elevated py-2 text-xs font-semibold text-muted"
                    >
                      ⬇ Download
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

function MetaRow({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-xs mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}: </span>
        <span className="text-xs leading-snug text-text">{value}</span>
      </div>
    </div>
  );
}
