'use client';

import React, { useEffect, useState } from 'react';

interface BeautifulLoadingScreenProps {
  stage: 'script' | 'storyboard' | 'images' | 'voice' | 'video' | 'production';
  message?: string;
  subMessage?: string;
  isMockMode?: boolean;
}

const STAGE_CONFIG = {
  script: {
    emoji: '✍️',
    title: 'Generating Script',
    defaultMessage: 'Creating engaging copy for your ad...',
    color: 'from-purple-500 to-pink-500',
  },
  storyboard: {
    emoji: '🎬',
    title: 'Creating Storyboard',
    defaultMessage: 'Planning scenes and shot sequences...',
    color: 'from-blue-500 to-cyan-500',
  },
  images: {
    emoji: '🖼️',
    title: 'Generating Images',
    defaultMessage: 'Creating visual assets for each scene...',
    color: 'from-green-500 to-emerald-500',
  },
  voice: {
    emoji: '🎤',
    title: 'Processing Voice',
    defaultMessage: 'Synthesizing voiceover with emotion...',
    color: 'from-orange-500 to-red-500',
  },
  video: {
    emoji: '🎥',
    title: 'Rendering Video',
    defaultMessage: 'Stitching scenes into final output...',
    color: 'from-indigo-500 to-purple-500',
  },
  production: {
    emoji: '⚙️',
    title: 'Production in Progress',
    defaultMessage: 'Processing your ad content...',
    color: 'from-slate-500 to-gray-500',
  },
};

export default function BeautifulLoadingScreen({
  stage,
  message,
  subMessage,
  isMockMode = false,
}: BeautifulLoadingScreenProps) {
  const config = STAGE_CONFIG[stage];
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-md w-full mx-auto px-6">
        <div className="absolute inset-0 overflow-hidden">
          <div
            className={`absolute top-1/3 left-1/4 w-96 h-96 bg-gradient-to-r ${config.color} rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse`}
          />
          <div
            className={`absolute bottom-1/3 right-1/4 w-96 h-96 bg-gradient-to-r ${config.color} rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse animation-delay-2000`}
          />
        </div>

        <div className="relative space-y-6">
          <div className="flex justify-center">
            <div className="text-7xl animate-bounce">{config.emoji}</div>
          </div>

          <div className="text-center">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              {config.title}
            </h2>
            <p className="text-gray-600 text-lg">
              {message || config.defaultMessage}
              <span className="inline-block w-6">{dots}</span>
            </p>
          </div>

          <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full bg-gradient-to-r ${config.color} animate-pulse`}
              style={{ animation: 'progress 2s ease-in-out infinite' }}
            />
          </div>

          {subMessage && (
            <p className="text-center text-sm text-gray-500 italic">
              {subMessage}
            </p>
          )}

          {isMockMode ? (
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                💡 This is{' '}
                <span className="font-semibold text-green-600">MOCK MODE</span> - No
                credits are being consumed
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg p-4 border border-gray-200">
              <p className="text-xs text-gray-600 text-center">
                🚀 Real generation in progress. Credits may be consumed.
              </p>
            </div>
          )}

          <div className="flex justify-center gap-2 mt-6">
            <div className="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-bounce" />
            <div
              className="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-bounce"
              style={{ animationDelay: '0.1s' }}
            />
            <div
              className="w-3 h-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full animate-bounce"
              style={{ animationDelay: '0.2s' }}
            />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes progress {
          0%, 100% { width: 0%; }
          50% { width: 100%; }
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
      `}</style>
    </div>
  );
}