'use client';

import React, { useState, useEffect } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';
import styles from './StoryboardCheckpoint.module.css';

interface SceneCard {
  id: string;
  scene_number: number;
  spoken_line: string;
  visual_description: string;
  shot_type: string;
  avatar_action?: string;
  environment?: string;
  mood?: string;
  duration_seconds: number;
}

interface StoryboardCheckpointProps {
  project: StoryboardProject;
  onApprove: () => void;
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
}

export default function StoryboardCheckpoint({ project, onApprove }: StoryboardCheckpointProps) {
  const { generateStoryboard, approveStoryboard, approveSceneImage, rejectSceneImage, loading } = useStoryboardProject();
  const [scenes, setScenes] = useState<SceneCard[]>([]);
  const [showScore, setShowScore] = useState(!!project.storyboard_score);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingScene, setEditingScene] = useState<EditingScene | null>(null);

  useEffect(() => {
    // Auto-generate storyboard if not already started
    if (
      !scenes.length &&
      project.display_script &&
      project.workflow_state === 'script_approved' &&
      !isGenerating &&
      loading === false
    ) {
      setIsGenerating(true);
      generateStoryboard(project.id);
    }
  }, [project.id, project.display_script, scenes.length, generateStoryboard, isGenerating, loading]);

  // Fetch storyboard scenes from API
  useEffect(() => {
    if (project && project.id) {
      const fetchScenes = async () => {
        try {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
          const response = await fetch(`${apiUrl}/api/storyboard/${project.id}/storyboard`, {
            headers: {
              'X-User-ID': localStorage.getItem('test-user-id') || 'test-user',
            },
          });
          if (!response.ok) {
            console.error('Failed to fetch scenes:', response.statusText);
            return;
          }
          const data = await response.json();
          if (data.status === 'success' && data.scenes) {
            setScenes(data.scenes);
          }
        } catch (error) {
          console.error('Error fetching scenes:', error);
        }
      };
      fetchScenes();
    }
  }, [project.id]);

  const handleApprove = async () => {
    await approveStoryboard(project.id);
    onApprove();
  };

  const handleEditScene = (scene: SceneCard) => {
    setEditingScene({
      sceneNum: scene.scene_number,
      sceneId: scene.id,
      spoken_line: scene.spoken_line,
      visual_description: scene.visual_description,
      shot_type: scene.shot_type,
      mood: scene.mood || 'Engaging',
      environment: scene.environment || 'Modern Bathroom',
      avatar_action: scene.avatar_action || 'Product demonstration',
    });
  };

  const handleSaveEdit = () => {
    // In real app, would call API to save scene edits
    console.log('Saving scene edits:', editingScene);
    setEditingScene(null);
  };

  const handleCancelEdit = () => {
    setEditingScene(null);
  };

  const handleApproveScene = async (scene: SceneCard) => {
    await approveSceneImage(project.id, scene.id);
  };

  const handleRejectScene = async (scene: SceneCard) => {
    const feedback = prompt('Provide feedback for rejection:');
    if (!feedback) return;
    await rejectSceneImage(project.id, scene.id, feedback);
  };

  const handleRegenerateScene = async (scene: SceneCard) => {
    console.log('Regenerating scene:', scene.scene_number);
    alert('Scene regeneration feature coming soon');
  };

  const score = project.storyboard_score;
  const totalDuration = project.duration_seconds || 0;
  const displayScenes = scenes.length > 0 ? scenes : [];

  const getScoreColor = (value: number) => {
    if (value >= 8) return '#28a745'; // green
    if (value >= 6) return '#ffc107'; // yellow
    return '#dc3545'; // red
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.headerTitle}>Storyboard Checkpoint</h2>
        <p className={styles.headerSubtitle}>Review scenes and approve your storyboard structure</p>
      </div>

      {/* Storyboard Overview */}
      <div className={styles.card}>
        <div className={styles.overviewSection}>
          <h3 className={styles.overviewTitle}>Storyboard Overview</h3>
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Total Scenes</p>
              <p className={styles.statValue}>{displayScenes.length || 'Generating...'}</p>
            </div>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Total Duration</p>
              <p className={styles.statValue}>{totalDuration || 'Calculating...'}s</p>
            </div>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Approved Scenes</p>
              <p className={styles.statValue}>0/{displayScenes.length || '?'}</p>
            </div>
            <div className={`${styles.statCard} ${styles.statCardAccent}`}>
              <p className={styles.statLabel}>Status</p>
              <p className={styles.statValue} style={{ fontSize: '1.125rem' }}>
                {loading ? 'Generating...' : displayScenes.length > 0 ? 'In Review' : 'Waiting...'}
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className={styles.loadingContainer}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Generating storyboard scenes...</p>
            <p className={styles.loadingSubtext}>This usually takes a few seconds</p>
          </div>
        )}

        {/* No Scenes Yet */}
        {!loading && displayScenes.length === 0 && (
          <div className={styles.loadingContainer}>
            <p className={styles.loadingText}>No scenes generated yet</p>
            <p className={styles.loadingSubtext}>Scenes will appear here once storyboard is generated</p>
          </div>
        )}

        {/* Scene Cards */}
        {displayScenes.length > 0 && (
          <div className={styles.scenesSection}>
            <h4 className={styles.scenesTitle}>Scenes ({displayScenes.length})</h4>
            <div className={styles.scenesList}>
              {displayScenes.map((scene) => (
                <div key={scene.id}>
                  {editingScene?.sceneId === scene.id ? (
                    // Edit Mode
                    <div className={styles.editCard}>
                      <h5 className={styles.editTitle}>Edit Scene {scene.scene_number}</h5>

                      <div className={styles.editForm}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Spoken Line (VO Text)</label>
                          <textarea
                            value={editingScene.spoken_line}
                            onChange={(e) => setEditingScene({ ...editingScene, spoken_line: e.target.value })}
                            className={styles.formTextarea}
                            placeholder="What the narrator/avatar says..."
                          />
                        </div>

                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Visual Description</label>
                          <textarea
                            value={editingScene.visual_description}
                            onChange={(e) => setEditingScene({ ...editingScene, visual_description: e.target.value })}
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
                              onChange={(e) => setEditingScene({ ...editingScene, shot_type: e.target.value })}
                              className={styles.formInput}
                              placeholder="e.g., close-up, medium, wide"
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Mood</label>
                            <input
                              type="text"
                              value={editingScene.mood}
                              onChange={(e) => setEditingScene({ ...editingScene, mood: e.target.value })}
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
                              onChange={(e) => setEditingScene({ ...editingScene, environment: e.target.value })}
                              className={styles.formInput}
                              placeholder="e.g., bathroom, living room"
                            />
                          </div>
                          <div className={styles.formGroup}>
                            <label className={styles.formLabel}>Avatar Action</label>
                            <input
                              type="text"
                              value={editingScene.avatar_action}
                              onChange={(e) => setEditingScene({ ...editingScene, avatar_action: e.target.value })}
                              className={styles.formInput}
                              placeholder="e.g., applying product, looking concerned"
                            />
                          </div>
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
                    // View Mode - Display REAL scene data
                    <div className={`${styles.sceneCard} ${loading ? styles.sceneCardLoading : ''}`}>
                      <div className={styles.sceneHeader}>
                        <div style={{ flex: 1 }}>
                          <h5 className={styles.sceneTitle}>Scene {scene.scene_number}</h5>
                          <p className={styles.sceneDescription}>{scene.spoken_line}</p>
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
                        {scene.avatar_action && (
                          <div className={styles.detailGroup}>
                            <p className={styles.detailLabel}>Action</p>
                            <p className={styles.detailValue}>{scene.avatar_action}</p>
                          </div>
                        )}
                      </div>

                      <div className={styles.sceneButtons}>
                        <button
                          onClick={() => handleEditScene(scene)}
                          disabled={loading}
                          className={`${styles.button} ${styles.buttonEdit} ${loading ? styles.buttonDisabled : ''}`}
                        >
                          ✎ Edit
                        </button>
                        <button
                          onClick={() => handleApproveScene(scene)}
                          disabled={loading}
                          className={`${styles.button} ${styles.buttonApprove} ${loading ? styles.buttonDisabled : ''}`}
                        >
                          ✓ Approve
                        </button>
                        <button
                          onClick={() => handleRejectScene(scene)}
                          disabled={loading}
                          className={`${styles.button} ${styles.buttonReject} ${loading ? styles.buttonDisabled : ''}`}
                        >
                          ✗ Reject
                        </button>
                        <button
                          onClick={() => handleRegenerateScene(scene)}
                          disabled={loading}
                          className={`${styles.button} ${styles.buttonRegenerate} ${loading ? styles.buttonDisabled : ''}`}
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
        )}

        {/* Quality Score */}
        {showScore && score && (
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

            {score.improvement_suggestions && score.improvement_suggestions.length > 0 && (
              <div className={styles.suggestionsContainer}>
                <p className={styles.suggestionsTitle}>Suggestions for improvement:</p>
                <ul className={styles.suggestionsList}>
                  {score.improvement_suggestions.map((suggestion, idx) => (
                    <li key={idx}>• {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!showScore && score && (
          <div style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid hsl(var(--color-border-soft))' }}>
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
        )}

        {/* Action Buttons */}
        <div className={styles.actionSection}>
          <button
            onClick={handleApprove}
            disabled={loading}
            className={`${styles.actionButton} ${styles.buttonPrimary} ${loading ? styles.buttonDisabledState : ''}`}
          >
            {loading ? 'Processing...' : '✓ Approve Storyboard'}
          </button>
          <button
            disabled={loading}
            className={`${styles.actionButton} ${styles.buttonSecondary} ${loading ? styles.buttonDisabledState : ''}`}
          >
            {loading ? 'Processing...' : '🔄 Regenerate All'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className={styles.infoContainer}>
        <p className={styles.infoText}>
          <strong>💡 Tip:</strong> {loading ? 'Storyboard is being generated. Scene details will appear once ready.' : displayScenes.length > 0 ? 'You can edit any scene details, approve/reject individual scenes, or regenerate scenes with different prompts.' : 'Generate a storyboard from your approved script to see scenes.'}
        </p>
      </div>
    </div>
  );
}
