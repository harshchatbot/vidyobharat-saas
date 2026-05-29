'use client';

/**
 * TOW Stage 12 — Quality Control
 *
 * 11-point checklist covering:
 *   1.  Script Clarity
 *   2.  Conversion Strength
 *   3.  Visual Continuity
 *   4.  Realism Quality
 *   5.  Face Consistency
 *   6.  Product Lock (product visible correctly in every scene)
 *   7.  Lighting Consistency
 *   8.  Voice Quality
 *   9.  Platform Fit
 *   10. Editing Readiness
 *   11. Lipsync Quality (if applicable)
 *
 * Numeric scores: 0–10 per dimension.
 * Semantic pass/fail for each checklist item.
 */

import React, { useEffect, useRef, useState } from 'react';
import { QCChecklistItem, QCReport, StoryboardProject } from '../hooks/useStoryboardProject';
import { isTestModeEnabled } from '../utils/testModeHelper';
import { generateMockQCReport, simulateDelay } from '../services/mockDataService';

interface QCCheckpointProps {
  project: StoryboardProject;
  onApprove: () => Promise<void> | void;
  onBack?: () => void;
}

type MetricKey = 'visual_consistency' | 'audio_sync' | 'lipsync_accuracy' | 'brand_alignment' | 'platform_readiness';

const METRIC_DEFS: { key: MetricKey; label: string; icon: string }[] = [
  { key: 'visual_consistency', label: 'Visual Consistency', icon: '🎨' },
  { key: 'audio_sync', label: 'Audio Sync', icon: '🎵' },
  { key: 'lipsync_accuracy', label: 'Lipsync Accuracy', icon: '🎤' },
  { key: 'brand_alignment', label: 'Brand Alignment', icon: '🏷️' },
  { key: 'platform_readiness', label: 'Platform Readiness', icon: '📱' },
];

