'use client';

import React, { useState, useEffect } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';

interface ProjectSelectorProps {
  onSelectExisting: (project: StoryboardProject) => void;
  onCreateNew: () => void;
  existingProjects: StoryboardProject[];
  loading: boolean;
}

export default function ProjectSelector({
  onSelectExisting,
  onCreateNew,
  existingProjects,
  loading,
}: ProjectSelectorProps) {
  const [view, setView] = useState<'choice' | 'existing' | 'new'>('choice');

  const getStatusBadge = (state: string) => {
    const normalized = (state || '').toLowerCase();
    if (normalized.includes('script_awaiting')) {
      return { label: 'Script Pending', color: 'bg-yellow-100 text-yellow-800' };
    }
    if (normalized.includes('storyboard_awaiting')) {
      return { label: 'Storyboard Pending', color: 'bg-blue-100 text-blue-800' };
    }
    if (normalized.includes('images_awaiting')) {
      return { label: 'Images Pending', color: 'bg-purple-100 text-purple-800' };
    }
    if (normalized.includes('production')) {
      return { label: 'In Production', color: 'bg-orange-100 text-orange-800' };
    }
    if (normalized.includes('completed')) {
      return { label: 'Completed', color: 'bg-green-100 text-green-800' };
    }
    return { label: 'Draft', color: 'bg-gray-100 text-gray-800' };
  };

  const getCheckpointInfo = (state: string) => {
    const normalized = (state || '').toLowerCase();
    if (normalized.includes('script_awaiting')) return 'Script review pending';
    if (normalized.includes('storyboard_awaiting')) return 'Storyboard review pending';
    if (normalized.includes('images_awaiting')) return 'Image generation pending';
    if (normalized.includes('production')) return 'Video being produced';
    if (normalized.includes('completed')) return 'Ready to download';
    return 'Waiting for next step';
  };

  if (view === 'choice') {
    return (
      <div className="fixed inset-0 z-[160] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full">
          <div className="space-y-6 p-8">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Project Management</h2>
              <p className="text-gray-600 mt-2">Create a new project or continue an existing one</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Create New */}
              <button
                onClick={() => setView('new')}
                className="p-6 border-2 border-green-600 rounded-lg hover:bg-green-50 transition text-left"
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl">✨</div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Create New Project</h3>
                    <p className="text-sm text-gray-600 mt-1">Start fresh with new project details</p>
                    <div className="mt-3 space-y-1 text-xs text-green-600">
                      <p>✓ Fresh start</p>
                      <p>✓ New project ID generated</p>
                      <p>✓ Full workflow from beginning</p>
                    </div>
                  </div>
                </div>
              </button>

              {/* Continue Existing */}
              <button
                onClick={() => setView('existing')}
                disabled={existingProjects.length === 0}
                className="p-6 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl">📂</div>
                  <div>
                    <h3 className="font-semibold text-gray-900">Continue Existing</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      {existingProjects.length === 0
                        ? 'No projects yet'
                        : `${existingProjects.length} project(s) available`}
                    </p>
                    <div className="mt-3 space-y-1 text-xs text-blue-600">
                      <p>✓ Resume from checkpoint</p>
                      <p>✓ Pick up where you left off</p>
                      <p>✓ Database-synced projects</p>
                    </div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'new') {
    return (
      <div className="fixed inset-0 z-[160] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full">
          <div className="space-y-6 p-8">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('choice')}
                className="text-gray-500 hover:text-gray-700 text-xl"
              >
                ← Back
              </button>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Create New Project</h2>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                📝 A new project will be created in our database. You'll get a unique project ID that you can use to resume this project later from any device.
              </p>
            </div>

            <button
              onClick={onCreateNew}
              className="w-full bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-medium transition"
            >
              ✨ Create New Project
            </button>
          </div>
        </div>
      </div>
    );
  }

  // View: existing projects
  return (
    <div className="fixed inset-0 z-[160] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-auto">
        <div className="space-y-6 p-8">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView('choice')}
              className="text-gray-500 hover:text-gray-700 text-xl"
            >
              ← Back
            </button>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Your Projects</h2>
              <p className="text-gray-600 text-sm mt-1">{existingProjects.length} project(s) found</p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : existingProjects.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No projects yet. Create one to get started!</p>
              <button
                onClick={() => setView('new')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Create New Project
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {existingProjects.map((project) => {
                const badge = getStatusBadge(project.workflow_state);
                return (
                  <button
                    key={project.id}
                    onClick={() => onSelectExisting(project)}
                    className="w-full p-4 border border-gray-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition text-left"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-gray-900">{project.ad_category || 'Untitled'}</h3>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${badge.color}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{project.business_brief || 'No brief'}</p>
                        <p className="text-xs text-gray-500 mt-2">
                          📱 {project.platform || 'N/A'} • 🌍 {project.language || 'N/A'} •
                          {getCheckpointInfo(project.workflow_state)}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">ID: {project.id.substring(0, 8)}...</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">
                          {new Date(project.updated_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
