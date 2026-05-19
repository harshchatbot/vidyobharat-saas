'use client';

import React, { useState } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { useStoryboardProject } from '../hooks/useStoryboardProject';
import { API_URL } from '@/lib/env';

interface FinalPreviewProps {
  project: StoryboardProject;
  onApprove: () => void;
  onStartNewProject?: () => void;
}

export default function FinalPreview({ project, onApprove, onStartNewProject }: FinalPreviewProps) {
  const { approveFinalVideo, loading } = useStoryboardProject();
  const [showScore, setShowScore] = useState(!!project.final_score);
  const [feedbackText, setFeedbackText] = useState('');
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  const handleApprove = async () => {
    await approveFinalVideo(project.id);
    onApprove();
  };

  const handleRequestRevision = () => {
    setShowFeedbackForm(true);
  };

  const score = project.final_score;
  const rawFinalVideoUrl = String(project.final_video_url || '').trim();
  const normalizedFinalVideoUrl = (() => {
    if (!rawFinalVideoUrl) return '';
    if (rawFinalVideoUrl.startsWith('http://') || rawFinalVideoUrl.startsWith('https://')) return rawFinalVideoUrl;
    if (rawFinalVideoUrl.startsWith('/api/')) return `${API_URL}${rawFinalVideoUrl}`;
    const normalized = rawFinalVideoUrl.replace(/\\/g, '/');
    if (normalized.includes('/data/renders/')) {
      const filename = normalized.split('/').pop();
      if (filename) return `${API_URL}/api/renders/${filename}`;
    }
    return rawFinalVideoUrl;
  })();

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

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Final Video Preview</h2>
        <p className="text-gray-600">Review your completed ad video</p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-8 mb-6">
        {/* Video Player */}
        <div className="mb-6">
          <div className="relative w-full bg-black rounded-lg overflow-hidden aspect-video flex items-center justify-center">
            {normalizedFinalVideoUrl ? (
              <video
                src={normalizedFinalVideoUrl}
                controls
                className="w-full h-full"
                poster="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 225'%3E%3Crect fill='%23222' width='400' height='225'/%3E%3C/svg%3E"
              />
            ) : (
              <div className="text-center">
                <div className="text-5xl mb-3">🎬</div>
                <p className="text-gray-400">Video ready for playback</p>
              </div>
            )}
          </div>
        </div>

        {/* Video Details */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pt-6 border-t border-gray-200">
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Duration</p>
            <p className="text-2xl font-bold text-gray-900">
              {project.duration_seconds || '0'}s
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Total Scenes</p>
            <p className="text-2xl font-bold text-gray-900">5</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Aspect Ratio</p>
            <p className="text-lg font-bold text-gray-900">9:16</p>
          </div>
          <div className="text-center">
            <p className="text-sm text-gray-600 mb-1">Format</p>
            <p className="text-lg font-bold text-gray-900">MP4</p>
          </div>
        </div>

        {/* Quality Score */}
        {showScore && score && (
          <div className="mb-6 pt-6 border-t border-gray-200">
            <div className="flex items-center gap-2 mb-4">
              <h4 className="text-lg font-semibold text-gray-900">Quality Analysis</h4>
              <button
                onClick={() => setShowScore(false)}
                className="text-xs text-gray-500 hover:text-gray-700"
              >
                Hide
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
              <div className={`rounded-lg border p-4 ${scoreBackground(score.visual_consistency)}`}>
                <p className="text-sm text-gray-700 mb-2">Visual Consistency</p>
                <p className={`text-2xl font-bold ${scoreColor(score.visual_consistency)}`}>
                  {score.visual_consistency}/10
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(score.audio_sync)}`}>
                <p className="text-sm text-gray-700 mb-2">Audio Sync</p>
                <p className={`text-2xl font-bold ${scoreColor(score.audio_sync)}`}>
                  {score.audio_sync}/10
                </p>
              </div>

              {score.lipsync_accuracy !== undefined && (
                <div className={`rounded-lg border p-4 ${scoreBackground(score.lipsync_accuracy)}`}>
                  <p className="text-sm text-gray-700 mb-2">Lipsync Accuracy</p>
                  <p className={`text-2xl font-bold ${scoreColor(score.lipsync_accuracy)}`}>
                    {score.lipsync_accuracy}/10
                  </p>
                </div>
              )}

              <div className={`rounded-lg border p-4 ${scoreBackground(score.production_quality)}`}>
                <p className="text-sm text-gray-700 mb-2">Production Quality</p>
                <p className={`text-2xl font-bold ${scoreColor(score.production_quality)}`}>
                  {score.production_quality}/10
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(score.platform_ready)}`}>
                <p className="text-sm text-gray-700 mb-2">Platform Ready</p>
                <p className={`text-2xl font-bold ${scoreColor(score.platform_ready)}`}>
                  {score.platform_ready}/10
                </p>
              </div>

              <div className={`rounded-lg border p-4 ${scoreBackground(score.overall)}`}>
                <p className="text-sm text-gray-700 mb-2">Overall Score</p>
                <p className={`text-2xl font-bold ${scoreColor(score.overall)}`}>
                  {score.overall}/10
                </p>
              </div>
            </div>

            {score.improvement_suggestions && score.improvement_suggestions.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-900 mb-2">Suggestions for improvement:</p>
                <ul className="text-sm text-blue-800 space-y-1">
                  {score.improvement_suggestions.map((suggestion, idx) => (
                    <li key={idx}>• {suggestion}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!showScore && score && (
          <div className="text-center mb-6 pt-6 border-t border-gray-200">
            <button
              onClick={() => setShowScore(true)}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              Show Quality Analysis
            </button>
          </div>
        )}

        {/* Revision Form */}
        {showFeedbackForm && (
          <div className="mb-6 pt-6 border-t border-gray-200 bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-semibold text-gray-900 mb-3">Request Revision</h4>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Describe what you'd like changed (e.g., 'Scene 3 needs a different background color')"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent mb-3"
              rows={4}
            />
            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Would send revision request to API
                  setShowFeedbackForm(false);
                  setFeedbackText('');
                }}
                className="flex-1 px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 font-medium"
              >
                Submit Revision Request
              </button>
              <button
                onClick={() => setShowFeedbackForm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {!showFeedbackForm && (
          <div className="mb-6 pt-6 border-t border-gray-200">
            <h4 className="font-semibold text-gray-900 mb-3">How does your ad look?</h4>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-sm text-gray-700 mb-3">
                Are you happy with this video? You can approve it to download, or request revisions to make changes.
              </p>
            </div>
          </div>
        )}

        {/* Credit Cost Summary */}
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
          <h4 className="font-semibold text-orange-900 mb-3">Credits Summary</h4>
          <div className="space-y-2 text-sm text-orange-800 mb-3">
            <div className="flex justify-between">
              <span>Base images (5 × 5 cr)</span>
              <span>25 credits</span>
            </div>
            <div className="flex justify-between">
              <span>Scene videos (5 × 15 cr)</span>
              <span>75 credits</span>
            </div>
            <div className="flex justify-between">
              <span>Lipsync (5 × 8 cr)</span>
              <span>40 credits</span>
            </div>
            <div className="flex justify-between">
              <span>TTS audio (1 × 4 cr)</span>
              <span>4 credits</span>
            </div>
            <div className="flex justify-between">
              <span>Video stitching</span>
              <span>2 credits</span>
            </div>
            <div className="flex justify-between">
              <span>Final scoring</span>
              <span>2 credits</span>
            </div>
            <div className="border-t border-orange-300 pt-2 flex justify-between font-bold">
              <span>Total Consumed</span>
              <span>{project.credits_consumed || 148} credits</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-6 border-t border-gray-200">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="flex-1 bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all text-lg"
          >
            {loading ? 'Processing...' : '✓ Approve & Download'}
          </button>
          <button
            onClick={handleRequestRevision}
            disabled={loading || showFeedbackForm}
            className="flex-1 bg-orange-600 text-white px-6 py-3 rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
          >
            {loading ? 'Processing...' : '🔄 Request Revision'}
          </button>
          {onStartNewProject && (
            <button
              onClick={onStartNewProject}
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all"
            >
              {loading ? 'Processing...' : '✨ Create Another Ad'}
            </button>
          )}
        </div>
        {normalizedFinalVideoUrl ? (
          <div className="mt-4">
            <a
              href={normalizedFinalVideoUrl}
              download
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100"
            >
              Download Video
            </a>
          </div>
        ) : null}
      </div>

      {/* Download Info */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <p className="text-sm text-green-900">
          <strong>✅ Ready to go:</strong> Once approved, your video will be available for download in MP4 format, ready to upload to your preferred platform.
        </p>
      </div>
    </div>
  );
}
