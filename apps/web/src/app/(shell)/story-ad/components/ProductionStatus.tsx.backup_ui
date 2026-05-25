'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { ProductionStatus as ProductionStatusType } from '../hooks/useProductionPolling';
import { useProductionPolling } from '../hooks/useProductionPolling';

interface ProductionStatusProps {
  project: StoryboardProject;
  productionStatus: ProductionStatusType | null;
}

function AnimatedRadialChart({
  value = 0,
  size = 220,
  duration = 1.2,
}: {
  value?: number;
  size?: number;
  duration?: number;
}) {
  const strokeWidth = Math.max(10, size * 0.055);
  const radius = size * 0.35;
  const center = size / 2;
  const circumference = Math.PI * radius;

  const animatedValue = useMotionValue(0);
  const offset = useTransform(animatedValue, [0, 100], [circumference, 0]);

  useEffect(() => {
    const controls = animate(animatedValue, value, {
      duration,
      ease: 'easeOut',
    });
    return controls.stop;
  }, [animatedValue, value, duration]);

  return (
    <div className="relative" style={{ width: size, height: size * 0.7 }}>
      <svg width={size} height={size * 0.7} viewBox={`0 0 ${size} ${size * 0.7}`} className="overflow-visible">
        <path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="hsl(var(--color-border))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          opacity="0.55"
        />
        <motion.path
          d={`M ${center - radius} ${center} A ${radius} ${radius} 0 0 1 ${center + radius} ${center}`}
          fill="none"
          stroke="hsl(var(--color-accent))"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 mt-9 flex items-center justify-center">
        <div className="text-center">
          <div className="text-3xl font-bold text-text">
            <motion.span>{useTransform(animatedValue, (latest) => Math.round(latest))}</motion.span>%
          </div>
          <div className="mt-1 text-xs text-muted">Live progress</div>
        </div>
      </div>
      <div className="absolute bottom-0 left-3 text-[11px] text-muted">0%</div>
      <div className="absolute bottom-0 right-3 text-[11px] text-muted">100%</div>
    </div>
  );
}

export default function ProductionStatus({ project, productionStatus }: ProductionStatusProps) {
  const { productionStatus: liveProductionStatus, isPolling, startPolling } = useProductionPolling(project?.id);
  const [showLeavePopup, setShowLeavePopup] = useState(false);

  const effectiveStatus = liveProductionStatus ?? productionStatus;

  useEffect(() => {
    if (project?.workflow_state?.includes('production') && !isPolling) {
      startPolling();
    }
  }, [project?.workflow_state, isPolling, startPolling]);

  useEffect(() => {
    if (!project?.id) return;
    const state = String(project?.workflow_state || '').toLowerCase();
    const isActive = state === 'production_starting' || state === 'production_in_progress';
    if (!isActive || project?.final_video_url) return;
    const key = `storyboard-leave-popup-dismissed-${project.id}`;
    if (typeof window !== 'undefined' && localStorage.getItem(key) !== '1') {
      setShowLeavePopup(true);
    }
  }, [project?.id, project?.workflow_state, project?.final_video_url]);

  const scenes = useMemo(() => {
    const source = Array.isArray(effectiveStatus?.scenes) ? effectiveStatus?.scenes : [];
    return [...source].sort((a, b) => (a.scene_number || 0) - (b.scene_number || 0));
  }, [effectiveStatus?.scenes]);

  const totalScenes = scenes.length;
  const imageCompleted = scenes.filter((scene) => scene.image_status === 'completed').length;
  const videoCompleted = scenes.filter((scene) => scene.video_status === 'completed').length;
  const lipsyncRequired = scenes.filter((scene) => scene.lipsync_status !== 'skipped').length;
  const lipsyncCompleted = scenes.filter((scene) => scene.lipsync_status === 'completed').length;
  const sceneProgress = totalScenes > 0
    ? Math.round(
      scenes.reduce((acc, scene) => {
        const img = scene.image_status === 'completed' ? 1 : 0;
        const vid = scene.video_status === 'completed' ? 1 : 0;
        const lip = scene.lipsync_status === 'completed' || scene.lipsync_status === 'skipped' ? 1 : 0;
        return acc + ((img + vid + lip) / 3);
      }, 0) / totalScenes * 100,
    )
    : 0;
  const overallProgress = Math.max(
    effectiveStatus?.overall_progress ?? 0,
    sceneProgress,
  );

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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Overall Progress</h3>
            <span className="text-2xl font-bold text-indigo-600">{overallProgress}%</span>
          </div>
          <div className="mb-3 grid grid-cols-1 gap-6 lg:grid-cols-[260px_1fr]">
            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <AnimatedRadialChart value={overallProgress} size={220} />
            </div>
            <div className="flex items-center">
              <div className="w-full">
                <div className="mb-3 h-4 w-full overflow-hidden rounded-full bg-gray-200">
                  <div className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 transition-all duration-500" style={{ width: `${overallProgress}%` }}></div>
                </div>
                <p className="text-sm text-gray-600">
                  {videoCompleted} of {totalScenes} scene videos completed • {lipsyncCompleted} of {lipsyncRequired || totalScenes} lipsync steps completed
                </p>
              </div>
            </div>
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

      {showLeavePopup ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-white p-5 shadow-xl">
            <h4 className="text-lg font-semibold text-gray-900">Video generation is running</h4>
            <p className="mt-2 text-sm text-gray-600">
              You can safely leave this page. We’ll notify you once your video is generated and ready.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  if (project?.id && typeof window !== 'undefined') {
                    localStorage.setItem(`storyboard-leave-popup-dismissed-${project.id}`, '1');
                  }
                  setShowLeavePopup(false);
                }}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
