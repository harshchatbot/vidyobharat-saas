'use client';

/**
 * TOW Stage 13 — Final Packaging
 *
 * Organises final outputs into a structured delivery:
 *   Final Deliverables     — list of all files produced
 *   Folder Structure       — organised by type/stage
 *   File Naming Convention — consistent naming for client delivery
 *   Reusable Assets        — brand elements that can be repurposed
 *   Missing Items          — anything incomplete or needing follow-up
 *
 * This is the final user-facing stage before the project is marked complete.
 */

import React, { useState } from 'react';
import { StoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';

interface FinalPackagingCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onStartNewProject: () => void;
}

interface Deliverable {
  name: string;
  type: 'video' | 'audio' | 'image' | 'script' | 'brief';
  status: 'ready' | 'pending' | 'missing';
  size?: string;
}

interface FolderEntry {
  path: string;
  contents: string[];
}

const EXPORT_FORMATS = [
  { value: 'mp4_1080', label: 'MP4 — 1080p HD', icon: '🎬', recommended: true },
  { value: 'mp4_4k', label: 'MP4 — 4K Ultra', icon: '✨', recommended: false },
  { value: 'webm', label: 'WebM (Web-optimised)', icon: '🌐', recommended: false },
];

export default function FinalPackagingCheckpoint({
  project,
  onApprove,
  onStartNewProject,
}: FinalPackagingCheckpointProps) {
  const isMockMode = isTestModeEnabled();
  const [selectedFormat, setSelectedFormat] = useState('mp4_1080');
  const [isApproving, setIsApproving] = useState(false);

  // Build deliverables from project state
  const deliverables: Deliverable[] = [
    {
      name: 'final_ad.mp4',
      type: 'video',
      status: project.final_video_url ? 'ready' : isMockMode ? 'ready' : 'pending',
      size: '18.4 MB',
    },
    {
      name: 'scene_01.mp4',
      type: 'video',
      status: 'ready',
      size: '5.2 MB',
    },
    {
      name: 'scene_02.mp4',
      type: 'video',
      status: 'ready',
      size: '6.1 MB',
    },
    {
      name: 'scene_03.mp4',
      type: 'video',
      status: 'ready',
      size: '7.1 MB',
    },
    {
      name: 'voiceover_full.mp3',
      type: 'audio',
      status: project.selected_voice ? 'ready' : 'pending',
      size: '2.3 MB',
    },
    {
      name: 'scene_01_base.png',
      type: 'image',
      status: 'ready',
      size: '1.4 MB',
    },
    {
      name: 'scene_02_base.png',
      type: 'image',
      status: 'ready',
      size: '1.6 MB',
    },
    {
      name: 'scene_03_base.png',
      type: 'image',
      status: 'ready',
      size: '1.5 MB',
    },
    {
      name: 'character_headshot.png',
      type: 'image',
      status: project.character_lock ? 'ready' : 'missing',
      size: '0.8 MB',
    },
    {
      name: 'approved_script.txt',
      type: 'script',
      status: project.display_script ? 'ready' : 'missing',
      size: '2 KB',
    },
    {
      name: 'project_state_pack.json',
      type: 'brief',
      status: project.project_state_pack ? 'ready' : 'missing',
      size: '4 KB',
    },
  ];

  const folderStructure: FolderEntry[] = [
    {
      path: `📁 ${project.ad_category}_ad/`,
      contents: [
        '📁 01_brief/',
        '📁 02_strategy/',
        '📁 03_script/',
        '📁 04_character/',
        '📁 05_scenes/',
        '📁 06_base_images/',
        '📁 07_scene_videos/',
        '📁 08_audio/',
        '📁 09_final_output/',
        '📄 project_state_pack.json',
      ],
    },
    {
      path: '📁 09_final_output/',
      contents: [
        '🎬 final_ad_1080p.mp4',
        '🎬 final_ad_4k.mp4  (if requested)',
        '🖼️ thumbnail_01.png',
        '🖼️ thumbnail_02.png',
        '📝 qc_report.json',
      ],
    },
  ];

  const reusableAssets = [
    { label: 'Character Face-Lock Block', desc: 'Reuse in any future ad featuring this character' },
    { label: 'Headshot Reference Image', desc: 'Use as reference for consistent character in future scenes' },
    { label: 'Project State Pack (JSON)', desc: 'Feeds future ad iterations with full brand context' },
    { label: 'Approved Script', desc: 'Can be repurposed for static ads, email, or captions' },
    { label: 'Base Images (per scene)', desc: 'Can be A/B tested with different motion prompts' },
    { label: 'Voiceover Audio', desc: 'Can be used independently in other formats' },
  ];

  const missingItems = deliverables
    .filter((d) => d.status === 'missing')
    .map((d) => d.name);

  const readyCount = deliverables.filter((d) => d.status === 'ready').length;
  const totalCount = deliverables.length;

  const handleApprove = async () => {
    setIsApproving(true);
    try { await onApprove(); }
    finally { setIsApproving(false); }
  };

  const typeIcon: Record<string, string> = {
    video: '🎬',
    audio: '🎤',
    image: '🖼️',
    script: '📝',
    brief: '📋',
  };

  const statusColor: Record<string, string> = {
    ready: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    missing: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl shadow-lg p-8 text-white">
        <span className="text-xs font-semibold uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full">
          TOW · Stage 13 of 13 — Final
        </span>
        <h2 className="text-2xl font-bold mt-3">📦 Final Packaging</h2>
        <p className="text-indigo-100 mt-1">
          All deliverables organised for handoff. Review the folder structure, file naming
          convention and reusable assets before marking the project complete.
        </p>
        <div className="mt-5 grid grid-cols-4 gap-3">
          {[
            { label: 'Deliverables', value: `${readyCount}/${totalCount}` },
            { label: 'Stages Complete', value: '13/13' },
            { label: 'QC Score', value: `${(project.qc_report?.overall ?? 8.5).toFixed(1)}/10` },
            { label: 'Missing', value: `${missingItems.length}` },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/10 rounded-xl p-3 text-center">
              <p className="text-xl font-bold">{value}</p>
              <p className="text-xs text-indigo-200 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Final Video Preview */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="font-semibold text-gray-800 mb-4">▶️ Final Ad Preview</p>
        {project.final_video_url || isMockMode ? (
          <div className="rounded-xl overflow-hidden bg-black aspect-video max-w-2xl mx-auto">
            {project.final_video_url ? (
              <video
                src={project.final_video_url}
                controls
                className="w-full h-full object-contain"
                poster={project.thumbnail_url}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <div className="text-5xl mb-2">🎬</div>
                  <p className="text-sm">Mock Mode — video preview placeholder</p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-gray-100 aspect-video max-w-2xl mx-auto flex items-center justify-center">
            <div className="text-center text-gray-400">
              <div className="text-5xl mb-3">🎬</div>
              <p className="font-medium">Final video rendering…</p>
            </div>
          </div>
        )}
      </div>

      {/* Export Format */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="font-semibold text-gray-800 mb-4">📦 Export Format</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {EXPORT_FORMATS.map((fmt) => (
            <button
              key={fmt.value}
              onClick={() => setSelectedFormat(fmt.value)}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                selectedFormat === fmt.value
                  ? 'border-indigo-500 bg-indigo-50 shadow-sm'
                  : 'border-gray-200 hover:border-indigo-200'
              }`}
            >
              <div className="text-2xl mb-1">{fmt.icon}</div>
              <p className="font-semibold text-sm text-gray-900">{fmt.label}</p>
              {fmt.recommended && (
                <span className="inline-block mt-1 text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                  Recommended
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Deliverables List */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <p className="font-semibold text-gray-700 text-sm">📋 Final Deliverables</p>
        </div>
        <div className="divide-y divide-gray-100">
          {deliverables.map((d, i) => (
            <div key={i} className="flex items-center gap-3 px-6 py-3">
              <span className="text-lg">{typeIcon[d.type]}</span>
              <span className="text-sm font-mono text-gray-700 flex-1">{d.name}</span>
              {d.size && <span className="text-xs text-gray-400">{d.size}</span>}
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[d.status]}`}>
                {d.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Folder Structure */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="font-semibold text-gray-800 mb-4">📁 Folder Structure</p>
        <p className="text-xs text-gray-400 mb-3">
          File naming convention: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'[category]_[stage]_[scene]_[version].ext'}</code>
        </p>
        <div className="space-y-4">
          {folderStructure.map((folder, i) => (
            <div key={i}>
              <p className="text-sm font-semibold text-gray-700">{folder.path}</p>
              <div className="ml-4 mt-1 space-y-0.5">
                {folder.contents.map((item, j) => (
                  <p key={j} className="text-sm text-gray-500 font-mono">{'  '}{item}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reusable Assets */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="font-semibold text-gray-800 mb-4">♻️ Reusable Assets</p>
        <p className="text-xs text-gray-400 mb-3">
          These assets can be carried forward into future ad iterations without regeneration.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {reusableAssets.map((asset, i) => (
            <div key={i} className="flex items-start gap-3 p-3 bg-green-50 border border-green-100 rounded-lg">
              <span className="text-green-500 mt-0.5 font-bold">✓</span>
              <div>
                <p className="text-sm font-medium text-gray-800">{asset.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{asset.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Missing Items */}
      {missingItems.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-red-800 mb-2">🚫 Missing Items</p>
          <ul className="space-y-1">
            {missingItems.map((item, i) => (
              <li key={i} className="text-sm text-red-700 flex items-start gap-2">
                <span className="mt-0.5">•</span> {item}
              </li>
            ))}
          </ul>
          <p className="text-xs text-red-500 mt-2">
            These can be generated separately or skipped for this delivery.
          </p>
        </div>
      )}

      {/* Action Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center gap-4">
        <button
          onClick={onStartNewProject}
          className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors"
        >
          ✨ Create Another Ad
        </button>
        <div className="flex-1" />
        <p className="text-sm text-gray-500 hidden md:block">
          {readyCount}/{totalCount} deliverables ready · {missingItems.length === 0 ? 'No missing items' : `${missingItems.length} missing`}
        </p>
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 font-semibold text-base transition-all disabled:opacity-50 flex items-center gap-2 shadow-lg"
        >
          {isApproving ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Completing…</>
          ) : (
            '🚀 Complete & Deliver'
          )}
        </button>
      </div>
    </div>
  );
}
