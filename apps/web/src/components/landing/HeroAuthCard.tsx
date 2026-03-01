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
    <div className="mx-auto w-full max-w-xl lg:mx-0">
      <div className="grid gap-3 md:justify-items-center lg:justify-items-start">
        <div className="grid w-full gap-3 md:max-w-[32rem] md:justify-items-stretch lg:max-w-none lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center">
        <button
          type="button"
          onClick={goGoogle}
          className="flex w-full items-center justify-between rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] px-3 py-2 text-left"
        >
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--color-text))]">Continue with Google</p>
            <p className="text-xs text-[hsl(var(--color-muted))]">One-click sign in for faster onboarding</p>
          </div>
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-sm font-bold text-[hsl(var(--color-text))]">
            G
          </span>
        </button>
        <span className="text-center text-sm font-semibold text-[hsl(var(--color-muted))]">Or</span>
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
          className="w-full rounded-[var(--radius-md)] bg-[hsl(var(--color-accent))] px-4 py-3 text-base font-bold text-[hsl(var(--color-accent-contrast))] md:max-w-[32rem] lg:max-w-none"
        >
          Get Started for Free
        </button>

        <p className="text-center text-xs text-[hsl(var(--color-muted))] md:max-w-[32rem] lg:max-w-none">
          By continuing you agree to RangManch AI terms.
        </p>
      </div>
    </div>
  );
}
