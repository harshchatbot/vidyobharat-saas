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
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes pulse-glow { 0%, 100% { opacity: 1; } 50% { opacity: 0.6; } }
      `}</style>

      <div className="mesh-bg min-h-screen p-4 md:p-6">
        <div className="max-w-6xl mx-auto space-y-4">
          {/* Header Section */}
          <div className="glass-card-strong px-6 py-4 mb-4 flex items-center justify-between">
            <div>
              <p style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'hsl(var(--color-muted))' }}>
                STORYBOARD AD CREATOR
              </p>
              <h1 style={{
                fontSize: '22px', fontWeight: '700',
                background: 'linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent-pink)))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                Production in Progress
              </h1>
              <p style={{ fontSize: '13px', color: 'hsl(var(--color-text-secondary))', marginTop: '2px' }}>
                Your ad is being generated. You can safely leave this page.
              </p>
            </div>
            {/* Live indicator */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 14px', borderRadius: '999px',
              background: 'hsl(var(--color-success) / 0.12)',
              border: '1px solid hsl(var(--color-success) / 0.3)',
            }}>
              <div style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: 'hsl(var(--color-success))',
                animation: 'pulse-glow 1.5s ease-in-out infinite',
              }} />
              <span style={{ fontSize: '12px', fontWeight: '600', color: 'hsl(var(--color-success))' }}>
                Live
              </span>
            </div>
          </div>

          {/* Overall Progress Section */}
          <div className="glass-card-strong p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'hsl(var(--color-text))' }}>
                Overall Progress
              </h2>
              <span style={{
                fontSize: '28px', fontWeight: '800',
                background: 'linear-gradient(135deg, hsl(var(--color-primary)), hsl(var(--color-accent-pink)))',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {overallProgress}%
              </span>
            </div>

            {/* Thin gradient progress bar */}
            <div style={{
              height: '6px', borderRadius: '999px',
              background: 'hsl(var(--glass-border))',
              overflow: 'hidden', marginBottom: '12px',
            }}>
              <div style={{
                height: '100%', borderRadius: '999px',
                background: 'linear-gradient(90deg, hsl(var(--color-primary)), hsl(var(--color-accent-pink)), hsl(var(--color-accent-amber)))',
                width: `${overallProgress}%`,
                transition: 'width 0.5s ease-out',
                boxShadow: '0 0 10px hsl(var(--color-primary) / 0.5)',
              }} />
            </div>

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Images', value: `${imageCompleted}/${totalScenes}`, done: imageCompleted === totalScenes },
                { label: 'Videos', value: `${videoCompleted}/${totalScenes}`, done: videoCompleted === totalScenes },
                { label: 'Lipsync', value: lipsyncRequired > 0 ? `${lipsyncCompleted}/${lipsyncRequired}` : 'N/A', done: lipsyncRequired === 0 || lipsyncCompleted === lipsyncRequired },
              ].map(stat => (
                <div key={stat.label} className="glass-card p-3 text-center">
                  <p style={{
                    fontSize: '18px', fontWeight: '700',
                    color: stat.done ? 'hsl(var(--color-success))' : 'hsl(var(--color-text))',
                  }}>
                    {stat.value}
                  </p>
                  <p style={{ fontSize: '11px', color: 'hsl(var(--color-muted))', marginTop: '2px' }}>
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Production Pipeline Section */}
          <div className="glass-card-strong p-5 mb-4">
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'hsl(var(--color-text))', marginBottom: '16px' }}>
              Production Pipeline
            </h2>
            <div className="flex items-center gap-0">
              {[
                { label: 'Images', count: `${imageCompleted}/${totalScenes}`, done: imageCompleted === totalScenes, active: imageCompleted < totalScenes },
                { label: 'Videos', count: `${videoCompleted}/${totalScenes}`, done: videoCompleted === totalScenes, active: imageCompleted === totalScenes && videoCompleted < totalScenes },
                { label: 'Lipsync', count: lipsyncRequired > 0 ? `${lipsyncCompleted}/${lipsyncRequired}` : 'Skipped', done: lipsyncRequired === 0 || lipsyncCompleted === lipsyncRequired, active: videoCompleted === totalScenes && lipsyncCompleted < lipsyncRequired },
                { label: 'Stitching', count: overallProgress === 100 ? 'Done' : 'Pending', done: overallProgress === 100, active: lipsyncCompleted === lipsyncRequired && overallProgress < 100 },
              ].map((stage, i, arr) => (
                <div key={stage.label} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '50%',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      margin: '0 auto 6px',
                      background: stage.done
                        ? 'hsl(var(--color-success) / 0.15)'
                        : stage.active
                        ? 'hsl(var(--color-primary) / 0.15)'
                        : 'hsl(var(--glass-bg-medium))',
                      border: `2px solid ${stage.done ? 'hsl(var(--color-success))' : stage.active ? 'hsl(var(--color-primary))' : 'hsl(var(--glass-border))'}`,
                      animation: stage.active ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
                    }}>
                      {stage.done ? (
                        <span style={{ color: 'hsl(var(--color-success))', fontSize: '16px' }}>✓</span>
                      ) : stage.active ? (
                        <span style={{ fontSize: '14px', animation: 'spin 1s linear infinite', display: 'inline-block' }}>⟳</span>
                      ) : (
                        <span style={{ color: 'hsl(var(--color-muted))', fontSize: '12px' }}>○</span>
                      )}
                    </div>
                    <p style={{
                      fontSize: '11px', textAlign: 'center', fontWeight: stage.active ? '600' : '400',
                      color: stage.done ? 'hsl(var(--color-success))' : stage.active ? 'hsl(var(--color-primary))' : 'hsl(var(--color-muted))',
                    }}>
                      {stage.label}
                    </p>
                    <p style={{ fontSize: '10px', textAlign: 'center', color: 'hsl(var(--color-muted))' }}>
                      {stage.count}
                    </p>
                  </div>
                  {i < arr.length - 1 && (
                    <div style={{
                      height: '2px', flex: 0.5,
                      background: stage.done ? 'hsl(var(--color-success))' : 'hsl(var(--glass-border))',
                      transition: 'background 0.5s ease',
                      marginBottom: '22px',
                    }} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Scene Status Grid */}
          <div className="glass-card-strong p-5">
            <h2 style={{ fontSize: '14px', fontWeight: '600', color: 'hsl(var(--color-text))', marginBottom: '12px' }}>
              Scene Status
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {scenes.map((scene) => (
                <div key={scene.scene_id} className="glass-card p-3">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: '600', color: 'hsl(var(--color-text))' }}>
                      Scene {scene.scene_number}
                    </span>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '999px',
                      background: scene.video_status === 'completed' ? 'hsl(var(--color-success) / 0.15)' : 'hsl(var(--color-primary) / 0.15)',
                      color: scene.video_status === 'completed' ? 'hsl(var(--color-success))' : 'hsl(var(--color-primary))',
                    }}>
                      {scene.video_status === 'completed' ? 'Done' : scene.video_status === 'generating' ? 'Generating' : 'Waiting'}
                    </span>
                  </div>
                  {[
                    { label: '🖼️ Image', status: scene.image_status },
                    { label: '🎬 Video', status: scene.video_status },
                    { label: '👄 Lipsync', status: scene.lipsync_status },
                  ].map(item => (
                    <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span style={{ fontSize: '10px', color: 'hsl(var(--color-muted))' }}>{item.label}</span>
                      <span style={{
                        fontSize: '10px',
                        color: item.status === 'completed' ? 'hsl(var(--color-success))' : item.status === 'generating' ? 'hsl(var(--color-accent-amber))' : item.status === 'skipped' ? 'hsl(var(--color-muted))' : 'hsl(var(--color-muted))',
                      }}>
                        {item.status === 'completed' ? '✓' : item.status === 'generating' ? '⟳' : item.status === 'skipped' ? '—' : '○'}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {finalVideoExists ? (
            <div className="glass-card-strong p-4" style={{ background: 'hsl(var(--color-success) / 0.15)', border: '1px solid hsl(var(--color-success) / 0.3)' }}>
              <p style={{ fontSize: '13px', color: 'hsl(var(--color-success))', fontWeight: '500' }}>✓ Final video detected. Moving to next stage…</p>
            </div>
          ) : null}
        </div>
      </div>

      {showLeavePopup && (
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
      )}
    </>
  );
}
