'use client';

import { useEffect, useState } from 'react';

export function CreatorBadge() {
  const [earned, setEarned] = useState(false);

  useEffect(() => {
    const check = () => {
      try {
        const data = JSON.parse(localStorage.getItem('rangmanchai_onboarding') || '{}');
        setEarned(data.badgeEarned === true);
      } catch {
        // Ignore parse errors
      }
    };

    check();
    window.addEventListener('onboarding-update', check);
    return () => window.removeEventListener('onboarding-update', check);
  }, []);

  if (!earned) return null;

  return (
    <>
      <style>{`
        @keyframes badge-glow {
          0%, 100% {
            box-shadow: 0 0 8px hsl(39 96% 53% / 0.4), 0 0 20px hsl(39 96% 53% / 0.2);
          }
          50% {
            box-shadow: 0 0 16px hsl(39 96% 53% / 0.8), 0 0 40px hsl(39 96% 53% / 0.4);
          }
        }
        @keyframes star-spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
      <div
        className="glass-card mx-2 mb-2 px-3 py-2 flex items-center gap-2"
        style={{
          border: '1px solid hsl(39 96% 53% / 0.4)',
          animation: 'badge-glow 2s ease-in-out infinite',
        }}
      >
        <span
          style={{
            fontSize: '16px',
            animation: 'star-spin 4s linear infinite',
            display: 'inline-block',
          }}
        >
          ⭐
        </span>
        <div>
          <p
            style={{
              fontSize: '11px',
              fontWeight: '700',
              background: 'linear-gradient(135deg, hsl(39 96% 53%), hsl(267 72% 64%))',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              margin: 0,
            }}
          >
            Creator
          </p>
          <p
            style={{
              fontSize: '9px',
              color: 'hsl(var(--color-muted))',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Badge Earned
          </p>
        </div>
      </div>
    </>
  );
}
