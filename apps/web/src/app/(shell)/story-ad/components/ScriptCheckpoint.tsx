'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StoryboardProject, useStoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import BeautifulLoadingScreen from './BeautifulLoadingScreen';
import { generateMockScript, simulateDelay } from '../services/mockDataService';

interface ScriptCheckpointProps {
  project: StoryboardProject;
  onApprove: () => void;
  onBack?: () => void;
  canGoBack?: boolean;
  isLoading?: boolean;
}

function extractScriptFromAny(value: any): string {
  if (!value || typeof value !== 'object') {
    return '';
  }
  const candidates = [
    value.display_script,
    value.script,
    value.script_text,
    value.generated_script,
    value.narration_script,
    value?.project?.display_script,
    value?.project?.script,
    value?.project?.script_text,
    value?.project?.generated_script,
    value?.project?.narration_script,
    value?.ready_project?.display_script,
    value?.ready_project?.script,
    value?.ready_project?.script_text,
    value?.ready_project?.generated_script,
    value?.ready_project?.narration_script,
    value?.result?.display_script,
    value?.result?.script,
    value?.result?.script_text,
    value?.result?.generated_script,
    value?.result?.narration_script,
  ];
  for (const item of candidates) {
    const text = String(item || '').trim();
    if (text) {
      return text;
    }
  }
  return '';
}

