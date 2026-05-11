'use client';

import React, { useState } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';

interface ImageCheckpointProps {
  project: StoryboardProject;
  onApprove: () => void;
}

export default function ImageCheckpoint({ project, onApprove }: ImageCheckpointProps) {
  const { generateImages, approveImages, approveSceneImage, rejectSceneImage, loading } = useStoryboardProject();
  const [rejectionFeedback, setRejectionFeedback] = useState<Record<string, string>>({});
  const [showFeedbackFor, setShowFeedbackFor] = useState<string | null>(null);

  const handleApproveAll = async () => {
    // Call approveImages API, then navigate to next checkpoint
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
            <p className="text-3xl font-bold text-blue-600">5</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4 border border-green-200">
            <p className="text-sm text-gray-600 mb-1">Approved Images</p>
            <p className="text-3xl font-bold text-green-600">2/5</p>
          </div>
          <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
            <p className="text-sm text-gray-600 mb-1">Rejected</p>
            <p className="text-3xl font-bold text-yellow-600">1</p>
          </div>
          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-gray-600 mb-1">Pending Review</p>
            <p className="text-3xl font-bold text-purple-600">2</p>
          </div>
        </div>

        {/* Image Grid */}
        <div className="mb-6 pt-6 border-t border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Scene Base Images</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5].map((sceneNum) => (
              <div key={sceneNum} className="border border-gray-200 rounded-lg overflow-hidden hover:shadow-lg transition-shadow">
                {/* Placeholder Image */}
                <div className="w-full h-48 bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-4xl mb-2">🎬</div>
                    <p className="text-sm text-gray-600">Scene {sceneNum} Base Image</p>
                  </div>
                </div>

                <div className="p-4">
                  <h4 className="font-semibold text-gray-900 mb-2">Scene {sceneNum}</h4>
                  <p className="text-sm text-gray-600 mb-4">
                    {sceneNum === 1 && 'Product on modern bathroom shelf with soft lighting'}
                    {sceneNum === 2 && 'Close-up of hands applying moisturizer'}
                    {sceneNum === 3 && 'Happy person with glowing skin looking in mirror'}
                    {sceneNum === 4 && 'Product bottle with water droplets'}
                    {sceneNum === 5 && 'Lifestyle shot of person enjoying skincare routine'}
                  </p>

                  {showFeedbackFor === `scene_${sceneNum}` ? (
                    <div className="mb-3">
                      <textarea
                        value={rejectionFeedback[`scene_${sceneNum}`] || ''}
                        onChange={(e) =>
                          setRejectionFeedback(prev => ({
                            ...prev,
                            [`scene_${sceneNum}`]: e.target.value
                          }))
                        }
                        placeholder="What would you like changed?"
                        className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                        rows={3}
                      />
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={() => handleSubmitRejection(`scene_${sceneNum}`)}
                          className="flex-1 px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium"
                        >
                          Submit Feedback
                        </button>
                        <button
                          onClick={() => {
                            setShowFeedbackFor(null);
                            setRejectionFeedback(prev => ({ ...prev, [`scene_${sceneNum}`]: '' }));
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
                        onClick={() => handleApproveScene(`scene_${sceneNum}`)}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-green-50 text-green-700 border border-green-200 rounded text-sm hover:bg-green-100 disabled:opacity-50 font-medium"
                      >
                        ✓ Approve
                      </button>
                      <button
                        onClick={() => handleRejectScene(`scene_${sceneNum}`)}
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded text-sm hover:bg-red-100 disabled:opacity-50 font-medium"
                      >
                        ✗ Reject
                      </button>
                      <button
                        disabled={loading}
                        className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded text-sm hover:bg-blue-100 disabled:opacity-50 font-medium"
                      >
                        🔄 Regen
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
            <strong>⚡ Note:</strong> Generating images will deduct 5-10 credits per scene (depending on quality tier). Approving will lock in the images for video generation.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleApproveAll}
            disabled={loading}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {loading ? 'Processing...' : '✓ Approve All Images'}
          </button>
          <button
            onClick={handleGenerateImages}
            disabled={loading}
            className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {loading ? 'Generating...' : '✨ Generate Missing Images'}
          </button>
        </div>
      </div>

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-900">
          <strong>💡 Tip:</strong> High-quality images improve video generation results. You can regenerate individual scene images if needed.
        </p>
      </div>
    </div>
  );
}
