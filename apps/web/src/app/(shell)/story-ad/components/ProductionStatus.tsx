'use client';

import React, { useEffect, useMemo } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { ProductionStatus as ProductionStatusType } from '../hooks/useProductionPolling';
import { useProductionPolling } from '../hooks/useProductionPolling';

interface ProductionStatusProps {
  project: StoryboardProject;
  productionStatus: ProductionStatusType | null;
}

export default function ProductionStatus({ project, productionStatus }: ProductionStatusProps) {
  const { isPolling, startPolling } = useProductionPolling(project?.id);

  useEffect(() => {
    if (project?.workflow_state?.includes('production') && !isPolling) {
      startPolling();
    }
  }, [project?.workflow_state, isPolling, startPolling]);

  const scenes = useMemo(() => {
    const source = Array.isArray(productionStatus?.scenes) ? productionStatus?.scenes : [];
    return [...source].sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
  }, [productionStatus?.scenes]);

  const totalScenes = scenes.length;
  const imageCompleted = scenes.filter((scene) => scene.image_status === 'completed').length;
  const videoCompleted = scenes.filter((scene) => scene.video_status === 'completed').length;
  const lipsyncRequired = scenes.filter((scene) => scene.lipsync_status !== 'skipped').length;
  const lipsyncCompleted = scenes.filter((scene) => scene.lipsync_status === 'completed').length;
  const overallProgress = productionStatus?.overall_progress ?? (totalScenes > 0 ? Math.round((videoCompleted / totalScenes) * 100) : 0);

  const stageIcon = (status: 'completed' | 'active' | 'waiting' | 'failed') => {
    if (status === 'completed') return '✅';
    if (status === 'active') return '⏳';
    if (status === 'failed') return '❌';
    return '⏹️';
  };

  const imageStage: 'completed' | 'active' | 'waiting' | 'failed' = imageCompleted === totalScenes && totalScenes > 0 ? 'completed' : imageCompleted > 0 ? 'active' : 'waiting';
  const videoStage: 'completed' | 'active' | 'waiting' | 'failed' = videoCompleted === totalScenes && totalScenes > 0 ? 'completed' : videoCompleted > 0 ? 'active' : 'waiting';
  const lipsyncStage: 'completed' | 'active' | 'waiting' | 'failed' = lipsyncRequired === 0
    ? 'completed'
    : lipsyncCompleted === lipsyncRequired
      ? 'completed'
      : lipsyncCompleted > 0
        ? 'active'
        : 'waiting';

  const finalVideoExists = Boolean(project?.final_video_url);

  console.log('storyboard_production_ui_real_scene_count', { projectId: project?.id, totalScenes });
  console.log('storyboard_production_ui_video_completed_count', { projectId: project?.id, videoCompleted, totalScenes });

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Production in Progress</h2>
        <p className="text-gray-600">Your ad is being generated. This may take a few minutes.</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        <div className="mb-8">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold text-gray-900">Overall Progress</h3>
            <span className="text-2xl font-bold text-indigo-600">{overallProgress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden mb-3">
            <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full transition-all duration-500" style={{ width: `${overallProgress}%` }}></div>
          </div>
        </div>

        <div className="mb-8 pt-8 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Production Stages</h3>
          <div className="space-y-4">
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">Image Generation</h4>
                  <p className="text-sm text-gray-600">{imageCompleted} of {totalScenes} scenes completed</p>
                </div>
                <span className="text-xl">{stageIcon(imageStage)}</span>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">Video Generation</h4>
                  <p className="text-sm text-gray-600">{videoCompleted} of {totalScenes} scenes completed</p>
                </div>
                <span className="text-xl">{stageIcon(videoStage)}</span>
              </div>
            </div>
            <div className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-gray-900">Lipsync</h4>
                  <p className="text-sm text-gray-600">
                    {lipsyncRequired === 0 ? 'Skipped / Not required' : `${lipsyncCompleted} of ${lipsyncRequired} scenes completed`}
                  </p>
                </div>
                <span className="text-xl">{stageIcon(lipsyncStage)}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-8 pt-8 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Scene Status</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenes.map((scene) => {
              const videoDone = scene.video_status === 'completed';
              const imageDone = scene.image_status === 'completed';
              const lipsyncDone = scene.lipsync_status === 'completed' || scene.lipsync_status === 'skipped';
              const sceneState = videoDone ? 'Done' : scene.video_status === 'generating' ? 'In Progress' : 'Waiting';
              return (
                <div key={scene.scene_id} className="border border-gray-200 rounded-lg p-4 text-center">
                  <div className="text-3xl mb-2">{videoDone ? '✅' : scene.video_status === 'generating' ? '⏳' : '⏹️'}</div>
                  <h4 className="font-semibold text-gray-900 mb-2">Scene {scene.scene_number}</h4>
                  <div className="text-xs text-gray-600 space-y-1 mb-3">
                    <div>🖼️ {imageDone ? '✓' : '○'}</div>
                    <div>🎬 {videoDone ? '✓' : scene.video_status === 'generating' ? '⟳' : '○'}</div>
                    <div>👄 {lipsyncDone ? '✓' : '○'}</div>
                  </div>
                  <div className="text-xs font-medium text-gray-700">{sceneState}</div>
                </div>
              );
            })}
          </div>
        </div>

        {finalVideoExists ? (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-800">Final video detected. Moving to next stage…</p>
          </div>
        ) : null}

        <div className="text-center pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">🔄 Auto-refreshing every 3 seconds • {isPolling ? '🟢 Live' : '⚪ Paused'}</p>
        </div>
      </div>
    </div>
  );
}
