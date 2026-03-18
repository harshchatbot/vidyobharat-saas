'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Mail, ShieldCheck, ArrowLeft, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import {
  signInWithGooglePopup,
  getProfileFields,
  getUserForIdToken,
  persistAppSession,
  signInWithPassword,
  signUpWithPassword,
} from '@/lib/firebase-auth';

type Props = {
  mode: 'login' | 'signup';
};

export function AuthFormClient({ mode }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { show } = useToast();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState(searchParams.get('email') ?? '');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(searchParams.get('error') ?? '');
  const [message, setMessage] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [authStageIndex, setAuthStageIndex] = useState(0);

  const isLogin = mode === 'login';
  const title = isLogin ? 'Welcome back' : 'Create your account';
  const subtitle = isLogin
    ? 'Sign in with email or Google to continue into RangManch AI.'
    : 'Create your account, verify your email, and get into the studio with a standard secure signup flow.';
  const authStages = useMemo(
    () =>
      isLogin
        ? ['Signing you in', 'Loading dashboard', 'Fetching your creations']
        : ['Creating your account', 'Securing your workspace', 'Preparing your dashboard'],
    [isLogin],
  );

  useEffect(() => {
    if (!submitting) {
      setAuthStageIndex(0);
      return;
    }
    const timer = window.setInterval(() => {
      setAuthStageIndex((current) => (current + 1) % authStages.length);
    }, 1300);
    return () => window.clearInterval(timer);
  }, [submitting, authStages]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setMessage('');
    setAwaitingConfirmation(false);

    if (!isLogin) {
      if (!fullName.trim()) {
        setError('Full name is required');
        setSubmitting(false);
        return;
      }
      if (phone.trim() && !/^[0-9+\-\s()]{8,20}$/.test(phone.trim())) {
        setError('Enter a valid phone number or leave it blank');
        setSubmitting(false);
        return;
      }
      if (password.length < 8) {
        setError('Use at least 8 characters for your password');
        setSubmitting(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Password and confirm password do not match');
        setSubmitting(false);
        return;
      }
    }

    try {
      const session = isLogin
        ? await signInWithPassword(email.trim(), password)
        : await signUpWithPassword(email.trim(), password, fullName.trim());

      if (!session) {
        const confirmationMessage = `We sent a confirmation email to ${email.trim()}. Verify it, then log in.`;
        setMessage(confirmationMessage);
        setAwaitingConfirmation(true);
        show('Confirmation email sent. Check your inbox.');
        setSubmitting(false);
        return;
      }

      const user = await getUserForIdToken(session.idToken);
      const profile = getProfileFields(user);
      await persistAppSession({
        accessToken: session.idToken,
        userId: user.id,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      });
      void api.primeDashboardWarmCache(user.id);
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      const session = await signInWithGooglePopup();
      const user = await getUserForIdToken(session.idToken);
      const profile = getProfileFields(user);
      await persistAppSession({
        accessToken: session.idToken,
        userId: user.id,
        name: profile.name,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
      });
      void api.primeDashboardWarmCache(user.id);
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in failed');
      setSubmitting(false);
    }
  }

  /* ─── Email-confirmation state ──────────────────────────────────────────── */
  if (awaitingConfirmation && !isLogin) {
    return (
      <div className="mx-auto max-w-xl px-1 py-4 sm:px-0 sm:py-8">
        <Card className="overflow-hidden border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.72)] backdrop-blur-md">
          {/* Subtle accent strip at the top */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--color-accent)/0.6), transparent)' }}
          />

          <div className="flex items-start gap-5">
            {/* Icon bubble */}
            <div className="mt-0.5 flex-shrink-0">
              <div className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))] ring-1 ring-[hsl(var(--color-accent)/0.2)]">
                <Mail className="h-5 w-5" />
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h1 className="font-heading text-2xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">
                Check your inbox
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--color-muted))]">
                {message || `We sent a confirmation email to ${email}. Open it and verify your account to continue.`}
              </p>

              {/* Steps */}
              <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
                {[
                  {
                    icon: <CheckCircle2 className="h-4 w-4" />,
                    title: 'Open inbox',
                    desc: 'Look for the verification message from RangManch AI.',
                  },
                  {
                    icon: <ShieldCheck className="h-4 w-4" />,
                    title: 'Confirm account',
                    desc: 'Click the verification link to activate your account.',
                  },
                  {
                    icon: <Mail className="h-4 w-4" />,
                    title: 'Log in',
                    desc: 'Come back here and sign in once your email is verified.',
                  },
                ].map((step) => (
                  <div
                    key={step.title}
                    className="group rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] px-3.5 py-3 transition-colors hover:border-[hsl(var(--color-accent)/0.35)] hover:bg-[hsl(var(--color-bg)/0.85)]"
                  >
                    <span className="mb-2 inline-flex text-[hsl(var(--color-accent)/0.75)] transition-colors group-hover:text-[hsl(var(--color-accent))]">
                      {step.icon}
                    </span>
                    <div className="text-sm font-semibold text-[hsl(var(--color-text))]">{step.title}</div>
                    <div className="mt-0.5 text-xs leading-relaxed text-[hsl(var(--color-muted))]">{step.desc}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
                <Button
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => router.push(`/login?email=${encodeURIComponent(email)}`)}
                >
                  Go to Login
                </Button>
                <Button
                  variant="secondary"
                  type="button"
                  className="w-full sm:w-auto"
                  onClick={() => {
                    setAwaitingConfirmation(false);
                    setMessage('');
                  }}
                >
                  Edit details
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  /* ─── Main auth form ─────────────────────────────────────────────────────── */
  return (
    <>
      <LoadingOverlay
        open={submitting}
        title={isLogin ? 'Signing you in' : 'Creating your account'}
        description={
          isLogin
            ? 'We are verifying your identity, loading your dashboard, and syncing your latest creations.'
            : 'We are securing your account, provisioning your workspace, and preparing your dashboard.'
        }
        stepLabel={authStages[authStageIndex]}
        accentLabel={isLogin ? 'Auth in progress' : 'Account setup'}
      />

      <div className="mx-auto max-w-xl px-1 py-4 sm:px-0 sm:py-8">
        {/* Top nav bar */}
        <div className="mb-5 flex items-center justify-between">
          <BrandLogo href="/" variant="mark" size="sm" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--color-muted))] transition-colors hover:text-[hsl(var(--color-accent))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>

        {/* Card */}
        <Card
          className="relative overflow-hidden border-[hsl(var(--color-border)/0.8)] backdrop-blur-md"
          style={{
            background:
              'radial-gradient(circle at top right, hsl(var(--color-accent)/0.10), transparent 50%), linear-gradient(150deg, hsl(var(--color-surface)/0.88), hsl(var(--color-elevated)/0.78))',
          }}
        >
          {/* Decorative top accent line */}
          <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, hsl(var(--color-accent)/0.55), transparent)' }}
          />

          {/* Header section */}
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-sm">
              {/* Mode badge */}
              <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-accent)/0.25)] bg-[hsl(var(--color-accent)/0.08)] px-2.5 py-1 text-xs font-medium text-[hsl(var(--color-accent))]">
                <Sparkles className="h-3 w-3" />
                {isLogin ? 'RangManch AI Studio' : 'New account'}
              </div>
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">
                {title}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--color-muted))]">{subtitle}</p>
            </div>

            {!isLogin ? (
              <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.65)] px-4 py-3 text-sm text-[hsl(var(--color-muted))] lg:max-w-[220px]">
                <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--color-accent)/0.75)]">
                  Setup steps
                </div>
                <ol className="space-y-1 text-xs leading-relaxed">
                  <li className="flex items-start gap-1.5">
                    <span className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.15)] text-[10px] font-bold text-[hsl(var(--color-accent))]">1</span>
                    Create your account
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.15)] text-[10px] font-bold text-[hsl(var(--color-accent))]">2</span>
                    Verify your email
                  </li>
                  <li className="flex items-start gap-1.5">
                    <span className="mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.15)] text-[10px] font-bold text-[hsl(var(--color-accent))]">3</span>
                    Sign in &amp; enter the studio
                  </li>
                </ol>
              </div>
            ) : null}
          </div>

          {/* Error / info messages */}
          {error ? (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[hsl(var(--color-danger)/0.4)] bg-[hsl(var(--color-danger)/0.06)] px-3.5 py-2.5">
              <span className="mt-px h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--color-danger))]" />
              <p className="text-xs leading-relaxed text-[hsl(var(--color-danger))]">{error}</p>
            </div>
          ) : null}
          {message ? (
            <div className="mt-4 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.5)] px-3.5 py-2.5">
              <p className="text-xs leading-relaxed text-[hsl(var(--color-text))]">{message}</p>
            </div>
          ) : null}

          {/* Google sign-in */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="group mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.6)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--color-text))] transition-all duration-150 hover:border-[hsl(var(--color-accent)/0.4)] hover:bg-[hsl(var(--color-bg)/0.85)] hover:shadow-sm active:scale-[0.99]"
          >
            {/* Google colourful G icon */}
            <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-white text-[11px] font-extrabold text-[#4285F4]">
              G
            </span>
            Continue with Google
          </button>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3 text-xs text-[hsl(var(--color-muted)/0.7)]">
            <span className="h-px flex-1 bg-[hsl(var(--color-border)/0.6)]" />
            <span className="select-none">or continue with email</span>
            <span className="h-px flex-1 bg-[hsl(var(--color-border)/0.6)]" />
          </div>

          {/* Email / password form */}
          <form onSubmit={handleSubmit} className="grid gap-3">
            {!isLogin ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    name="full_name"
                    type="text"
                    placeholder="Full name"
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    required
                  />
                  <Input
                    name="phone"
                    type="tel"
                    placeholder="Phone (optional)"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                  />
                </div>
                <p className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">
                  Use your real name so your profile, billing, and workspace settings are initialized correctly.
                </p>
              </>
            ) : null}

            <Input
              name="email"
              type="email"
              placeholder={isLogin ? 'you@domain.com' : 'Work email'}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              name="password"
              type="password"
              placeholder={isLogin ? 'Enter your password' : 'Create a password (min 8 characters)'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />

            {!isLogin ? (
              <>
                <Input
                  name="confirm_password"
                  type="password"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                />
                <p className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">
                  Use at least 8 characters. After signup, Firebase will send a verification email before first login.
                </p>
              </>
            ) : null}

            <Button
              type="submit"
              disabled={submitting}
              className="mt-1 min-h-11 w-full shadow-soft transition-all duration-150 active:scale-[0.99]"
            >
              {submitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create Account'}
            </Button>
          </form>

          {/* Footer link */}
          <div className="mt-5 flex items-center justify-between border-t border-[hsl(var(--color-border)/0.5)] pt-4">
            <p className="text-xs text-[hsl(var(--color-muted))]">
              {isLogin ? 'New here?' : 'Already have an account?'}
            </p>
            <Link
              href={isLogin ? '/signup' : '/login'}
              className="text-xs font-semibold text-[hsl(var(--color-accent))] transition-opacity hover:opacity-80"
            >
              {isLogin ? 'Create account →' : 'Sign in →'}
            </Link>
          </div>
        </Card>

        {/* Fine-print below card */}
        <p className="mt-4 text-center text-[11px] text-[hsl(var(--color-muted)/0.6)]">
          Protected by Firebase Authentication &amp; end-to-end encryption.
        </p>
      </div>
    </>
  );
}