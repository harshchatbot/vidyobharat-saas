'use client';

import React from 'react';
import SolarLoader from './SolarLoader';

interface BeautifulLoadingScreenProps {
  stage: 'script' | 'storyboard' | 'images' | 'voice' | 'video' | 'production';
  message?: string;
  subMessage?: string;
  isMockMode?: boolean;
}

export default function BeautifulLoadingScreen({
  stage,
  message,
  subMessage,
  isMockMode = false,
}: BeautifulLoadingScreenProps) {
  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden" style={{ background: '#08080F' }}>
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .solar-container {
          animation: fade-in 0.6s ease-out;
        }
      `}</style>

      {/* Solar system */}
      <div
        className="solar-container flex flex-col items-center justify-center min-h-screen"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
        }}
      >
        <div style={{ marginBottom: '32px' }}>
          <SolarLoader size={35} speed={1} />
        </div>

        {/* Brand */}
        <p
          style={{
            fontSize: '11px',
            fontWeight: '600',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.4)',
            marginBottom: '16px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          RangManchAI
        </p>

        {/* Stage */}
        {stage && (
          <p
            style={{
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.25)',
              marginBottom: '8px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {stage.replace(/_/g, ' ')}
          </p>
        )}

        {/* Message */}
        <p
          style={{
            fontSize: '15px',
            fontWeight: '600',
            color: 'rgba(255,255,255,0.85)',
            marginBottom: '8px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
          }}
        >
          {message || 'Generating your ad...'}
        </p>

        {/* Sub message */}
        {subMessage && (
          <p
            style={{
              fontSize: '13px',
              color: 'rgba(255,255,255,0.4)',
              maxWidth: '300px',
              textAlign: 'center',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            {subMessage}
          </p>
        )}

        {/* Mock badge */}
        {isMockMode && (
          <div
            style={{
              marginTop: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'hsl(142 71% 45% / 0.15)',
              border: '1px solid hsl(142 71% 45% / 0.3)',
              color: 'hsl(142 71% 45%)',
              fontSize: '11px',
              fontWeight: '600',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            ⚡ Mock Mode
          </div>
        )}
      </div>
    </div>
  );
}
