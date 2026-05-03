'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Mail, ShieldCheck, Sparkles } from 'lucide-react';

import { BrandLogo } from '@/components/brand/BrandLogo';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingOverlay } from '@/components/ui/LoadingOverlay';
import { SignInPage, type Testimonial } from '@/components/ui/sign-in';
import { useToast } from '@/components/ui/Toast';
import { api } from '@/lib/api';
import {
  getProfileFields,
  getUserForIdToken,
  persistAppSession,
  signInWithGooglePopup,
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
    ? 'Sign in with Google or use your verified email account to continue into RangManch AI.'
    : 'Create your account, verify your email, and get into the studio with a standard secure signup flow.';
  const authStages = useMemo(
    () =>
      isLogin
        ? ['Signing you in', 'Loading dashboard', 'Fetching your creations']
        : ['Creating your account', 'Securing your workspace', 'Preparing your dashboard'],
    [isLogin],
  );
  const loginTestimonials = useMemo<Testimonial[]>(
    () => [
      {
        avatarSrc: 'https://randomuser.me/api/portraits/women/57.jpg',
        name: 'Rohini Mehta',
        handle: '@rohinicreates',
        text: 'From product photos to publish-ready AI ads, everything moves faster inside RangManch AI.',
      },
      {
        avatarSrc: 'https://randomuser.me/api/portraits/men/64.jpg',
        name: 'Vikas Singh',
        handle: '@vikasbuilds',
        text: 'RangManch AI keeps the creation flow clear and reliable, whether you are making product ads, short videos, images, or voice-led content.',
      },
      {
        avatarSrc: 'https://randomuser.me/api/portraits/women/32.jpg',
        name: 'Ishita Rao',
        handle: '@ishitagrowth',
        text: 'We use it daily for faster production without losing quality or brand consistency.',
      },
    ],
    [],
  );
  const signupBenefits = useMemo(
    () => [
      {
        title: 'Standard secure signup',
        body: 'Create your account with email and password, then confirm your email before first login.',
      },
      {
        title: 'Studio-ready workspace',
        body: 'We provision your dashboard, billing, and creator workspace immediately after verification.',
      },
      {
        title: 'Google sign-in supported',
        body: 'If you prefer, continue with Google and skip the manual password flow.',
      },
    ],
    [],
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
      if (isLogin && !user.emailVerified) {
        setMessage(`Verify your email before signing in. We already sent a confirmation email to ${email.trim()}.`);
        setAwaitingConfirmation(true);
        throw new Error('Verify your email before signing in.');
      }
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

  if (awaitingConfirmation && !isLogin) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-8 flex items-center justify-between">
          <BrandLogo href="/" variant="mark" size="sm" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--color-muted))] transition-colors hover:text-[hsl(var(--color-accent))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>

        <div className="space-y-8">
          <div className="flex items-start gap-4">
            <div className="mt-0.5 inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-[hsl(var(--color-accent)/0.12)] text-[hsl(var(--color-accent))] ring-1 ring-[hsl(var(--color-accent)/0.2)]">
              <Mail className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-heading text-3xl font-extrabold tracking-tight text-[hsl(var(--color-text))]">
                Check your inbox
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[hsl(var(--color-muted))]">
                {message || `We sent a confirmation email to ${email}. Open it and verify your account to continue.`}
              </p>
            </div>
          </div>

          <div className="grid gap-4 border-t border-[hsl(var(--color-border)/0.6)] pt-6 sm:grid-cols-3">
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
              <div key={step.title} className="space-y-2 border-l border-[hsl(var(--color-border)/0.45)] pl-4">
                <span className="inline-flex text-[hsl(var(--color-accent))]">{step.icon}</span>
                <div className="text-sm font-semibold text-[hsl(var(--color-text))]">{step.title}</div>
                <div className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">{step.desc}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2.5 border-t border-[hsl(var(--color-border)/0.6)] pt-5 sm:flex-row sm:flex-wrap">
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

        <p className="mt-4 text-center text-[11px] text-[hsl(var(--color-muted)/0.6)]">
          Protected by Firebase Authentication &amp; end-to-end encryption.
        </p>
      </div>
    );
  }

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

      {isLogin ? (
        <div className="bg-bg">
          <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
            <div className="mb-8 flex items-center justify-between">
              <BrandLogo href="/" variant="mark" size="sm" />
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--color-muted))] transition-colors hover:text-[hsl(var(--color-accent))]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to home
              </Link>
            </div>
          </div>

          <SignInPage
            title="Welcome back"
            description="Sign in with Google or use your verified email account to continue into RangManch AI."
            heroImageSrc="/rangmanciai_login.jpg"
            testimonials={loginTestimonials}
            error={error}
            notice={message}
            submitLabel={submitting ? 'Please wait…' : 'Sign In'}
            googleLabel="Continue with Google"
            createAccountLabel="Create Account"
            resetPasswordLabel="Reset password"
            emailValue={email}
            passwordValue={password}
            submitting={submitting}
            onEmailChange={setEmail}
            onPasswordChange={setPassword}
            onSignIn={handleSubmit}
            onGoogleSignIn={() => void handleGoogleSignIn()}
            onResetPassword={() =>
              setMessage('Password reset is not available in-app yet. Please use Google sign-in or contact support.')
            }
            onCreateAccount={() => router.push('/signup')}
            footer={
              <p className="text-center text-[11px] text-[hsl(var(--color-muted)/0.6)]">
                Protected by Firebase Authentication &amp; end-to-end encryption.
              </p>
            }
          />
        </div>
      ) : (
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-8 flex items-center justify-between">
          <BrandLogo href="/" variant="mark" size="sm" />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[hsl(var(--color-muted))] transition-colors hover:text-[hsl(var(--color-accent))]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to home
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.98fr)_minmax(420px,0.82fr)] lg:items-stretch">
          <AuthShowcasePanel
            badge="New account"
            title="Set up your creator workspace with a clean, standard signup flow."
            body="We keep the auth path straightforward: account creation, email verification, then studio access. No hidden product changes behind the UI refresh."
          />

          <div className="rounded-[32px] border border-[hsl(var(--color-border)/0.58)] bg-[linear-gradient(145deg,hsl(var(--color-surface-glass-strong)/0.82),hsl(var(--color-elevated)/0.58))] px-5 py-6 shadow-[var(--shadow-cinematic)] backdrop-blur-xl sm:px-7 sm:py-7">
            <div className="space-y-8">
              <div className="flex flex-col gap-6 border-b border-[hsl(var(--color-border)/0.55)] pb-6 lg:flex-row lg:items-start lg:justify-between">
                <div className="max-w-sm">
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-accent)/0.25)] bg-[hsl(var(--color-accent)/0.08)] px-3 py-1.5 text-xs font-medium text-[hsl(var(--color-accent))]">
                    <Sparkles className="h-3 w-3" />
                    {isLogin ? 'RangManch AI Studio' : 'New account'}
                  </div>
                  <h1 className="font-heading text-3xl font-extrabold tracking-tight text-[hsl(var(--color-text))] sm:text-[2.35rem]">
                    {title}
                  </h1>
                  <p className="mt-1.5 text-sm leading-relaxed text-[hsl(var(--color-muted))]">{subtitle}</p>
                </div>

                {!isLogin ? (
                  <div className="rounded-[24px] border border-[hsl(var(--color-border)/0.48)] bg-[hsl(var(--color-surface)/0.38)] p-4 text-sm text-[hsl(var(--color-muted))] lg:max-w-[252px]">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-[hsl(var(--color-accent)/0.75)]">
                      Setup steps
                    </div>
                    <ol className="space-y-1 text-xs leading-relaxed">
                      <li>Create your account</li>
                      <li>Verify your email</li>
                      <li>Sign in and enter the studio</li>
                    </ol>
                  </div>
                ) : null}
              </div>

              {error ? (
                <div className="flex items-start gap-2 rounded-xl border border-[hsl(var(--color-danger)/0.4)] bg-[hsl(var(--color-danger)/0.06)] px-3.5 py-2.5">
                  <span className="mt-px h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[hsl(var(--color-danger))]" />
                  <p className="text-xs leading-relaxed text-[hsl(var(--color-danger))]">{error}</p>
                </div>
              ) : null}
              {message ? (
                <div className="rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.5)] px-3.5 py-2.5">
                  <p className="text-xs leading-relaxed text-[hsl(var(--color-text))]">{message}</p>
                </div>
              ) : null}

              <div className="space-y-5">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="group inline-flex min-h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg)/0.35)] px-4 py-2.5 text-sm font-medium text-[hsl(var(--color-text))] transition-all duration-150 hover:border-[hsl(var(--color-accent)/0.4)] hover:bg-[hsl(var(--color-bg)/0.6)] hover:shadow-sm active:scale-[0.99]"
                >
                  <span className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-white text-[11px] font-extrabold text-[#4285F4]">
                    G
                  </span>
                  Continue with Google
                </button>

                <div className="flex items-center gap-3 text-xs text-[hsl(var(--color-muted)/0.7)]">
                  <span className="h-px flex-1 bg-[hsl(var(--color-border)/0.6)]" />
                  <span className="select-none">or continue with email</span>
                  <span className="h-px flex-1 bg-[hsl(var(--color-border)/0.6)]" />
                </div>

                <form onSubmit={handleSubmit} className="grid gap-3">
                  {!isLogin ? (
                    <>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.1rem] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface-glass)/0.62)] p-1 backdrop-blur-sm">
                          <Input
                            name="full_name"
                            type="text"
                            placeholder="Full name"
                            value={fullName}
                            onChange={(event) => setFullName(event.target.value)}
                            required
                            className="border-0 bg-transparent shadow-none focus:ring-0"
                          />
                        </div>
                        <div className="rounded-[1.1rem] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface-glass)/0.62)] p-1 backdrop-blur-sm">
                          <Input
                            name="phone"
                            type="tel"
                            placeholder="Phone (optional)"
                            value={phone}
                            onChange={(event) => setPhone(event.target.value)}
                            className="border-0 bg-transparent shadow-none focus:ring-0"
                          />
                        </div>
                      </div>
                      <p className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">
                        Use your real name so your profile, billing, and workspace settings are initialized correctly.
                      </p>
                    </>
                  ) : null}

                  <div className="rounded-[1.1rem] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface-glass)/0.62)] p-1 backdrop-blur-sm">
                    <Input
                      name="email"
                      type="email"
                      placeholder={isLogin ? 'you@domain.com' : 'Work email'}
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="border-0 bg-transparent shadow-none focus:ring-0"
                    />
                  </div>
                  <div className="rounded-[1.1rem] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface-glass)/0.62)] p-1 backdrop-blur-sm">
                    <Input
                      name="password"
                      type="password"
                      placeholder={isLogin ? 'Enter your password' : 'Create a password (min 8 characters)'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      required
                      className="border-0 bg-transparent shadow-none focus:ring-0"
                    />
                  </div>

                  {!isLogin ? (
                    <>
                      <div className="rounded-[1.1rem] border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface-glass)/0.62)] p-1 backdrop-blur-sm">
                        <Input
                          name="confirm_password"
                          type="password"
                          placeholder="Confirm password"
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          required
                          className="border-0 bg-transparent shadow-none focus:ring-0"
                        />
                      </div>
                      <p className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">
                        Use at least 8 characters. After signup, Firebase will send a verification email before first login.
                      </p>
                    </>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="mt-1 min-h-11 w-full rounded-[1.1rem] shadow-soft transition-all duration-150 active:scale-[0.99]"
                  >
                    {submitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create Account'}
                  </Button>
                </form>

                {!isLogin ? (
                  <div className="grid gap-3 rounded-[24px] border border-[hsl(var(--color-border)/0.48)] bg-[hsl(var(--color-surface)/0.34)] p-4 sm:grid-cols-3">
                    {signupBenefits.map((item) => (
                      <div key={item.title} className="space-y-1.5">
                        <div className="text-sm font-semibold text-[hsl(var(--color-text))]">{item.title}</div>
                        <div className="text-xs leading-relaxed text-[hsl(var(--color-muted))]">{item.body}</div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="flex items-center justify-between border-t border-[hsl(var(--color-border)/0.5)] pt-4">
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
            </div>
          </div>
        </div>

        <p className="mt-4 text-center text-[11px] text-[hsl(var(--color-muted)/0.6)]">
          Protected by Firebase Authentication &amp; end-to-end encryption.
        </p>
      </div>
      )}
    </>
  );
}

function AuthShowcasePanel({
  badge = 'Creator studio',
  title = 'Launch products, visuals, and short videos from one studio.',
  body = 'A focused workspace for creators, businesses, and teams building AI-first campaigns with less production overhead.',
}: {
  badge?: string;
  title?: string;
  body?: string;
}) {
  return (
    <div className="order-2 overflow-hidden rounded-[30px] border border-[hsl(var(--color-border)/0.56)] bg-[linear-gradient(145deg,hsl(var(--color-surface)/0.9),hsl(var(--color-elevated)/0.82))] shadow-[var(--shadow-cinematic)] lg:order-1">
      <div className="relative min-h-[280px] sm:min-h-[360px] lg:min-h-full">
        <img src="/rangmanciai_login.jpg" alt="RangManch AI login visual" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.1),hsl(var(--color-bg)/0.18)_26%,hsl(var(--color-bg)/0.88)_92%)]" />
        <div className="relative flex h-full flex-col justify-between p-5 sm:p-6 lg:p-8">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.3)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur-md">
              {badge}
            </span>
            <span className="inline-flex rounded-full border border-[hsl(var(--color-border)/0.72)] bg-[hsl(var(--color-surface)/0.24)] px-3 py-1 text-[11px] font-semibold text-white/90 backdrop-blur-md">
              India-first
            </span>
          </div>

          <div className="max-w-md space-y-3">
            <h2 className="font-heading text-3xl font-extrabold tracking-tight text-white sm:text-4xl">{title}</h2>
            <p className="text-sm leading-7 text-white/72">{body}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
