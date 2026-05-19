'use client';

import React from 'react';
import { X, Bot, Layers } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';

interface AdCreationModeModalProps {
  open: boolean;
  onClose: () => void;
  onSelectAvatarMode: () => void;
  onSelectStoryboardMode: () => void;
  loading?: boolean;
}

export default function AdCreationModeModal({
  open,
  onClose,
  onSelectAvatarMode,
  onSelectStoryboardMode,
  loading = false,
}: AdCreationModeModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="p-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Choose Your Creation Method</h2>
          <p className="text-gray-600">Select how you'd like to create your ad</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Avatar Mode */}
          <div
            className="group p-6 border-2 border-gray-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                <Bot className="w-6 h-6 text-indigo-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">AI Avatar</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Create ads with AI-powered avatars. Perfect for consistent branding and professional appearance.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 font-bold mt-0.5">✓</span>
                <span>Multiple AI avatars to choose from</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 font-bold mt-0.5">✓</span>
                <span>Customizable voice & language</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-indigo-600 font-bold mt-0.5">✓</span>
                <span>Quick and easy setup</span>
              </li>
            </ul>
            <Button
              onClick={onSelectAvatarMode}
              disabled={loading}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              Create with Avatar
            </Button>
          </div>

          {/* Storyboard Mode */}
          <div
            className="group p-6 border-2 border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                <Layers className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Storyboard</h3>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              Create multi-scene ads with full creative control. Best for storytelling and visual impact.
            </p>
            <ul className="space-y-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-0.5">✓</span>
                <span>7 creative ad styles</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-0.5">✓</span>
                <span>Multiple scenes & visual guidance</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-600 font-bold mt-0.5">✓</span>
                <span>Approval checkpoints at each stage</span>
              </li>
            </ul>
            <Button
              onClick={onSelectStoryboardMode}
              disabled={loading}
              className="w-full mt-4 bg-purple-600 hover:bg-purple-700 text-white"
            >
              Create with Storyboard
            </Button>
          </div>
        </div>

        <div className="flex justify-center">
          <button
            onClick={onClose}
            disabled={loading}
            className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}
