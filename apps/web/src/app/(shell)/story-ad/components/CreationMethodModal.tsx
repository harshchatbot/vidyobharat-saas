'use client';

import React from 'react';
import { Bot, Layers } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface CreationMethodModalProps {
  open: boolean;
  categoryName: string;
  requiresAvatar: 'required' | 'optional' | 'not_needed';
  onSelectAvatar: () => void;
  onSelectStoryboard: () => void;
  onClose: () => void;
}

export default function CreationMethodModal({
  open,
  categoryName,
  requiresAvatar,
  onSelectAvatar,
  onSelectStoryboard,
  onClose,
}: CreationMethodModalProps) {
  const showAvatarOption = requiresAvatar !== 'not_needed';
  const showStoryboardOption = requiresAvatar !== 'required';

  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="p-8">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">How to Create Your {categoryName} Ad?</h2>
          <p className="text-gray-600">Choose your preferred creation method</p>
        </div>

        <div className={`grid ${showAvatarOption && showStoryboardOption ? 'grid-cols-2' : 'grid-cols-1'} gap-6 mb-8`}>
          {/* Avatar Option */}
          {showAvatarOption && (
            <div className="group p-6 border-2 border-indigo-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center group-hover:bg-indigo-200 transition-colors">
                  <Bot className="w-6 h-6 text-indigo-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {requiresAvatar === 'required' ? 'With AI Avatar' : 'Option: AI Avatar'}
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {requiresAvatar === 'required'
                  ? 'This style works best with an AI Avatar as the talent'
                  : 'Create your ad with an AI Avatar presenting or demonstrating'}
              </p>
              <Button
                onClick={onSelectAvatar}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                Create with Avatar
              </Button>
            </div>
          )}

          {/* Storyboard Option */}
          {showStoryboardOption && (
            <div className="group p-6 border-2 border-purple-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center group-hover:bg-purple-200 transition-colors">
                  <Layers className="w-6 h-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {requiresAvatar === 'not_needed' ? 'As Storyboard' : 'Option: Storyboard'}
                </h3>
              </div>
              <p className="text-sm text-gray-600 mb-4">
                {requiresAvatar === 'not_needed'
                  ? 'This style works best as a visual storyboard with multiple scenes'
                  : 'Create your ad as a multi-scene visual storyboard'}
              </p>
              <Button
                onClick={onSelectStoryboard}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white"
              >
                Create as Storyboard
              </Button>
            </div>
          )}
        </div>

        <div className="text-center">
          <button
            onClick={onClose}
            className="text-gray-600 hover:text-gray-900 font-medium transition-colors"
          >
            Back to Categories
          </button>
        </div>
      </div>
    </Modal>
  );
}