function normalizeWorkflowState(state?: string | null): string {
  return String(state || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');
}

function hasScript(project?: StoryboardProject | null): boolean {
  return Boolean(extractScriptFromAny(project));
}

function getTargetWordRange(durationSeconds: number): { min: number; max: number } {
  if (durationSeconds <= 10) return { min: 20, max: 28 };
  if (durationSeconds <= 15) return { min: 35, max: 45 };
  if (durationSeconds <= 20) return { min: 45, max: 60 };
  return { min: 70, max: 85 };
}

function estimateDurationFromWordCount(words: number): number {
  return Math.max(1, Math.round((words / 140) * 60));
}

export default function ScriptCheckpoint({
  project,
  onApprove,
  onBack,
  canGoBack = true,
  isLoading = false,
}: ScriptCheckpointProps) {
  const {
    generateScript,
    approveScript,
    regenerateScript,
    updateScript,
    getProject,
    loading,
  } = useStoryboardProject();

  const [localProject, setLocalProject] = useState<StoryboardProject>(project);
  const [editMode, setEditMode] = useState(false);
  const [editedScript, setEditedScript] = useState(project.display_script || '');
  const [showScore, setShowScore] = useState(Boolean(project.script_score));
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  const generationStartedRef = useRef(false);

  const workflowState = normalizeWorkflowState(localProject.workflow_state);
  const isScriptApproved = workflowState === 'script_approved';
  const displayScript = localProject.display_script || '';
  const scriptScore = localProject.script_score;
  const targetDurationSeconds = Number((localProject as any).target_ad_duration_seconds || (localProject as any).selected_ad_duration_seconds || 15);

  const isBusy = loading || isLoading || (showLoadingScreen && !displayScript);

  useEffect(() => {
    console.log('[ScriptCheckpoint] render_state', {
      projectId: project.id,
      workflowState,
      showLoadingScreen,
      displayScriptLen: displayScript.trim().length,
      generationStarted: generationStartedRef.current,
      loading,
      isLoading,
    });
  }, [project.id, workflowState, showLoadingScreen, displayScript, loading, isLoading]);

  const wordCount = useMemo(() => {
    return displayScript.trim() ? displayScript.trim().split(/\s+/).length : 0;
  }, [displayScript]);

  const estimatedDuration = useMemo(() => {
    return estimateDurationFromWordCount(wordCount);
  }, [wordCount]);

  const editedWordCount = useMemo(() => {
    const value = editedScript.trim();
    return value ? value.split(/\s+/).length : 0;
  }, [editedScript]);

  const effectiveWordCount = editMode ? editedWordCount : wordCount;
  const effectiveEstimatedDuration = estimateDurationFromWordCount(effectiveWordCount);
  const targetRange = getTargetWordRange(targetDurationSeconds);
  const withinTolerance = effectiveEstimatedDuration >= Math.floor(targetDurationSeconds * 0.8)
    && effectiveEstimatedDuration <= Math.ceil(targetDurationSeconds * 1.2);
  const durationStatus = (localProject as any).script_duration_status
    || (effectiveWordCount < targetRange.min ? 'too_short' : effectiveWordCount > targetRange.max ? 'too_long' : 'fits');
  const durationFits = durationStatus === 'fits' && withinTolerance;

  useEffect(() => {
    /**
     * MOCK MODE FIX:
     * In mock mode, backend project usually remains:
     * workflow_state = initialized
     * display_script = null
     *
     * So do not overwrite local mock script with backend null values.
     */
    if (isTestModeEnabled()) {
      setLocalProject((current) => {
        if (current.display_script) {
          return current;
        }

        return project;
      });

      const incomingScript = extractScriptFromAny(project);
      if (incomingScript) {
        setLocalProject((current) => ({
          ...current,
          ...project,
          display_script: incomingScript,
        }));
        setEditedScript(incomingScript);
        generationStartedRef.current = true;
        setShowLoadingScreen(false);
      }

      if (project.script_score) {
        setShowScore(true);
      }

      return;
    }

    setLocalProject(project);

    const incomingScript = extractScriptFromAny(project);
    if (incomingScript) {
      setLocalProject((current) => ({
        ...current,
        ...project,
        display_script: incomingScript,
      }));
      setEditedScript(incomingScript);
      generationStartedRef.current = true;
      setShowLoadingScreen(false);
    }

    if (project.script_score) {
      setShowScore(true);
    }
  }, [project]);

  useEffect(() => {
    if (displayScript || editMode) {
      return;
    }
  
    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;
  
    const cleanupTimers = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
  
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };
  
    const stopLoading = () => {
      if (!cancelled) {
        setShowLoadingScreen(false);
      }
    };
  
    const runGeneration = async () => {
      setLocalError(null);
  
      if (isTestModeEnabled()) {
        try {
          setShowLoadingScreen(true);
  
          console.log('[ScriptCheckpoint] Mock generation started:', {
            projectId: project.id,
            adCategory: project.ad_category,
          });
  
          await simulateDelay(1000);
  
          if (cancelled) {
            return;
          }
  
          const mockScript = generateMockScript(project.ad_category || 'ugc_testimonial');
  
          const mockProject = {
            ...project,
            display_script: mockScript,
            workflow_state: 'script_awaiting_approval',
          } as StoryboardProject;
  
          setLocalProject(mockProject);
          setEditedScript(mockScript);
          setShowScore(false);
          setLocalError(null);
          generationStartedRef.current = true;
  
          console.log('[ScriptCheckpoint] Mock script generated:', {
            projectId: project.id,
            scriptLength: mockScript.length,
          });
        } catch (error) {
          console.error('[ScriptCheckpoint] Mock script generation failed:', error);
  
          if (!cancelled) {
            setLocalError('Mock script generation failed. Please try again.');
          }
        } finally {
          stopLoading();
        }
  
        return;
      }
  
      if (generationStartedRef.current) {
        return;
      }
  
      try {
        generationStartedRef.current = true;
        setShowLoadingScreen(true);
  
        console.log('[ScriptCheckpoint] Starting real script generation:', {
          projectId: project.id,
          workflowState: project.workflow_state,
        });
  
        const generationResult = await generateScript(project.id);

        if (cancelled) {
          return;
        }

        const immediateScript = extractScriptFromAny(generationResult);
        const immediateProject =
          (generationResult as any)?.ready_project ||
          (generationResult as any)?.project ||
          (generationResult as any)?.result ||
          null;

        if (immediateScript) {
          setLocalProject((current) => ({
            ...current,
            ...(immediateProject && typeof immediateProject === 'object' ? immediateProject : {}),
            display_script: immediateScript,
            workflow_state:
              normalizeWorkflowState(
                (immediateProject as any)?.workflow_state ||
                current.workflow_state ||
                'script_awaiting_approval'
              ) || 'script_awaiting_approval',
          }));
          setEditedScript(immediateScript);
          setShowScore(Boolean((immediateProject as any)?.script_score));
          setLocalError(null);
          setShowLoadingScreen(false);
          return;
        }

        pollInterval = setInterval(async () => {
          try {
            const updatedProject = await getProject(project.id);
  
            if (cancelled || !updatedProject) {
              return;
            }
  
            const updatedWorkflowState = normalizeWorkflowState(updatedProject.workflow_state);
            const updatedHasScript = hasScript(updatedProject);
  
            console.log('[ScriptCheckpoint] Poll result:', {
              workflowState: updatedWorkflowState,
              hasScript: updatedHasScript,
            });
  
            if (updatedHasScript) {
              const normalizedScript = extractScriptFromAny(updatedProject);
              setLocalProject({
                ...updatedProject,
                display_script: normalizedScript,
              });
              setEditedScript(normalizedScript);
              setShowScore(Boolean(updatedProject.script_score));
              setLocalError(null);
              stopLoading();
              cleanupTimers();
              return;
            }
  
            if (updatedWorkflowState === 'script_failed') {
              setLocalError('Script generation failed. Please try regenerating.');
              stopLoading();
              cleanupTimers();
            }
          } catch (error) {
            console.error('[ScriptCheckpoint] Poll failed:', error);
          }
        }, 2000);
  
        timeout = setTimeout(() => {
          console.warn('[ScriptCheckpoint] Poll timeout reached.');
          stopLoading();
          cleanupTimers();
  
          setLocalError(
            'Script generation is taking longer than expected. Please refresh project status or try again.'
          );
        }, 45000);
      } catch (error) {
        console.error('[ScriptCheckpoint] Failed to generate script:', error);
  
        if (!cancelled) {
          setLocalError(error instanceof Error ? error.message : 'Failed to generate script.');
        }
  
        stopLoading();
        cleanupTimers();
      }
    };
  
    void runGeneration();
  
    return () => {
      cancelled = true;
      cleanupTimers();

      // React Strict Mode mounts effects twice in dev; if we cancel before script
      // exists, unlock generation so the next pass can actually run.
      if (!displayScript) {
        generationStartedRef.current = false;
      }
    };
  }, [
    displayScript,
    editMode,
    generateScript,
    getProject,
    project.id,
  ]);

  const handleApprove = async () => {
    try {
      setLocalError(null);

      if (!displayScript.trim()) {
        setLocalError('Script is not ready yet.');
        return;
      }
      const projectAny = localProject as any;
      const isAvatarPath = String(projectAny?.production_path || '').toLowerCase() === 'ai_avatar'
        || String(projectAny?.creation_mode || '').toLowerCase() === 'avatar'
        || Boolean(projectAny?.avatar_id);
      const avatarRefs = Array.isArray(projectAny?.avatar_reference_images) ? projectAny.avatar_reference_images : [];
      if (isAvatarPath && avatarRefs.length === 0) {
        setLocalError('Avatar reference images missing for Chitrakala.');
        return;
      }

      /**
       * MOCK MODE:
       * Do not call backend approveScript.
       * Mock mode is frontend-only.
       */
      if (isTestModeEnabled()) {
        onApprove();
        return;
      }

      /**
       * REAL MODE:
       * Only approve script.
       * Do not auto-generate storyboard here.
       */
      await approveScript(project.id, true);
      onApprove();
    } catch (error) {
      console.error('[ScriptCheckpoint] Failed to approve script:', error);
      setLocalError(error instanceof Error ? error.message : 'Failed to approve script.');
    }
  };

  const handleRegenerate = async () => {
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const cleanupTimers = () => {
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }

      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    try {
      setLocalError(null);
      setEditMode(false);
      setEditedScript('');
      setShowLoadingScreen(true);

      if (isTestModeEnabled()) {
        try {
          await simulateDelay(1000);

          const mockScript = generateMockScript(project.ad_category || 'ugc_testimonial');

          setLocalProject((current) => ({
            ...current,
            display_script: mockScript,
            workflow_state: 'script_awaiting_approval',
          }));

          setEditedScript(mockScript);
          setShowScore(false);
          setLocalError(null);
        } finally {
          setShowLoadingScreen(false);
        }

        return;
      }

      await regenerateScript(project.id, targetDurationSeconds);

      pollInterval = setInterval(async () => {
        try {
          const updatedProject = await getProject(project.id);

          if (updatedProject?.display_script) {
            setLocalProject(updatedProject);
            setEditedScript(updatedProject.display_script || '');
            setShowScore(Boolean(updatedProject.script_score));
            setShowLoadingScreen(false);
            cleanupTimers();
          }
        } catch (error) {
          console.error('[ScriptCheckpoint] Regenerate poll failed:', error);
        }
      }, 2000);

      timeout = setTimeout(() => {
        setShowLoadingScreen(false);
        cleanupTimers();
      }, 45000);
    } catch (error) {
      console.error('[ScriptCheckpoint] Failed to regenerate script:', error);
      setShowLoadingScreen(false);
      cleanupTimers();
      setLocalError(error instanceof Error ? error.message : 'Failed to regenerate script.');
    }
  };

  const handleSaveEdit = async () => {
    const cleanEditedScript = editedScript.trim();

    if (!cleanEditedScript) {
      setLocalError('Script cannot be empty.');
      return;
    }

    try {
      setSaveState('saving');
      setLocalError(null);
      const updated = await updateScript(project.id, cleanEditedScript);
      if (updated && typeof updated === 'object') {
        const refreshed = await getProject(project.id);
        if (refreshed) {
          setLocalProject(refreshed);
          setEditedScript(String(refreshed.display_script || cleanEditedScript));
        } else {
          setLocalProject((current) => ({
            ...current,
            display_script: String((updated as any).display_script || cleanEditedScript),
            script_word_count: (updated as any).script_word_count,
            script_estimated_duration_seconds: (updated as any).script_estimated_duration_seconds,
            script_duration_status: (updated as any).script_duration_status,
          } as StoryboardProject));
          setEditedScript(String((updated as any).display_script || cleanEditedScript));
        }
      }
      setEditMode(false);
      setSaveState('saved');
    } catch (error) {
      setSaveState('failed');
      setLocalError(error instanceof Error ? error.message : 'Failed to save script.');
    }
  };

  const handleCancelEdit = () => {
    setEditMode(false);
    setEditedScript(displayScript || '');
  };

  const scoreColor = (value: number) => {
    if (value >= 8) return 'text-green-600';
    if (value >= 6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const scoreBackground = (value: number) => {
    if (value >= 8) return 'bg-green-50 border-green-200';
    if (value >= 6) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const isMockMode = isTestModeEnabled();
  if (showLoadingScreen && !displayScript) {
    return (
      <BeautifulLoadingScreen
        stage="script"
        isMockMode={isMockMode}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Script Checkpoint</h2>
            <p className="text-gray-600">Review and approve your ad script</p>
          </div>

          {canGoBack && onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={isBusy}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Back
            </button>
          ) : null}
        </div>

        <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          {isTestModeEnabled() ? 'Mock state' : 'Backend state'}:{' '}
          <span className="font-semibold">{workflowState || 'unknown'}</span>
        </div>
      </div>

      {localError ? (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {localError}
        </div>
      ) : null}

      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Your Ad Script</h3>

            {!editMode && displayScript ? (
              <button
                type="button"
                onClick={() => setEditMode(true)}
                disabled={isBusy}
                className="text-sm text-indigo-600 hover:text-indigo-700 font-medium disabled:cursor-not-allowed disabled:opacity-50"
              >
                Edit
              </button>
            ) : null}
          </div>

          {editMode ? (
            <div className="space-y-3">
              <textarea
                value={editedScript}
                onChange={(e) => setEditedScript(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows={8}
              />

              <div className="rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
                Saving updates canonical script and duration metadata on backend.
              </div>
              {saveState === 'saving' ? (
                <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">Saving script...</div>
              ) : null}
              {saveState === 'saved' ? (
                <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">Script saved.</div>
              ) : null}
              {saveState === 'failed' ? (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Script save failed.</div>
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isBusy}
                  className="flex-1 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save Changes
                </button>

                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={isBusy}
                  className="flex-1 bg-gray-200 text-gray-800 px-4 py-2 rounded-lg hover:bg-gray-300 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div
              className="bg-gray-50 rounded-lg p-6 border border-gray-200 text-gray-900 leading-relaxed whitespace-pre-wrap"
              aria-live="polite"
            >
              {displayScript || 'Generating script...'}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pt-6 border-t border-gray-200">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Target Duration</p>
            <p className="text-2xl font-bold text-gray-900">{targetDurationSeconds}s</p>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Word Count</p>
            <p className="text-2xl font-bold text-gray-900">{effectiveWordCount}</p>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Estimated Duration</p>
            <p className="text-2xl font-bold text-gray-900">{effectiveEstimatedDuration}s</p>
          </div>

          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Status</p>
            <p className={`text-2xl font-bold ${durationFits ? 'text-green-600' : 'text-amber-600'}`}>
              {durationFits ? 'Fits' : durationStatus === 'too_long' ? 'Too long' : durationStatus === 'too_short' ? 'Too short' : 'Check'}
            </p>
          </div>
        </div>
        {!durationFits && displayScript ? (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This script is estimated at {effectiveEstimatedDuration}s but your target is {targetDurationSeconds}s.
          </div>
        ) : null}

        {showScore && scriptScore ? (
          <div className="mb-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Quality Score</h4>
              <button
                type="button"
                onClick={() => setShowScore(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Hide
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className={`rounded-lg border p-4 ${scoreBackground(scriptScore.hook_strength)}`}>
                <p className="text-sm text-gray-700 mb-2">Hook Strength</p>
                <p className={`text-2xl font-bold ${scoreColor(scriptScore.hook_strength)}`}>
                  {scriptScore.hook_strength}/10
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(scriptScore.clarity)}`}>
                <p className="text-sm text-gray-700 mb-2">Clarity</p>
                <p className={`text-2xl font-bold ${scoreColor(scriptScore.clarity)}`}>
                  {scriptScore.clarity}/10
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(scriptScore.emotional_pull)}`}>
                <p className="text-sm text-gray-700 mb-2">Emotional Pull</p>
                <p className={`text-2xl font-bold ${scoreColor(scriptScore.emotional_pull)}`}>
                  {scriptScore.emotional_pull}/10
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(scriptScore.category_fit)}`}>
                <p className="text-sm text-gray-700 mb-2">Category Fit</p>
                <p className={`text-2xl font-bold ${scoreColor(scriptScore.category_fit)}`}>
                  {scriptScore.category_fit}/10
                </p>
              </div>

              <div
                className={`rounded-lg border p-4 ${
                  scriptScore.word_count_ok
                    ? 'border-green-200 bg-green-50'
                    : 'border-yellow-200 bg-yellow-50'
                }`}
              >
                <p className="text-sm text-gray-700 mb-2">Word Count</p>
                <p
                  className={`text-2xl font-bold ${
                    scriptScore.word_count_ok ? 'text-green-600' : 'text-yellow-600'
                  }`}
                >
                  {scriptScore.word_count_ok ? 'OK' : 'Check'}
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(scriptScore.overall)}`}>
                <p className="text-sm text-gray-700 mb-2">Overall</p>
                <p className={`text-2xl font-bold ${scoreColor(scriptScore.overall)}`}>
                  {scriptScore.overall}/10
                </p>
              </div>
            </div>

            {scriptScore.improvement_suggestions?.length ? (
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <p className="text-sm font-semibold text-gray-800 mb-2">Suggestions</p>
                <ul className="list-disc pl-5 space-y-1 text-sm text-gray-700">
                  {scriptScore.improvement_suggestions.map((suggestion, index) => (
                    <li key={`${suggestion}-${index}`}>{suggestion}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={isBusy}
            className="flex-1 border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Regenerate for {targetDurationSeconds}s
          </button>

          <button
            type="button"
            onClick={handleApprove}
            disabled={isBusy || !displayScript || !durationFits || isScriptApproved}
            className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isScriptApproved ? 'Script Approved' : 'Approve Script'}
          </button>
        </div>
        {!durationFits ? (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Please regenerate or shorten the script before approving.
          </div>
        ) : null}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        After approval, the next screen should ask you to manually click{' '}
        <strong>Generate Storyboard</strong>. Storyboard generation should not auto-run from this checkpoint.
      </div>
    </div>
  );
}
