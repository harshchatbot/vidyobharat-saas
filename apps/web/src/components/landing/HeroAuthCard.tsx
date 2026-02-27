'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

export function HeroAuthCard() {
  const router = useRouter();
  const [email, setEmail] = useState('');

  const goGoogle = () => {
    router.push('/login');
  };

  const goSignup = (selectedEmail?: string) => {
    const value = selectedEmail ?? email;
    const query = value ? `?email=${encodeURIComponent(value)}` : '';
    router.push(`/signup${query}`);
  };

  return (
    <div className="max-w-2xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          onClick={goGoogle}
          className="flex min-w-[280px] items-center justify-between rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Continue with Google</p>
            <p className="text-xs text-[hsl(var(--color-muted))]">One-click sign in for faster onboarding</p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-sm font-bold text-[hsl(var(--color-text))]">
            G
          </span>
        </button>
        <span className="text-sm font-semibold text-[hsl(var(--color-muted))]">Or</span>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Enter your email..."
          className="w-full rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-4 py-3 text-sm text-[hsl(var(--color-text))] outline-none ring-[hsl(var(--color-accent))] focus:ring-2"
        />
      </div>

      <button
        type="button"
        onClick={() => goSignup()}
        className="mt-3 w-full rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-4 py-3 text-base font-bold text-[hsl(var(--color-accent-contrast))]"
      >
        Get Started for Free
      </button>

      <p className="mt-3 text-center text-xs text-[hsl(var(--color-muted))]">
        By continuing you agree to VidyoBharat terms.
      </p>
    </div>
  );
}
