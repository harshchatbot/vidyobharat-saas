'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCurrentUserIdOrThrow } from '@/lib/authUser';

export interface SceneProductionStatus {
  scene_id: string;
  scene_number: number;
  state: string;
  image_status?: 'pending' | 'generating' | 'completed' | 'failed';
  video_status?: 'pending' | 'generating' | 'completed' | 'failed';
  lipsync_status?: 'pending' | 'applying' | 'completed' | 'failed' | 'skipped';
  progress_percentage: number;
}

export interface ProductionStatus {
  project_id: string;
  workflow_state: string;
  overall_progress: number;
  estimated_remaining_seconds?: number;
  scenes: SceneProductionStatus[];
  current_stage?: string;
  task_id?: string;
  error?: string;
}

function normalizeState(state?: string | null): string {
  return String(state || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');
}

function isMockModeEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem('testMode') === 'mock';
}

function getMockProductionStatus(projectId: string): ProductionStatus {
  return {
    project_id: projectId,
    workflow_state: 'images_awaiting_approval',
    overall_progress: 100,
    scenes: [
      {
        scene_id: 'scene-1',
        scene_number: 1,
        state: 'image_complete',
        image_status: 'completed',
        video_status: 'pending',
        lipsync_status: 'skipped',
        progress_percentage: 100,
      },
      {
        scene_id: 'scene-2',
        scene_number: 2,
        state: 'image_complete',
        image_status: 'completed',
        video_status: 'pending',
        lipsync_status: 'skipped',
        progress_percentage: 100,
      },
      {
        scene_id: 'scene-3',
        scene_number: 3,
        state: 'image_complete',
        image_status: 'completed',
        video_status: 'pending',
        lipsync_status: 'skipped',
        progress_percentage: 100,
      },
      {
        scene_id: 'scene-4',
        scene_number: 4,
        state: 'image_complete',
        image_status: 'completed',
        video_status: 'pending',
        lipsync_status: 'skipped',
        progress_percentage: 100,
      },
    ],
    current_stage: 'images_awaiting_approval',
  };
}

function statusFromAny(value: unknown): string {
  return normalizeState(String(value || ''));
}

export function useProductionPolling(projectId?: string) {
  const [productionStatus, setProductionStatus] = useState<ProductionStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const fetchProductionStatus = useCallback(async () => {
    if (!projectId) return;
    console.log('[useProductionPolling] storyboard_production_poll_tick', { projectId });

    if (isMockModeEnabled()) {
      setProductionStatus(getMockProductionStatus(projectId));
      return;
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

      const response = await fetch(`${apiUrl}/api/storyboard/${projectId}`, {
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': getCurrentUserIdOrThrow('Production polling'),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[useProductionPolling] Failed to fetch status:', {
          status: response.status,
          errorText,
        });
        return;
      }

      const data = await response.json();
      const project = data.project || data;
      const scenes = Array.isArray(data.scenes)
        ? data.scenes
        : Array.isArray(project.scenes)
          ? project.scenes
          : [];

      const totalScenes = scenes.length;
      const completedScenes = scenes.filter((scene: any) => {
        const state = normalizeState(scene.state);
        const videoStatus = statusFromAny(scene.scene_video_status || scene.video_status);
        return (
          state === 'completed' ||
          state === 'complete' ||
          state === 'video_complete' ||
          videoStatus === 'completed' ||
          Boolean(scene.scene_video_url || scene.video_url || scene.lipsync_video_url)
        );
      }).length;

      const overallProgress = totalScenes > 0 ? (completedScenes / totalScenes) * 100 : 0;
      const workflowState = normalizeState(project.workflow_state);
      console.log('storyboard_production_poll_project_status', { projectId, workflowState, finalVideoUrl: project.final_video_url || null });
      if (project.final_video_url) {
        console.log('storyboard_production_final_video_detected', { projectId, finalVideoUrl: project.final_video_url });
        if (typeof window !== 'undefined') {
          console.log('storyboard_notification_refresh_requested', { projectId });
          window.dispatchEvent(new CustomEvent('storyboard:final-video-ready', { detail: { projectId, finalVideoUrl: project.final_video_url } }));
        }
      }

      setProductionStatus({
        project_id: projectId,
        workflow_state: workflowState,
        overall_progress: Math.round(overallProgress),
        scenes: scenes.map((scene: any) => {
          const state = normalizeState(scene.state);

          return {
            scene_id: scene.id,
            scene_number: scene.scene_number,
            state,
            image_status: scene.base_image_url ? 'completed' : state.includes('image_generating') ? 'generating' : 'pending',
            video_status: (statusFromAny(scene.scene_video_status || scene.video_status) as any) || (scene.scene_video_url || scene.video_url ? 'completed' : state.includes('video_generating') ? 'generating' : 'pending'),
            lipsync_status: (statusFromAny(scene.lipsync_status) as any) || (scene.lipsync_video_url ? 'completed' : scene.lipsync_this_scene ? 'pending' : 'skipped'),
            progress_percentage:
              scene.final_scene_video_url || scene.lipsync_video_url || scene.scene_video_url || scene.video_url
                ? 100
                : scene.base_image_url
                  ? 50
                  : 10,
          };
        }),
        current_stage: workflowState,
        error: project.error,
      });
    } catch (err) {
      console.error('[useProductionPolling] Error fetching production status:', err);
    }
  }, [projectId]);

  const startPolling = useCallback(() => {
    if (!projectId || isPolling) return;

    setIsPolling(true);
    void fetchProductionStatus();

    if (isMockModeEnabled()) {
      return;
    }

    pollIntervalRef.current = setInterval(() => {
      void fetchProductionStatus();
    }, 3000);
  }, [projectId, isPolling, fetchProductionStatus]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = undefined;
    }

    setIsPolling(false);
  }, []);

  useEffect(() => {
    const state = normalizeState(productionStatus?.workflow_state);

    if (
      state === 'final_awaiting_approval' ||
      state === 'completed' ||
      state === 'failed'
    ) {
      stopPolling();
    }
  }, [productionStatus?.workflow_state, stopPolling]);

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    productionStatus,
    isPolling,
    startPolling,
    stopPolling,
    refetchStatus: fetchProductionStatus,
  };
}
