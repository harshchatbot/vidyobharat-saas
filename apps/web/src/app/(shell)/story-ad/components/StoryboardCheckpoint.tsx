'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StoryboardProject, useStoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import { generateMockScenes, simulateDelay } from '../services/mockDataService';
import styles from './StoryboardCheckpoint.module.css';
import { getCurrentUserIdOrThrow } from '@/lib/authUser';

interface SceneCard {
  id: string;
  scene_number: number;
  scene_type?: string;
  dialogue?: string;
  voice_line?: string;
  tts_text?: string;
  script_line?: string;
  narration?: string;
  spoken_line: string;
  visual_description: string;
  shot_type: string;
  avatar_action?: string;
  environment?: string;
  mood?: string;
  duration_seconds: number;
  user_approved?: boolean | null;
  base_image_url?: string | null;
  state?: string;
}

interface StoryboardCheckpointProps {
  project: StoryboardProject;
  onApprove: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
}

interface EditingScene {
  sceneNum: number;
  sceneId: string;
  spoken_line: string;
  visual_description: string;
  shot_type: string;
  mood: string;
  environment: string;
  avatar_action: string;
  duration_seconds: number;
}

export default function StoryboardCheckpoint({
  project,
  onApprove,
  onBack,
  canGoBack = true,
}: StoryboardCheckpointProps) {
  const {
    generateStoryboard,
    retrySceneBreakdown,
    approveStoryboard,
    approveSceneImage,
    rejectSceneImage,
    updateScene,
    getProject,
    loading,
  } = useStoryboardProject();

  const [scenes, setScenes] = useState<SceneCard[]>([]);
  const [showScore, setShowScore] = useState(Boolean(project.storyboard_score));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRehydratingScenes, setIsRehydratingScenes] = useState(false);
  const [editingScene, setEditingScene] = useState<EditingScene | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const generationStartedRef = useRef<string | null>(null);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backNavFetchAttemptedRef = useRef<string | null>(null);

  const isMockMode = isTestModeEnabled();
  const workflowState = String(project.workflow_state || '').toLowerCase();
  const isStoryboardFailed = workflowState === 'storyboard_failed';
  const backendStoryboardError = String((project as any).storyboard_generation_error || '').trim();

  const normalizeScenesFromProject = (value: any): SceneCard[] => {
    const projectObj = value?.project || value;
    const candidates: Array<{ source: string; value: unknown }> = [
      { source: 'project.scenes', value: projectObj?.scenes },
      { source: 'project.storyboard_scenes', value: projectObj?.storyboard_scenes },
      { source: 'project.scene_breakdown', value: projectObj?.scene_breakdown },
      { source: 'project.generated_scenes', value: projectObj?.generated_scenes },
      { source: 'project.storyboard.scenes', value: projectObj?.storyboard?.scenes },
      { source: 'root.scenes', value: value?.scenes },
      { source: 'root.storyboard_scenes', value: value?.storyboard_scenes },
      { source: 'root.scene_breakdown', value: value?.scene_breakdown },
      { source: 'root.generated_scenes', value: value?.generated_scenes },
      { source: 'root.storyboard.scenes', value: value?.storyboard?.scenes },
    ];

    const hit = candidates.find((entry) => Array.isArray(entry.value));
    const rawScenes = (hit?.value as any[]) || [];
    console.log('[StoryboardCheckpoint] extracted scenes field', {
      projectId: project.id,
      source: hit?.source || 'none',
      count: rawScenes.length,
    });

    return rawScenes as SceneCard[];
  };

  const fetchScenesFromStoryboardEndpoint = async (projectId: string): Promise<SceneCard[]> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const response = await fetch(`${apiUrl}/api/storyboard/${projectId}/storyboard`, {
      headers: {
        'X-User-ID': getCurrentUserIdOrThrow('Storyboard scene fetch'),
      },
    });
    if (!response.ok) {
      console.warn('[StoryboardCheckpoint] storyboard endpoint fetch failed', {
        projectId,
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }
    const data = await response.json();
    const endpointScenes = Array.isArray(data?.scenes) ? (data.scenes as SceneCard[]) : [];
    console.log('[StoryboardCheckpoint] normalized scenes count', {
      projectId,
      source: '/storyboard endpoint',
      count: endpointScenes.length,
      payload: data,
    });
    return endpointScenes;
  };

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
    console.log('[StoryboardCheckpoint] polling stopped', { projectId: project.id });
  };

  useEffect(() => {
    let cancelled = false;

    const loadMockScenes = async () => {
      if (!isMockMode) return;
      if (scenes.length > 0) return;

      try {
        setLocalError(null);
        setIsGenerating(true);

        await simulateDelay(1000);

        if (cancelled) return;

        const mockScenes = generateMockScenes(4, {
          business_brief: project.business_brief,
          avatar_name: project.avatar_name,
          ad_style: project.ad_category,
          platform: project.platform,
          tone: project.tone,
          language: project.language,
        }).map((scene) => ({
          ...scene,
          user_approved: scene.user_approved ?? null,
          state: scene.state || 'awaiting_approval',
        }));

        setScenes(mockScenes);
      } catch (error) {
        console.error('[StoryboardCheckpoint] Mock scene generation failed:', error);
        if (!cancelled) {
          setLocalError('Failed to generate mock storyboard scenes.');
        }
      } finally {
        if (!cancelled) {
          setIsGenerating(false);
        }
      }
    };

    void loadMockScenes();

    return () => {
      cancelled = true;
    };
  }, [isMockMode, scenes.length]);

  // Always prefer hydrated project scenes on mount/back-navigation.
  useEffect(() => {
    if (isMockMode || !project?.id) return;
    const fromProject = normalizeScenesFromProject(project);
    if (fromProject.length > 0) {
      setScenes(fromProject);
      setIsGenerating(false);
      setLocalError(null);
    }
  }, [isMockMode, project, project?.id]);

  // Real mode: start storyboard generation exactly once per project.
  useEffect(() => {
    if (isMockMode) return;
    if (!project?.id) return;
    if (scenes.length > 0) return;
    if (normalizeScenesFromProject(project).length > 0) return;

    const state = workflowState;
    const canStart =
      state === 'script_approved' ||
      state === 'storyboard_generating';
    if (!canStart) return;

    if (generationStartedRef.current === project.id) {
      return;
    }

    generationStartedRef.current = project.id;
    setIsGenerating(true);
    setLocalError(null);
    console.log('[StoryboardCheckpoint] storyboard generation started once', {
      projectId: project.id,
      workflowState: state,
    });

    void generateStoryboard(project.id).catch((error) => {
      console.error('[StoryboardCheckpoint] Error generating storyboard:', error);
      setLocalError(error instanceof Error ? error.message : 'Failed to generate storyboard.');
      setIsGenerating(false);
    });
  }, [isMockMode, project?.id, workflowState, scenes.length, generateStoryboard]);

  // Back-navigation fallback: if scenes are empty in scene-plan states, fetch once.
  useEffect(() => {
    if (isMockMode) return;
    if (!project?.id) return;
    if (scenes.length > 0) return;

    const state = workflowState;
    const shouldHydrateFromBackend =
      state === 'storyboard_generating' ||
      state === 'storyboard_approved' ||
      state === 'storyboard_awaiting_approval' ||
      state === 'images_generating' ||
      state === 'images_awaiting_approval' ||
      state === 'images_approved' ||
      state === 'script_approved';
    if (!shouldHydrateFromBackend) return;
    if (backNavFetchAttemptedRef.current === project.id) return;
    backNavFetchAttemptedRef.current = project.id;

    const hydrate = async () => {
      try {
        setIsRehydratingScenes(true);
        const refreshed = await getProject(project.id);
        const fromProject = normalizeScenesFromProject(refreshed);
        let resolved = fromProject;
        if (resolved.length === 0) {
          resolved = await fetchScenesFromStoryboardEndpoint(project.id);
        }
        if (resolved.length > 0) {
          setScenes(resolved);
          setLocalError(null);
        }
      } catch (error) {
        console.error('[StoryboardCheckpoint] back-navigation scene rehydrate failed', error);
      } finally {
        setIsRehydratingScenes(false);
      }
    };

    void hydrate();
  }, [isMockMode, project?.id, workflowState, scenes.length, getProject]);

  // Real mode: poll project every 2s until scenes exist (90s timeout).
  useEffect(() => {
    if (isMockMode) return;
    if (!project?.id) return;
    if (scenes.length > 0) return;

    const state = workflowState;
    const shouldPoll =
      generationStartedRef.current === project.id ||
      state === 'storyboard_generating' ||
      state === 'storyboard_awaiting_approval' ||
      state === 'script_approved';
    if (!shouldPoll) return;
    if (pollingIntervalRef.current) return;

    const poll = async () => {
      try {
        console.log('[StoryboardCheckpoint] polling storyboard project', { projectId: project.id });
        const latestProject = await getProject(project.id);
        console.log('[StoryboardCheckpoint] full project response', {
          projectId: project.id,
          project: latestProject,
        });
        const nextScenes = normalizeScenesFromProject(latestProject);
        let resolvedScenes = nextScenes;
        if (resolvedScenes.length === 0) {
          resolvedScenes = await fetchScenesFromStoryboardEndpoint(project.id);
        }
        console.log('[StoryboardCheckpoint] normalized scenes count', {
          projectId: project.id,
          source: resolvedScenes === nextScenes ? 'project payload' : 'storyboard endpoint fallback',
          count: resolvedScenes.length,
        });
        if (resolvedScenes.length > 0) {
          console.log('[StoryboardCheckpoint] storyboard scenes detected', {
            projectId: project.id,
            count: resolvedScenes.length,
          });
          setScenes(resolvedScenes);
          setIsGenerating(false);
          setLocalError(null);
          stopPolling();
        }
      } catch (error) {
        console.error('[StoryboardCheckpoint] polling failed', error);
      }
    };

    void poll();
    pollingIntervalRef.current = setInterval(() => {
      void poll();
    }, 2000);

    pollingTimeoutRef.current = setTimeout(() => {
      setIsGenerating(false);
      if (!isStoryboardFailed) {
        setLocalError('Scene breakdown is taking longer than expected. Please retry.');
      }
      stopPolling();
    }, 90000);

    return () => {
      stopPolling();
    };
  }, [isMockMode, project?.id, workflowState, scenes.length, getProject, isStoryboardFailed]);

  const displayScenes = scenes;

  const totalDuration = useMemo(() => {
    return displayScenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0);
  }, [displayScenes]);
  const targetDuration = Number(project.target_ad_duration_seconds || project.selected_ad_duration_seconds || 15);
  const durationMismatch = displayScenes.length > 0 && Math.abs(totalDuration - targetDuration) > 1;

  const approvedScenes = useMemo(() => {
    return displayScenes.filter((scene) => scene.user_approved === true).length;
  }, [displayScenes]);

  const isBusy = loading || isGenerating || isRehydratingScenes;
  const score = project.storyboard_score;

  const handleApprove = async () => {
    try {
      setLocalError(null);

      if (isMockMode) {
        onApprove();
        return;
      }

      await approveStoryboard(project.id);
      onApprove();
    } catch (error) {
      console.error('[StoryboardCheckpoint] Failed to approve storyboard:', error);
      setLocalError(error instanceof Error ? error.message : 'Failed to approve storyboard.');
    }
  };

  const handleRetrySceneBreakdown = async () => {
    if (isMockMode || !project?.id) return;
    try {
      setLocalError(null);
      setIsGenerating(true);
      await retrySceneBreakdown(project.id);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to retry scene breakdown.');
      setIsGenerating(false);
    }
  };

  const handleEditScene = (scene: SceneCard) => {
    setEditingScene({
      sceneNum: scene.scene_number,
      sceneId: scene.id,
      spoken_line: getSceneSpokenLine(scene),
      visual_description: scene.visual_description,
      shot_type: scene.shot_type,
      mood: scene.mood || 'Engaging',
      environment: scene.environment || 'Modern setting',
      avatar_action: scene.avatar_action || 'Product demonstration',
      duration_seconds: Number(scene.duration_seconds || 5),
    });
  };

  const handleSaveEdit = async () => {
    if (!editingScene) return;
    console.log('storyboard_scene_edit_save_clicked', { projectId: project.id, sceneId: editingScene.sceneId });
    const spoken = String(editingScene.spoken_line || '').trim();
    const payload = {
      dialogue: spoken,
      voice_line: spoken,
      tts_text: spoken,
      script_line: spoken,
      spoken_line: spoken,
      visual_description: editingScene.visual_description,
      shot_type: editingScene.shot_type,
      mood: editingScene.mood,
      environment: editingScene.environment,
      avatar_action: editingScene.avatar_action,
      duration_seconds: Math.max(1, Number(editingScene.duration_seconds || 1)),
    };
    console.log('storyboard_scene_edit_payload', payload);

    try {
      await updateScene(project.id, editingScene.sceneId, payload);
      console.log('storyboard_scene_edit_saved', { projectId: project.id, sceneId: editingScene.sceneId });
      console.log('storyboard_scene_edit_refresh_scene_text', { projectId: project.id, sceneId: editingScene.sceneId, spoken });
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'Failed to save scene edit.');
      return;
    }

    setScenes((currentScenes) =>
      currentScenes.map((scene) =>
        scene.id === editingScene.sceneId
          ? {
              ...scene,
              spoken_line: spoken,
              dialogue: spoken,
              voice_line: spoken,
              tts_text: spoken,
              script_line: spoken,
              visual_description: editingScene.visual_description,
              shot_type: editingScene.shot_type,
              mood: editingScene.mood,
              environment: editingScene.environment,
              avatar_action: editingScene.avatar_action,
              duration_seconds: Math.max(1, Number(editingScene.duration_seconds || 1)),
            }
          : scene
      )
    );

    setEditingScene(null);
  };

  const handleCancelEdit = () => {
    setEditingScene(null);
  };

  const handleApproveScene = async (scene: SceneCard) => {
    try {
      if (isMockMode) {
        setScenes((currentScenes) =>
          currentScenes.map((item) =>
            item.id === scene.id
              ? {
                  ...item,
                  user_approved: true,
                  state: 'approved',
                }
              : item
          )
        );
        return;
      }

      await approveSceneImage(project.id, scene.id);
      setScenes((currentScenes) =>
        currentScenes.map((item) =>
          item.id === scene.id
            ? {
                ...item,
                user_approved: true,
                state: 'approved',
              }
            : item
        )
      );
    } catch (error) {
      console.error('[StoryboardCheckpoint] Failed to approve scene:', error);
      setLocalError(error instanceof Error ? error.message : 'Failed to approve scene.');
    }
  };

  const handleRejectScene = async (scene: SceneCard) => {
    const feedback = prompt('Provide feedback for rejection:');
    if (!feedback) return;

    try {
      if (isMockMode) {
        setScenes((currentScenes) =>
          currentScenes.map((item) =>
            item.id === scene.id
              ? {
                  ...item,
                  user_approved: false,
                  state: 'rejected',
                }
              : item
          )
        );
        return;
      }

      await rejectSceneImage(project.id, scene.id, feedback);
      setScenes((currentScenes) =>
        currentScenes.map((item) =>
          item.id === scene.id
            ? {
                ...item,
                user_approved: false,
                state: 'rejected',
              }
            : item
        )
      );
    } catch (error) {
      console.error('[StoryboardCheckpoint] Failed to reject scene:', error);
      setLocalError(error instanceof Error ? error.message : 'Failed to reject scene.');
    }
  };

  const handleRegenerateScene = async (scene: SceneCard) => {
    if (isMockMode) {
      const regeneratedScene = generateMockScenes(1, {
        business_brief: project.business_brief,
        avatar_name: project.avatar_name,
        ad_style: project.ad_category,
        platform: project.platform,
        tone: project.tone,
        language: project.language,
      })[0];

      setScenes((currentScenes) =>
        currentScenes.map((item) =>
          item.id === scene.id
            ? {
                ...item,
                spoken_line: regeneratedScene.spoken_line,
                visual_description: regeneratedScene.visual_description,
                shot_type: regeneratedScene.shot_type,
                mood: regeneratedScene.mood || item.mood,
                environment: regeneratedScene.environment || item.environment,
                avatar_action: regeneratedScene.avatar_action || item.avatar_action,
                user_approved: null,
                state: 'awaiting_approval',
              }
            : item
        )
      );

      return;
    }

    console.log('Regenerating scene:', scene.scene_number);
    alert('Scene regeneration feature coming soon');
  };

  const handleRegenerateAll = async () => {
    if (isMockMode) {
      setIsGenerating(true);

      await simulateDelay(1000);

      const mockScenes = generateMockScenes(4, {
        business_brief: project.business_brief,
        avatar_name: project.avatar_name,
        ad_style: project.ad_category,
        platform: project.platform,
        tone: project.tone,
        language: project.language,
      }).map((scene) => ({
        ...scene,
        user_approved: null,
        state: 'awaiting_approval',
      }));

      setScenes(mockScenes);
      setIsGenerating(false);
      return;
    }

    alert('Regenerate all storyboard feature coming soon');
  };

  const getScoreColor = (value: number) => {
    if (value >= 8) return '#28a745';
    if (value >= 6) return '#ffc107';
    return '#dc3545';
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>🎞️ Scene Breakdown</h2>
        <p className={styles.headerSubtitle}>
          Scene-by-scene text plan: spoken line, visual description, shot type, mood, environment, avatar action, and duration.
          No images yet — that is the next stage (Visual Storyboard).
        </p>
      </div>

      {localError || (isStoryboardFailed && backendStoryboardError) ? (
        <div
          style={{
            marginBottom: '1rem',
            padding: '0.875rem 1rem',
            borderRadius: '0.75rem',
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#b91c1c',
            fontSize: '0.875rem',
          }}
        >
          {localError || backendStoryboardError}
        </div>
      ) : null}

      <div className={styles.card}>
        <div className={styles.overviewSection}>
          <h3 className={styles.overviewTitle}>Scene Breakdown Overview</h3>

          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Total Scenes</p>
              <p className={styles.statValue}>
                {isBusy && displayScenes.length === 0 ? 'Generating…' : displayScenes.length}
              </p>
            </div>

            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Total Duration</p>
              <p className={styles.statValue}>
                {isBusy && totalDuration === 0 ? 'Calculating...' : totalDuration}s
              </p>
            </div>

            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Target Duration</p>
              <p className={styles.statValue}>{targetDuration}s</p>
            </div>

            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Approved Scenes</p>
              <p className={styles.statValue}>
                {approvedScenes}/{displayScenes.length || '?'}
              </p>
            </div>

            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Status</p>
              <p className={styles.statValue} style={{ fontSize: '1.125rem' }}>
                {isBusy
                  ? 'Generating...'
                  : durationMismatch
                    ? 'Duration mismatch'
                  : displayScenes.length > 0
                    ? (workflowState === 'storyboard_approved' ? 'Approved' : 'Fits duration')
                    : (workflowState === 'storyboard_generating' || workflowState === 'script_approved' || workflowState === 'storyboard_awaiting_approval')
                      ? 'Generating...'
                      : (isStoryboardFailed ? 'Failed' : 'Waiting...')}
              </p>
            </div>
          </div>
          {displayScenes.length > 0 && durationMismatch ? (
            <div
              style={{
                marginTop: '0.75rem',
                padding: '0.875rem 1rem',
                borderRadius: '0.75rem',
                border: '1px solid #fecaca',
                background: '#fef2f2',
                color: '#b91c1c',
                fontSize: '0.875rem',
              }}
            >
              Scene durations total {totalDuration}s but your target ad duration is {targetDuration}s. Please regenerate or edit scene durations.
            </div>
          ) : null}
        </div>

        {isBusy && displayScenes.length === 0 ? (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Generating scene breakdown…</p>
            <p className={styles.loadingSubtext}>
              {isMockMode ? 'Creating mock scene plan for testing' : 'This usually takes a few seconds'}
            </p>
          </div>
        ) : null}

        {!isBusy && displayScenes.length === 0 ? (
          <div className={styles.loadingContainer}>
            {isStoryboardFailed ? (
              <>
                <p className={styles.loadingText}>Scene breakdown generation failed</p>
                <p className={styles.loadingSubtext}>
                  {backendStoryboardError || 'Please retry scene breakdown generation.'}
                </p>
              </>
            ) : workflowState === 'storyboard_approved' ? (
              <>
                <p className={styles.loadingText}>Scenes are not loaded. Refreshing...</p>
                <p className={styles.loadingSubtext}>Fetching approved scene breakdown from backend.</p>
              </>
            ) : workflowState === 'storyboard_generating' || workflowState === 'storyboard_awaiting_approval' || workflowState === 'script_approved' ? (
              <>
                <p className={styles.loadingText}>Generating scene breakdown...</p>
                <p className={styles.loadingSubtext}>Polling backend for scene cards and duration plan.</p>
              </>
            ) : (
              <>
                <p className={styles.loadingText}>No scenes generated yet</p>
                <p className={styles.loadingSubtext}>Scenes will appear here once storyboard is generated</p>
              </>
            )}
          </div>
        ) : null}

        {displayScenes.length > 0 ? (
          <div className={styles.scenesSection}>
            <h4 className={styles.scenesTitle}>Scenes — Text Plan ({displayScenes.length} scenes)</h4>

            <div className={styles.scenesList}>
              {displayScenes.map((scene) => (
                <div key={scene.id}>
                  {editingScene?.sceneId === scene.id ? (
                    <div className={styles.editCard}>
                      <h5 className={styles.editTitle}>Edit Scene {scene.scene_number}</h5>

                      <div className={styles.editForm}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Spoken Line / VO Text</label>
                          <textarea
                            value={editingScene.spoken_line}
                            onChange={(event) =>
                              setEditingScene({
                                ...editingScene,
                                spoken_line: event.target.value,
                              })
                            }
                            className={styles.formTextarea}
                            placeholder="What the narrator/avatar says..."
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Visual Description</label>
                          <textarea
                            value={editingScene.visual_description}
                            onChange={(event) =>
                              setEditingScene({
                                ...editingScene,
                                visual_description: event.target.value,
                              })
                            }
                            className={styles.formTextarea}
                            placeholder="What the camera sees, scene composition, lighting, etc..."
                          />
                        </div>

                        <div className={styles.formGrid}>
                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Shot Type</label>
                            <input
                              type="text"
                              value={editingScene.shot_type}
                              onChange={(event) =>
                                setEditingScene({
                                  ...editingScene,
                                  shot_type: event.target.value,
                                })
                              }
                              className={styles.formInput}
                              placeholder="e.g., close-up, medium, wide"
                            />
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Mood</label>
                            <input
                              type="text"
                              value={editingScene.mood}
                              onChange={(event) =>
                                setEditingScene({
                                  ...editingScene,
                                  mood: event.target.value,
                                })
                              }
                              className={styles.formInput}
                              placeholder="e.g., engaged, concerned, excited"
                            />
                          </div>
                        </div>

                        <div className={styles.formGrid}>
                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Environment</label>
                            <input
                              type="text"
                              value={editingScene.environment}
                              onChange={(event) =>
                                setEditingScene({
                                  ...editingScene,
                                  environment: event.target.value,
                                })
                              }
                              className={styles.formInput}
                              placeholder="e.g., bathroom, living room"
                            />
                          </div>

                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Avatar Action</label>
                            <input
                              type="text"
                              value={editingScene.avatar_action}
                              onChange={(event) =>
                                setEditingScene({
                                  ...editingScene,
                                  avatar_action: event.target.value,
                                })
                              }
                              className={styles.formInput}
                              placeholder="e.g., applying product, looking concerned"
                            />
                          </div>
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Duration (seconds)</label>
                          <input
                            type="number"
                            min={1}
                            max={30}
                            value={editingScene.duration_seconds}
                            onChange={(event) =>
                              setEditingScene({
                                ...editingScene,
                                duration_seconds: Number(event.target.value || 1),
                              })
                            }
                            className={styles.formInput}
                          />
                        </div>
                      </div>

                      <div className={styles.editButtons}>
                        <button onClick={handleSaveEdit} className={styles.buttonSave}>
                          ✓ Save Changes
                        </button>
                        <button onClick={handleCancelEdit} className={styles.buttonCancel}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className={`${styles.sceneCard} ${isBusy ? styles.sceneCardLoading : ''}`}>
                      <div className={styles.sceneHeader}>
                        <div style={{ flex: 1 }}>
                          <h5 className={styles.sceneTitle}>Scene {scene.scene_number}</h5>
                          <p className={styles.sceneDescription}>{getSceneSpokenLine(scene)}</p>
                        </div>

                        <span className={styles.sceneDuration}>{scene.duration_seconds}s</span>
                      </div>

                      <div className={styles.sceneDetails}>
                        <div className={styles.detailGroup}>
                          <p className={styles.detailLabel}>Visual</p>
                          <p className={styles.detailValue}>{scene.visual_description}</p>
                        </div>

                        <div className={styles.detailGroup}>
                          <p className={styles.detailLabel}>Shot Type</p>
                          <p className={styles.detailValue}>{scene.shot_type}</p>
                        </div>

                        <div className={styles.detailGroup}>
                          <p className={styles.detailLabel}>Mood</p>
                          <p className={styles.detailValue}>{scene.mood || 'N/A'}</p>
                        </div>

                        <div className={styles.detailGroup}>
                          <p className={styles.detailLabel}>Setting</p>
                          <p className={styles.detailValue}>{scene.environment || 'N/A'}</p>
                        </div>

                        {scene.avatar_action ? (
                          <div className={styles.detailGroup}>
                            <p className={styles.detailLabel}>Action</p>
                            <p className={styles.detailValue}>{scene.avatar_action}</p>
                          </div>
                        ) : null}

                        {scene.user_approved === true ? (
                          <div className={styles.detailGroup}>
                            <p className={styles.detailLabel}>Approval</p>
                            <p className={styles.detailValue}>✅ Approved</p>
                          </div>
                        ) : null}

                        {scene.user_approved === false ? (
                          <div className={styles.detailGroup}>
                            <p className={styles.detailLabel}>Approval</p>
                            <p className={styles.detailValue}>❌ Rejected</p>
                          </div>
                        ) : null}
                      </div>

                      <div className={styles.sceneButtons}>
                        <button
                          onClick={() => handleEditScene(scene)}
                          disabled={isBusy}
                          className={`${styles.button} ${styles.buttonEdit} ${isBusy ? styles.buttonDisabled : ''}`}
                        >
                          ✎ Edit
                        </button>

                        <button
                          onClick={() => handleApproveScene(scene)}
                          disabled={isBusy}
                          className={`${styles.button} ${styles.buttonApprove} ${isBusy ? styles.buttonDisabled : ''}`}
                        >
                          ✓ Approve
                        </button>

                        <button
                          onClick={() => handleRejectScene(scene)}
                          disabled={isBusy}
                          className={`${styles.button} ${styles.buttonReject} ${isBusy ? styles.buttonDisabled : ''}`}
                        >
                          ✗ Reject
                        </button>

                        <button
                          onClick={() => handleRegenerateScene(scene)}
                          disabled={isBusy}
                          className={`${styles.button} ${styles.buttonRegenerate} ${isBusy ? styles.buttonDisabled : ''}`}
                        >
                          🔄 Regen
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {showScore && score ? (
          <div className={styles.scoreSection}>
            <div className={styles.scoreHeader}>
              <h4 className={styles.scoreTitle}>Quality Score</h4>
              <button onClick={() => setShowScore(false)} className={styles.scoreHideButton}>
                Hide
              </button>
            </div>

            <div className={styles.scoreGrid}>
              <div className={`${styles.scoreItem} ${styles.scoreItemAccent}`}>
                <p className={styles.scoreLabel}>Visual Clarity</p>
                <p className={styles.scoreValue} style={{ color: getScoreColor(score.visual_clarity) }}>
                  {score.visual_clarity}/10
                </p>
              </div>

              <div className={`${styles.scoreItem} ${styles.scoreItemAccent}`}>
                <p className={styles.scoreLabel}>Scene Purpose</p>
                <p className={styles.scoreValue} style={{ color: getScoreColor(score.scene_purpose) }}>
                  {score.scene_purpose}/10
                </p>
              </div>

              <div className={`${styles.scoreItem} ${styles.scoreItemAccent}`}>
                <p className={styles.scoreLabel}>Flow</p>
                <p className={styles.scoreValue} style={{ color: getScoreColor(score.flow) }}>
                  {score.flow}/10
                </p>
              </div>

              <div className={`${styles.scoreItem} ${styles.scoreItemAccent}`}>
                <p className={styles.scoreLabel}>Overall</p>
                <p className={styles.scoreValue} style={{ color: getScoreColor(score.overall) }}>
                  {score.overall}/10
                </p>
              </div>
            </div>

            {score.improvement_suggestions && score.improvement_suggestions.length > 0 ? (
              <div className={styles.suggestionsContainer}>
                <p className={styles.suggestionsTitle}>Suggestions for improvement:</p>
                <ul className={styles.suggestionsList}>
                  {score.improvement_suggestions.map((suggestion, idx) => (
                    <li key={`${suggestion}-${idx}`}>• {suggestion}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {!showScore && score ? (
          <div
            style={{
              textAlign: 'center',
              marginBottom: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid hsl(var(--color-border-soft))',
            }}
          >
            <button
              onClick={() => setShowScore(true)}
              style={{
                fontSize: '0.875rem',
                color: 'hsl(var(--color-accent))',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Show Quality Score
            </button>
          </div>
        ) : null}

        <div className={`${styles.actionSection} flex-col sm:flex-row`}>
          {onBack && canGoBack ? (
            <button
              onClick={onBack}
              disabled={isBusy}
              className={`${styles.actionButton} ${styles.buttonSecondary} w-full sm:w-auto ${isBusy ? styles.buttonDisabledState : ''}`}
            >
              ← Back to Character Lock
            </button>
          ) : null}

          <button
            onClick={handleApprove}
            disabled={isBusy || displayScenes.length === 0 || durationMismatch}
            className={`${styles.actionButton} ${styles.buttonPrimary} w-full sm:w-auto ${
              isBusy || displayScenes.length === 0 || durationMismatch ? styles.buttonDisabledState : ''
            }`}
          >
            {isBusy ? 'Processing…' : durationMismatch ? 'Fix Duration Before Approving' : '🎞️ Approve Scene Breakdown'}
          </button>

          <button
            onClick={handleRegenerateAll}
            disabled={isBusy}
            className={`${styles.actionButton} ${styles.buttonSecondary} w-full sm:w-auto ${isBusy ? styles.buttonDisabledState : ''}`}
          >
            {isBusy ? 'Processing…' : '🔄 Regenerate All'}
          </button>
          {(isStoryboardFailed || backendStoryboardError) ? (
            <button
              onClick={handleRetrySceneBreakdown}
              disabled={isBusy}
              className={`${styles.actionButton} ${styles.buttonSecondary} w-full sm:w-auto ${isBusy ? styles.buttonDisabledState : ''}`}
            >
              {isBusy ? 'Retrying…' : '↻ Retry Scene Breakdown'}
            </button>
          ) : null}
        </div>
      </div>

      <div className={styles.infoContainer}>
        <p className={styles.infoText}>
          <strong>💡 Next:</strong>{' '}
          {isBusy
            ? 'Generating scene breakdown. Scene details will appear once ready.'
            : displayScenes.length > 0
              ? 'Edit scene details, approve / reject individual scenes, then proceed to Visual Storyboard where generated images are shown.'
              : 'Generating scenes from your approved script and character lock…'}
        </p>
      </div>
    </div>
  );
}
  const getSceneSpokenLine = (scene: SceneCard): string => {
    return (
      String(scene.tts_text || '').trim() ||
      String(scene.voice_line || '').trim() ||
      String(scene.dialogue || '').trim() ||
      String(scene.script_line || '').trim() ||
      String(scene.narration || '').trim() ||
      String(scene.spoken_line || '').trim()
    );
  };
