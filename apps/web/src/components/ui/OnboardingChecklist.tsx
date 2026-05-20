'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Check, X, UserRound, Clapperboard, Sparkles, Mic2, FolderOpen } from 'lucide-react';
import { VoicePreviewModal } from './VoicePreviewModal';
import { getCurrentUserIdOrThrow } from '@/lib/authUser';

const CHECKLIST_ITEMS = [
  {
    id: 'complete_profile',
    label: 'Complete your profile',
    description: 'Add your name and avatar',
    href: '/settings',
    icon: 'UserRound',
  },
  {
    id: 'create_ugc_ad',
    label: 'Create your first UGC ad',
    description: 'Go through the full story-ad flow',
    href: '/story-ad',
    icon: 'Clapperboard',
  },
  {
    id: 'explore_recipe',
    label: 'Explore a Recipe',
    description: 'Try a recipe-based generation',
    href: '/create',
    icon: 'Sparkles',
  },
  {
    id: 'preview_voice',
    label: 'Preview a voice',
    description: 'Try the voice selector',
    href: '/create',
    icon: 'Mic2',
  },
  {
    id: 'visit_projects',
    label: 'Visit your Projects',
    description: 'See your saved work',
    href: '/projects',
    icon: 'FolderOpen',
  },
];

interface OnboardingState {
  completed: string[];
  dismissed: boolean;
  badgeEarned: boolean;
}

const ICON_MAP = {
  UserRound,
  Clapperboard,
  Sparkles,
  Mic2,
  FolderOpen,
};

function getIconComponent(iconName: string) {
  return ICON_MAP[iconName as keyof typeof ICON_MAP] || UserRound;
}

export function markOnboardingComplete(itemId: string) {
  if (typeof window === 'undefined') return;

  const state = getOnboardingState();
  if (!state.completed.includes(itemId)) {
    state.completed.push(itemId);
    saveOnboardingState(state);
    window.dispatchEvent(new CustomEvent('onboarding-update'));
  }
}

function getOnboardingState(): OnboardingState {
  if (typeof window === 'undefined') {
    return { completed: [], dismissed: false, badgeEarned: false };
  }

  try {
    const stored = localStorage.getItem('rangmanchai_onboarding');
    return stored ? JSON.parse(stored) : { completed: [], dismissed: false, badgeEarned: false };
  } catch {
    return { completed: [], dismissed: false, badgeEarned: false };
  }
}

