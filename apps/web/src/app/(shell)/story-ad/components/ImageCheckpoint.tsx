'use client';

import React, { useState, useEffect } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';

interface Scene {
  id: string;
  scene_number: number;
  scene_type: string;
  spoken_line: string;
  visual_description: string;
  shot_type: string;
  base_image_url: string | null;
  state: string;
  user_approved: boolean | null;
}

interface ImageCheckpointProps {
  project: StoryboardProject;
  onApprove: () => void;
}

export default function ImageCheckpoint({ project, onApprove }: ImageCheckpointProps) {
  const { generateImages, approveImages, approveSceneImage, rejectSceneImage, loading } = useStoryboardProject();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [scenesLoading, setScenesLoading] = useState(true);
  const [rejectionFeedback, setRejectionFeedback] = useState<Record<string, string>>({});
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null);

  // Fetch scenes from API
  useEffect(() => {
    const fetchScenes = async () => {
      try {
        setScenesLoading(true);
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        const response = await fetch(
          `${apiUrl}/api/storyboard/${project.id}/storyboard`,
          {
            headers: {
              'X-User-ID': 'test-user',
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          console.log('Fetched scenes:', data.scenes);
          setScenes(data.scenes || []);
        }
      } catch (error) {
        console.error('Failed to fetch scenes:', error);
      } finally {
        setScenesLoading(false);
      }
    };

    if (project.id) {
      fetchScenes();
    }
  }, [project.id]);

  const handleApproveAll = async () => {
    await approveImages(project.id);
    onApprove();
  };

  const handleRejectScene = (sceneId: string) => {
    setShowFeedbackFor(sceneId);
  };

  const handleSubmitRejection = async (sceneId: string) => {
    const feedback = rejectionFeedback[sceneId] || '';
    await rejectSceneImage(project.id, sceneId, feedback);
    setShowFeedbackFor(null);
    setRejectionFeedback(prev => ({ ...prev, [sceneId]: '' }));
  };

  const handleApproveScene = async (sceneId: string) => {
    await approveSceneImage(project.id, sceneId);
  };

  const handleGenerateImages = async () => {
    await generateImages(project.id);
  };

  // Calculate stats from actual scenes
  const totalScenes = scenes.length;
  const approvedImages = scenes.filter(s => s.user_approved === true).length;
  const rejectedImages = scenes.filter(s => s.user_approved === false).length;
  const pendingImages = scenes.filter(s => s.user_approved === null && s.base_image_url).length;
  const notGeneratedImages = scenes.filter(s => !s.base_image_url).length;

  if (scenesLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 font-semibold">Loading scenes...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Image Checkpoint</h2>
        <p className="text-gray-600">Review base images for each scene</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
            <p className="text-sm text-gray-600 mb-1">Total Scenes</p>
            <p className="text-3xl font-bold text-blue-600">{totalScenes}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600 mb-1">Approved Images</p>
            <p className="text-3xl font-bold text-green-600">{approvedImages}/{totalScenes}</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <p className="text-sm text-gray-600 mb-1">Not Generated</p>
            <p className="text-3xl font-bold text-yellow-600">{notGeneratedImages}</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600 mb-1">Pending Review</p>
            <p className="text-3xl font-bold text-purple-600">{pendingImages}</p>
          </div>
        </div>

        {/* Image Grid */}
        <div className="mb-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Scene Base Images</h3>

          {notGeneratedImages > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-yellow-900">
                <strong>⚠️ Note:</strong> {notGeneratedImages} scene(s) don't have images yet. Click "Generate Missing Images" below to create them.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scenes.map((scene) => (
              <div key={scene.id} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                {/* Image */}
                <div className="w-full h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center overflow-hidden">
                  {scene.base_image_url ? (
                    <img
                      src={scene.base_image_url}
                      alt={`Scene ${scene.scene_number}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="text-4xl mb-2">🎬</div>
                      <p className="text-sm text-gray-600">Scene {scene.scene_number} - Not Generated</p>
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Scene {scene.scene_number}: {scene.scene_type}</h4>
                  <p className="text-sm text-gray-700 mb-2 font-medium">Dialogue:</p>
                  <p className="text-sm text-gray-600 mb-3 italic">"{scene.spoken_line}"</p>
                  <p className="text-sm text-gray-700 mb-2 font-medium">Visual:</p>
                  <p className="text-sm text-gray-600 mb-4">{scene.visual_description}</p>

                  {showFeedbackFor === scene.id ? (
                    <div className="mb-3">
                      <textarea
                        value={rejectionFeedback[scene.id] || ''}
                        onChange={(e) =>
                          setRejectionFeedback(prev => ({
                            ...prev,
                            [scene.id]: e.target.value
                          }))
                        }
                        placeholder="What would you like changed?"
                        className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSubmitRejection(scene.id)}
                          className="flex-1 px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium"
                        >
                          Submit Feedback
                        </button>
                        <button
                          onClick={() => {
                            setShowFeedbackFor(null);
                            setRejectionFeedback(prev => ({ ...prev, [scene.id]: '' }));
                          }}
                          className="flex-1 px-2 py-1 bg-gray-200 text-gray-800 rounded text-sm hover:bg-gray-300"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApproveScene(scene.id)}
                        disabled={loading || !scene.base_image_url}
                        className="flex-1 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded text-sm hover:bg-green-100 disabled:opacity-50 font-medium"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => handleRejectScene(scene.id)}
                        disabled={loading || !scene.base_image_url}
                        className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded text-sm hover:bg-red-100 disabled:opacity-50 font-medium"
                      >
                        ✗ Reject
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Credit Notice */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-orange-900">
            <strong>⚡ Note:</strong> Generating images will deduct 5-10 credits per scene. Approving will lock in the images for video generation.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleApproveAll}
            disabled={loading || notGeneratedImages > 0}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {loading ? 'Processing...' : '✓ Approve All Images'}
          </button>
          <button
            onClick={handleGenerateImages}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {loading ? 'Generating...' : notGeneratedImages > 0 ? `✨ Generate ${notGeneratedImages} Missing Images` : '✨ Regenerate Images'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 Tip:</strong> All {totalScenes} scenes are ready. Generate base images to proceed to video production.
        </p>
      </div>
    </div>
  );
}
