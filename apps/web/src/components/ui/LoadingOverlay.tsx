'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export function LoadingOverlay({
  open,
  title,
  description,
  stepLabel,
  accentLabel,
  progress,
}: {
  open: boolean;
  title: string;
  description?: string;
  stepLabel?: string;
  accentLabel?: string;
  progress?: number;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!open) return null;

  const overlay = (
    <>
      <style>{`
        @keyframes orb-breathe {
          0%, 100% { transform: scale(1); opacity: 0.7; }
          50% { transform: scale(1.2); opacity: 1; }
        }
        @keyframes logo-float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-14px); }
        }
        @keyframes progress-flow {
          0% { width: 5%; opacity: 1; }
          70% { width: 90%; opacity: 1; }
          100% { width: 90%; opacity: 0.6; }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          overflow: 'hidden',
          background: '#08080F',
          animation: 'fade-in 0.3s ease-out',
        }}
      >
        {/* Orb 1 — violet top left */}
        <div
          style={{
            position: 'absolute',
            top: '-15%',
            left: '-10%',
            width: '650px',
            height: '650px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(267 72% 54% / 0.4) 0%, transparent 70%)',
            filter: 'blur(50px)',
            animation: 'orb-breathe 4s ease-in-out infinite',
            pointerEvents: 'none',
          }}
        />
        {/* Orb 2 — pink bottom right */}
        <div
          style={{
            position: 'absolute',
            bottom: '-15%',
            right: '-10%',
            width: '750px',
            height: '750px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(349 89% 60% / 0.3) 0%, transparent 70%)',
            filter: 'blur(60px)',
            animation: 'orb-breathe 5s ease-in-out infinite reverse',
            pointerEvents: 'none',
          }}
        />
        {/* Orb 3 — cyan left center */}
        <div
          style={{
            position: 'absolute',
            top: '35%',
            left: '-8%',
            width: '450px',
            height: '450px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(182 100% 50% / 0.2) 0%, transparent 70%)',
            filter: 'blur(55px)',
            animation: 'orb-breathe 6s ease-in-out infinite 1s',
            pointerEvents: 'none',
          }}
        />
        {/* Orb 4 — amber top right */}
        <div
          style={{
            position: 'absolute',
            top: '8%',
            right: '8%',
            width: '320px',
            height: '320px',
            borderRadius: '50%',
            background: 'radial-gradient(circle, hsl(39 96% 53% / 0.2) 0%, transparent 70%)',
            filter: 'blur(45px)',
            animation: 'orb-breathe 3.5s ease-in-out infinite 0.5s',
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
            minWidth: '280px',
          }}
        >
          {/* Logo circle */}
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, hsl(267 72% 54%) 0%, hsl(349 89% 60%) 50%, hsl(39 96% 53%) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
              fontSize: '32px',
              fontWeight: '800',
              color: 'white',
              animation: 'logo-float 3s ease-in-out infinite',
              boxShadow: '0 0 60px hsl(267 72% 54% / 0.6)',
            }}
          >
            R
          </div>
          {/* Brand */}
          <p
            style={{
              fontSize: '11px',
              fontWeight: '600',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.4)',
              marginBottom: '28px',
            }}
          >
            RangManchAI
          </p>
          {/* Accent label */}
          {accentLabel && (
            <p
              style={{
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.3)',
                marginBottom: '8px',
              }}
            >
              {accentLabel}
            </p>
          )}
          {/* Title */}
          <p
            style={{
              fontSize: '20px',
              fontWeight: '700',
              color: 'rgba(255,255,255,0.9)',
              marginBottom: '8px',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </p>
          {/* Description */}
          {description && (
            <p
              style={{
                fontSize: '14px',
                color: 'rgba(255,255,255,0.45)',
                marginBottom: '28px',
                maxWidth: '300px',
              }}
            >
              {description}
            </p>
          )}
          {/* Progress bar */}
          <div
            style={{
              width: '220px',
              height: '3px',
              background: 'rgba(255,255,255,0.1)',
              borderRadius: '999px',
              overflow: 'hidden',
              margin: '0 auto',
            }}
          >
            <div
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, hsl(267 72% 54%), hsl(349 89% 60%), hsl(39 96% 53%))',
                borderRadius: '999px',
                animation: progress !== undefined ? 'none' : 'progress-flow 2.5s ease-in-out infinite',
                width: progress !== undefined ? `${progress}%` : undefined,
                transition: progress !== undefined ? 'width 0.5s ease-out' : 'none',
              }}
            />
          </div>
          {/* Step label */}
          {stepLabel && (
            <p
              style={{
                fontSize: '10px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.25)',
                marginTop: '12px',
              }}
            >
              {stepLabel}
            </p>
          )}
        </div>
      </div>
    </>
  );

  if (!mounted) {
    return overlay;
  }

  return createPortal(overlay, document.body);
}