export default function QCCheckpoint({ project, onApprove, onBack }: QCCheckpointProps) {
  const isMockMode = isTestModeEnabled();
  const [report, setReport] = useState<QCReport | null>(project.qc_report ?? null);
  const [isRunning, setIsRunning] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const runRef = useRef(false);

  useEffect(() => {
    if (report || runRef.current) return;
    runRef.current = true;
    setIsRunning(true);

    const run = async () => {
      try {
        if (isMockMode) {
          await simulateDelay(2500);
          setReport(generateMockQCReport());
        }
      } catch {
        setLocalError('QC analysis failed. Please try again.');
      } finally {
        setIsRunning(false);
      }
    };

    run();
  }, [isMockMode, report]);

  const handleApprove = async () => {
    setIsApproving(true);
    try { await onApprove(); }
    finally { setIsApproving(false); }
  };

  const handleRerun = () => {
    runRef.current = false;
    setReport(null);
    setLocalError(null);
  };

  if (isRunning) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 text-center">
        <div className="inline-block animate-spin rounded-full h-14 w-14 border-b-4 border-teal-600 mb-6" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">🔍 Running Quality Control</h2>
        <p className="text-gray-500">Running 11-point checklist across all scenes…</p>
        <div className="mt-6 space-y-2 max-w-xs mx-auto text-left">
          {[
            'Script Clarity', 'Conversion Strength', 'Visual Continuity',
            'Realism Quality', 'Face Consistency', 'Product Lock',
            'Lighting Consistency', 'Voice Quality', 'Platform Fit',
            'Editing Readiness', 'Lipsync Quality',
          ].map((check) => (
            <div key={check} className="flex items-center gap-3 bg-teal-50 rounded-lg px-4 py-2">
              <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-teal-600" />
              <span className="text-sm text-teal-800">{check}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8 text-center">
        <p className="text-red-600 font-medium">{localError ?? 'QC analysis unavailable.'}</p>
        <button onClick={handleRerun} className="mt-4 px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 font-medium">
          ↺ Re-run QC
        </button>
      </div>
    );
  }

  const passCount = report.checklist.filter((c) => c.passed).length;
  const failCount = report.checklist.filter((c) => !c.passed).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-8">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-widest text-teal-600 bg-teal-50 px-3 py-1 rounded-full">
              TOW · Stage 12 of 13
            </span>
            <h2 className="text-2xl font-bold text-gray-900 mt-3">🔍 Quality Control Report</h2>
            <p className="text-gray-500 mt-1">
              11-point checklist: script clarity, conversion strength, face consistency, product lock,
              voice quality, platform fit, and more. Approve to proceed to Final Packaging.
            </p>
          </div>
          <button onClick={handleRerun} className="text-sm text-gray-500 hover:text-teal-600 border border-gray-200 px-3 py-2 rounded-lg hover:border-teal-300 transition-colors">
            ↺ Re-run QC
          </button>
        </div>

        {/* Overall Score Banner */}
        <div className={`mt-6 rounded-xl p-6 flex items-center gap-6 ${
          report.passed ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'
        }`}>
          <div className="text-center flex-shrink-0">
            <div className={`text-5xl font-black ${report.passed ? 'text-green-600' : 'text-amber-600'}`}>
              {report.overall.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500 mt-1">Overall / 10</div>
          </div>
          <div className="flex-1">
            <p className={`font-semibold text-lg ${report.passed ? 'text-green-800' : 'text-amber-800'}`}>
              {report.passed
                ? '✅ QC Passed — Ready for Final Packaging'
                : '⚠️ Issues Detected — Review before proceeding'}
            </p>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-green-700 font-medium">{passCount} checks passed</span>
              {failCount > 0 && <span className="text-red-700 font-medium">{failCount} checks failed</span>}
            </div>
          </div>
        </div>
      </div>

      {/* 11-Point Checklist */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <p className="font-semibold text-gray-700 text-sm">📋 QC Checklist</p>
        </div>
        <div className="divide-y divide-gray-100">
          {report.checklist.map((item, i) => (
            <div key={i} className={`flex items-start gap-4 px-6 py-4 ${!item.passed ? 'bg-red-50' : ''}`}>
              <span className={`text-lg mt-0.5 ${item.passed ? 'text-green-500' : 'text-red-500'}`}>
                {item.passed ? '✅' : '❌'}
              </span>
              <div className="flex-1">
                <p className={`text-sm font-medium ${item.passed ? 'text-gray-800' : 'text-red-800'}`}>
                  {item.label}
                </p>
                {item.note && (
                  <p className={`text-xs mt-0.5 ${item.passed ? 'text-gray-500' : 'text-red-600'}`}>
                    {item.note}
                  </p>
                )}
              </div>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                item.passed ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {item.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Numeric Score Breakdown */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <p className="font-semibold text-gray-700 mb-5 text-sm uppercase tracking-wider">📊 Score Breakdown</p>
        <div className="space-y-4">
          {METRIC_DEFS.map(({ key, label, icon }) => {
            const score = report[key];
            const color = score >= 8 ? 'bg-green-500' : score >= 6 ? 'bg-amber-500' : 'bg-red-500';
            const textColor = score >= 8 ? 'text-green-600' : score >= 6 ? 'text-amber-600' : 'text-red-600';
            return (
              <div key={key} className="flex items-center gap-4">
                <span className="text-xl w-7">{icon}</span>
                <div className="flex-1">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700">{label}</span>
                    <span className={`text-sm font-bold ${textColor}`}>{score.toFixed(1)} / 10</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2">
                    <div className={`${color} h-2 rounded-full transition-all`} style={{ width: `${score * 10}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Issues */}
      {report.issues.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <p className="text-sm font-semibold text-amber-800 mb-2">⚠️ Issues Found</p>
          <ul className="space-y-1">
            {report.issues.map((issue, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-0.5">•</span> {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Bar */}
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-6 flex items-center justify-between gap-4">
        {onBack && (
          <button onClick={onBack} className="px-5 py-2.5 text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 font-medium transition-colors">
            ← Back to Production
          </button>
        )}
        <div className="flex-1" />
        {!report.passed && (
          <p className="text-xs text-amber-600 font-medium hidden md:block">
            ⚠️ {failCount} issue(s) found — you can still proceed or go back to fix.
          </p>
        )}
        <button
          onClick={handleApprove}
          disabled={isApproving}
          className="px-8 py-3 bg-teal-600 text-white rounded-xl hover:bg-teal-700 font-semibold text-base transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {isApproving ? (
            <><span className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white" /> Approving…</>
          ) : report.passed ? (
            '✅ Approve — Proceed to Final Packaging'
          ) : (
            '⚠️ Approve Anyway & Package'
          )}
        </button>
      </div>
    </div>
  );
}
