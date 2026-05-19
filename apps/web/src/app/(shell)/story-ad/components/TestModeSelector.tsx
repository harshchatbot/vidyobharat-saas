'use client';

import React from 'react';

interface TestModeSelectorProps {
  open: boolean;
  onSelectMode: (mode: 'real' | 'mock') => void;
}

export default function TestModeSelector({ open, onSelectMode }: TestModeSelectorProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[160] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-auto">
        <div className="space-y-6 p-8">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Choose Testing Mode</h2>
            <p className="text-gray-600 mt-2">
              Select how you want to test the workflow
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Real Test */}
            <button
              onClick={() => onSelectMode('real')}
              className="p-6 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition text-left"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">🚀</div>
                <div>
                  <h3 className="font-semibold text-gray-900">Real Test</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Uses actual AI APIs and consumes your credits
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-red-600">
                    <p>⚠️ Credits will be deducted</p>
                    <p>⚠️ Real AI generation</p>
                    <p>⚠️ Takes longer to complete</p>
                  </div>
                </div>
              </div>
            </button>

            {/* Mock Test */}
            <button
              onClick={() => onSelectMode('mock')}
              className="p-6 border-2 border-green-600 rounded-lg hover:bg-green-50 transition text-left"
            >
              <div className="flex items-start gap-3">
                <div className="text-3xl">✨</div>
                <div>
                  <h3 className="font-semibold text-gray-900">Mock Test</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Uses simulated data, no credits consumed
                  </p>
                  <div className="mt-3 space-y-1 text-xs text-green-600">
                    <p>✓ Zero credits used</p>
                    <p>✓ Sample images & data</p>
                    <p>✓ Fast with realistic delays</p>
                    <p>✓ Perfect for testing UI flow</p>
                  </div>
                </div>
              </div>
            </button>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900">
              <strong>💡 Tip:</strong> Use Mock Mode to test the complete workflow without spending credits. Use Real Mode when you're ready to generate actual content.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
