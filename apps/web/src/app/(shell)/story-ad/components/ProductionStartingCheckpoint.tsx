'use client';

import React from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';

interface ProductionStartingCheckpointProps {
  project: StoryboardProject;
  onRefresh: () => Promise<void> | void;
  onBackToVoice: () => Promise<void> | void;
  onTryAgain?: () => Promise<void> | void;
  staleWarning?: boolean;
  productionError?: string | null;
}

export default function ProductionStartingCheckpoint({
  project,
  onRefresh,
  onBackToVoice,
  onTryAgain,
  staleWarning = false,
  productionError,
}: ProductionStartingCheckpointProps) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
        <h2 className="text-2xl font-bold text-gray-900">Production Starting</h2>
        <p className="text-gray-600 mt-2">
          Preparing your approved storyboard scenes for video generation
        </p>
        <div className="mt-6 flex items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <p className="text-sm text-gray-700 font-medium">Queuing scene production jobs…</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Preflight Checklist</h3>
        <ul className="mt-3 space-y-2 text-sm text-gray-700">
          <li>✅ Approved frames loaded</li>
          <li>✅ Motion plan loaded</li>
          <li>✅ Voice selected</li>
          <li>⏳ Scene jobs being queued</li>
        </ul>
        <p className="mt-4 text-xs text-gray-500">Current project status: {project.workflow_state}</p>
      </div>

      {staleWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Production is taking longer than expected to start. You can refresh status or retry queueing.
        </div>
      ) : null}

      {productionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {productionError}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium text-sm"
        >
          Refresh Status
        </button>
        <button
          type="button"
          onClick={() => void onBackToVoice()}
          className="px-4 py-2 rounded-lg border border-indigo-300 text-indigo-700 hover:bg-indigo-50 font-medium text-sm"
        >
          Back to Voice Selection
        </button>
        {staleWarning && onTryAgain ? (
          <button
            type="button"
            onClick={() => void onTryAgain()}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 font-medium text-sm"
          >
            Try Again
          </button>
        ) : null}
      </div>
    </div>
  );
}