function saveOnboardingState(state: OnboardingState) {
  if (typeof window === 'undefined') return;

  try {
    localStorage.setItem('rangmanchai_onboarding', JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function OnboardingChecklistContent({
  state,
  onDismiss,
  completedCount,
  onPreviewVoice,
}: {
  state: OnboardingState;
  onDismiss: () => void;
  completedCount: number;
  onPreviewVoice: () => void;
}) {
  return (
    <div className="glass-card-strong p-6 mb-8 rounded-xl">
      {/* Header */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="gradient-text text-lg font-bold">🎯 Get started with RangManchAI</h3>
          <p className="text-sm mt-1" style={{ color: 'hsl(var(--color-text-secondary))' }}>
            Complete these steps to earn your Creator badge
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="text-xs transition-all hover:opacity-80"
          style={{ color: 'hsl(var(--color-muted))' }}
          aria-label="Dismiss onboarding"
        >
          <X size={20} />
        </button>
      </div>

      {/* Progress Bar */}
      <div className="glass-card h-2 w-full mt-3 mb-4 overflow-hidden" style={{ background: 'hsl(var(--glass-bg-medium))' }}>
        <div
          style={{
            background: 'var(--gradient-brand)',
            height: '100%',
            borderRadius: '9999px',
            width: `${(completedCount / 5) * 100}%`,
            transition: 'width 0.5s ease-out',
          }}
        />
      </div>

      <p className="text-xs mb-4" style={{ color: 'hsl(var(--color-muted))' }}>
        {completedCount}/5 completed
      </p>

      {/* Checklist Items */}
      <div className="space-y-0">
        {CHECKLIST_ITEMS.map((item, index) => {
          const isCompleted = state.completed.includes(item.id);
          const IconComponent = getIconComponent(item.icon);

          return (
            <div
              key={item.id}
              className="flex items-center justify-between py-2.5 transition-all"
              style={{
                borderBottom: index < CHECKLIST_ITEMS.length - 1 ? `1px solid hsl(var(--glass-border))` : 'none',
                opacity: isCompleted ? 0.6 : 1,
              }}
            >
              {/* Checkbox */}
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {isCompleted ? (
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                    style={{ background: 'hsl(var(--color-success))' }}
                  >
                    <Check size={12} style={{ color: 'white' }} />
                  </div>
                ) : (
                  <div
                    className="flex-shrink-0 w-5 h-5 rounded-full border-2"
                    style={{ borderColor: 'hsl(var(--glass-border))' }}
                  />
                )}

                {/* Label & Description */}
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium transition-all"
                    style={{
                      color: 'hsl(var(--color-text))',
                      textDecoration: isCompleted ? 'line-through' : 'none',
                    }}
                  >
                    {item.label}
                  </p>
                  <p className="text-xs" style={{ color: 'hsl(var(--color-muted))' }}>
                    {item.description}
                  </p>
                </div>
              </div>

              {/* Action Link */}
              {item.id === 'preview_voice' ? (
                <button
                  onClick={onPreviewVoice}
                  className="glass-card px-3 py-1 text-xs flex-shrink-0 ml-2 rounded-lg transition-all hover:opacity-80"
                  style={{ color: 'hsl(var(--color-primary))' }}
                >
                  {isCompleted ? '✓' : 'Try Now'}
                </button>
              ) : item.id === 'explore_recipe' ? (
                <button
                  onClick={() => {
                    const recipesSection = document.querySelector('[data-section="recipes"]');
                    if (recipesSection) {
                      recipesSection.scrollIntoView({ behavior: 'smooth' });
                    } else {
                      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                    }
                  }}
                  className="glass-card px-3 py-1 text-xs flex-shrink-0 ml-2 rounded-lg transition-all hover:opacity-80"
                  style={{ color: 'hsl(var(--color-primary))' }}
                >
                  {isCompleted ? '✓' : 'Try Now'}
                </button>
              ) : (
                <Link
                  href={item.href}
                  className="glass-card px-3 py-1 text-xs flex-shrink-0 ml-2 rounded-lg transition-all hover:opacity-80"
                  style={{ color: 'hsl(var(--color-primary))' }}
                >
                  {isCompleted ? '✓' : 'Try Now'}
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Dismiss Button */}
      <button
        onClick={onDismiss}
        className="text-xs mt-4 transition-all hover:opacity-100"
        style={{
          color: 'hsl(var(--color-muted))',
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

function triggerConfetti() {
  const colors = ['#7C3AED', '#EC4899', '#F59E0B', '#06B6D4', '#10B981'];
  const style = document.createElement('style');
  style.textContent = `@keyframes confetti-fall {
    0% { transform: translateY(0) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
  }`;
  document.head.appendChild(style);

  for (let i = 0; i < 80; i++) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed;
      width: ${Math.random() * 10 + 5}px;
      height: ${Math.random() * 10 + 5}px;
      background: ${colors[Math.floor(Math.random() * colors.length)]};
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
      left: ${Math.random() * 100}vw;
      top: -20px;
      z-index: 99999;
      pointer-events: none;
      animation: confetti-fall ${Math.random() * 2 + 2}s ease-in forwards;
      animation-delay: ${Math.random() * 1.5}s;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }
  setTimeout(() => style.remove(), 6000);
}

async function claimOnboardingReward(): Promise<boolean> {
  try {
    const userId = getCurrentUserIdOrThrow('onboarding reward');
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const res = await fetch(`${apiUrl}/api/onboarding/complete`, {
      method: 'POST',
      headers: { 'X-User-ID': userId },
    });
    const data = await res.json();
    if (data.success) {
      // Dispatch credit update event so topbar refreshes
      window.dispatchEvent(new CustomEvent('rangmanch:credits-updated'));
      return true;
    }
  } catch (err) {
    console.error('Failed to claim onboarding reward:', err);
  }
  return false;
}

function BadgeEarnedContent({ onDismiss }: { onDismiss: () => void }) {
  const [creditsGranted, setCreditsGranted] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    const claim = async () => {
      setClaiming(true);
      const success = await claimOnboardingReward();
      if (success) {
        triggerConfetti();
        setCreditsGranted(20);
      }
      setClaiming(false);
    };
    claim();
  }, []);
  return (
    <div className="glass-card-strong p-8 mb-8 rounded-xl flex flex-col items-center text-center">
      <div className="animate-float text-6xl mb-4">🏆</div>
      <h3 className="gradient-text text-xl font-bold">Creator Badge Earned!</h3>
      <p className="text-sm mt-2 mb-6" style={{ color: 'hsl(var(--color-text-secondary))' }}>
        You've completed all onboarding steps.
      </p>
      <div className="glass-card-strong px-6 py-3 inline-flex items-center gap-2 mb-6 rounded-lg">
        <span style={{ color: 'hsl(var(--color-accent-amber))', fontSize: '18px' }}>⭐</span>
        <span className="gradient-text font-bold">RangManchAI Creator</span>
      </div>
      {creditsGranted && (
        <p
          className="text-sm font-semibold mb-4"
          style={{ color: 'hsl(var(--color-success))' }}
        >
          🎉 +{creditsGranted} credits added to your account!
        </p>
      )}
      <button
        onClick={onDismiss}
        className="glow-button"
        style={{ background: 'var(--gradient-brand)' }}
        disabled={claiming}
      >
        {claiming ? 'Claiming reward...' : 'Start Creating →'}
      </button>
    </div>
  );
}

export function OnboardingChecklist() {
  const [state, setState] = useState<OnboardingState>({ completed: [], dismissed: false, badgeEarned: false });
  const [mounted, setMounted] = useState(false);
  const [showVoiceModal, setShowVoiceModal] = useState(false);

  useEffect(() => {
    const loadState = () => {
      const loaded = getOnboardingState();
      setState(loaded);
      setMounted(true);
    };

    loadState();

    const handleUpdate = () => {
      const updated = getOnboardingState();
      setState(updated);
    };

    window.addEventListener('onboarding-update', handleUpdate);
    return () => window.removeEventListener('onboarding-update', handleUpdate);
  }, []);

  if (!mounted) return null;

  const completedCount = state.completed.length;
  const allCompleted = completedCount === 5;

  // Don't show if dismissed or (all completed and badge earned)
  if (state.dismissed || (allCompleted && state.badgeEarned)) {
    return null;
  }

  // Show badge earned state
  if (allCompleted && !state.badgeEarned) {
    const handleDismiss = () => {
      const updated = { ...state, badgeEarned: true, dismissed: true };
      setState(updated);
      saveOnboardingState(updated);
    };

    return <BadgeEarnedContent onDismiss={handleDismiss} />;
  }

  // Show regular checklist
  const handleDismiss = () => {
    const updated = { ...state, dismissed: true };
    setState(updated);
    saveOnboardingState(updated);
  };

  return (
    <>
      <OnboardingChecklistContent
        state={state}
        onDismiss={handleDismiss}
        completedCount={completedCount}
        onPreviewVoice={() => setShowVoiceModal(true)}
      />
      <VoicePreviewModal isOpen={showVoiceModal} onClose={() => setShowVoiceModal(false)} />
    </>
  );
}

export default OnboardingChecklist;
