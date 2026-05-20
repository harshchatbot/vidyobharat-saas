'use client';

import React, { useEffect, useState } from 'react';

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
  const [dots, setDots] = useState('');

  useEffect(() => {
    const interval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[9999] overflow-hidden" style={{ background: 'hsl(var(--color-bg))' }}>
      <style>{`
        @keyframes orb-breathe {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.15); opacity: 1; }
        }

        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-12px); }
        }

        @keyframes progress-flow {
          0% { width: 0%; opacity: 1; }
          60% { width: 100%; opacity: 1; }
          100% { width: 100%; opacity: 0; }
        }
      `}</style>

      {/* Orb 1 - Primary violet (top left) */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          left: '-10%',
          width: '600px',
          height: '600px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(var(--color-primary) / 0.35) 0%, transparent 70%)',
          animation: 'orb-breathe 4s ease-in-out infinite',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* Orb 2 - Pink (bottom right) */}
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          right: '-10%',
          width: '700px',
          height: '700px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(var(--color-accent-pink) / 0.25) 0%, transparent 70%)',
          animation: 'orb-breathe 5s ease-in-out infinite reverse',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />

      {/* Orb 3 - Cyan (center left) */}
      <div
        style={{
          position: 'absolute',
          top: '40%',
          left: '-5%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(var(--color-accent-cyan) / 0.2) 0%, transparent 70%)',
          animation: 'orb-breathe 6s ease-in-out infinite 1s',
          filter: 'blur(50px)',
          pointerEvents: 'none',
        }}
      />

      {/* Orb 4 - Amber (top right) */}
      <div
        style={{
          position: 'absolute',
          top: '10%',
          right: '10%',
          width: '300px',
          height: '300px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, hsl(var(--color-accent-amber) / 0.2) 0%, transparent 70%)',
          animation: 'orb-breathe 3.5s ease-in-out infinite 0.5s',
          filter: 'blur(40px)',
          pointerEvents: 'none',
        }}
      />

      {/* Center content */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          textAlign: 'center',
          zIndex: 10,
        }}
      >
        {/* Logo mark */}
        <div
          style={{
            width: '72px',
            height: '72px',
            borderRadius: '50%',
            background: 'var(--gradient-brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
            fontSize: '32px',
            fontWeight: '800',
            color: 'white',
            fontFamily: '"Inter", "system-ui", sans-serif',
            animation: 'logo-float 3s ease-in-out infinite',
            boxShadow: '0 0 60px hsl(var(--color-primary) / 0.5)',
          }}
        >
          R
        </div>

        {/* Brand name */}
        <p
          style={{
            fontSize: '13px',
            fontWeight: '600',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'hsl(var(--color-text-secondary))',
            marginBottom: '32px',
            margin: '0 auto 32px',
          }}
        >
          RangManchAI
        </p>

        {/* Status message */}
        <p
          style={{
            fontSize: '15px',
            color: 'hsl(var(--color-text-secondary))',
            marginBottom: '16px',
            minHeight: '24px',
          }}
        >
          {message || 'Preparing your workspace...'}
          <span>{dots}</span>
        </p>

        {/* Thin progress bar */}
        <div
          style={{
            width: '200px',
            height: '3px',
            background: 'hsl(var(--glass-border))',
            borderRadius: '999px',
            overflow: 'hidden',
            margin: '0 auto',
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--gradient-brand)',
              borderRadius: '999px',
              animation: 'progress-flow 2s ease-in-out infinite',
            }}
          />
        </div>

        {/* Stage label */}
        {stage && (
          <p
            style={{
              fontSize: '11px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: 'hsl(var(--color-muted))',
              marginTop: '12px',
            }}
          >
            {stage}
          </p>
        )}

        {/* Mock mode badge */}
        {isMockMode && (
          <div
            style={{
              marginTop: '16px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '999px',
              background: 'hsl(var(--color-success) / 0.15)',
              border: '1px solid hsl(var(--color-success) / 0.3)',
              color: 'hsl(var(--color-success))',
              fontSize: '11px',
              fontWeight: '600',
            }}
          >
            ⚡ Mock Mode
          </div>
        )}
      </div>
    </div>
  );
}
