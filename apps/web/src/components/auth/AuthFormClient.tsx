'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { CheckCircle2, Mail, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
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

  const isLogin = mode === 'login';
  const title = isLogin ? 'Welcome back' : 'Create your account';
  const subtitle = isLogin
    ? 'Sign in with email or Google to continue into RangManch AI.'
    : 'Create your account, verify your email, and get into the studio with a standard secure signup flow.';

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
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authentication failed');
      setSubmitting(false);
    }
  }

  async function handleGoogleSignIn() {
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
      router.replace('/dashboard');
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Google sign-in failed');
    }
  }

  if (awaitingConfirmation && !isLogin) {
    return (
      <div className="mx-auto max-w-xl py-6">
        <Card>
          <div className="flex items-start gap-4">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--color-accent)/0.14)] text-[hsl(var(--color-accent))]">
              <Mail className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-[hsl(var(--color-text))]">Check your email</h1>
              <p className="mt-2 text-sm text-[hsl(var(--color-muted))]">
                {message || `We sent a confirmation email to ${email}. Open it and verify your account to continue.`}
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-3 text-sm">
                  <CheckCircle2 className="mb-2 h-4 w-4 text-[hsl(var(--color-accent))]" />
                  <div className="font-medium text-[hsl(var(--color-text))]">Open inbox</div>
                  <div className="mt-1 text-xs text-[hsl(var(--color-muted))]">Look for the verification message from Firebase Authentication / RangManch AI.</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-3 text-sm">
                  <ShieldCheck className="mb-2 h-4 w-4 text-[hsl(var(--color-accent))]" />
                  <div className="font-medium text-[hsl(var(--color-text))]">Confirm account</div>
                  <div className="mt-1 text-xs text-[hsl(var(--color-muted))]">Click the verification link to activate your account.</div>
                </div>
                <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-3 py-3 text-sm">
                  <Mail className="mb-2 h-4 w-4 text-[hsl(var(--color-accent))]" />
                  <div className="font-medium text-[hsl(var(--color-text))]">Log in</div>
                  <div className="mt-1 text-xs text-[hsl(var(--color-muted))]">Come back here and sign in once your email is verified.</div>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Button type="button" onClick={() => router.push(`/login?email=${encodeURIComponent(email)}`)}>
                  Go to Login
                </Button>
                <Button
                  variant="secondary"
                  type="button"
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

  return (
    <div className="mx-auto max-w-xl py-6">
      <Card>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <h1 className="text-2xl font-semibold text-[hsl(var(--color-text))]">{title}</h1>
            <p className="mt-1 text-sm text-[hsl(var(--color-muted))]">{subtitle}</p>
          </div>
          {!isLogin ? (
            <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] px-4 py-3 text-sm text-[hsl(var(--color-muted))] lg:max-w-[240px]">
              <div className="font-medium text-[hsl(var(--color-text))]">Account setup</div>
              <div className="mt-1">Create account, verify your email, then sign in to activate your workspace.</div>
            </div>
          ) : null}
        </div>
        {error ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-danger))] px-3 py-2 text-xs text-[hsl(var(--color-danger))]">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-3 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-3 py-2 text-xs text-[hsl(var(--color-text))]">
            {message}
          </p>
        ) : null}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--color-text))] transition hover:bg-[hsl(var(--color-bg))]"
        >
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))] text-xs font-bold">
            G
          </span>
          Continue with Google
        </button>

        <div className="mt-4 flex items-center gap-2 text-xs text-[hsl(var(--color-muted))]">
          <span className="h-px flex-1 bg-[hsl(var(--color-border))]" />
          or continue with email
          <span className="h-px flex-1 bg-[hsl(var(--color-border))]" />
        </div>

        <form onSubmit={handleSubmit} className="mt-4 grid gap-3">
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
              <p className="text-xs text-[hsl(var(--color-muted))]">
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
              <p className="text-xs text-[hsl(var(--color-muted))]">
                Use at least 8 characters. After signup, Firebase will send a verification email before first login.
              </p>
            </>
          ) : null}
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Please wait...' : isLogin ? 'Login' : 'Create Account'}
          </Button>
        </form>

        <p className="mt-4 text-xs text-[hsl(var(--color-muted))]">
          {isLogin ? 'New here?' : 'Already have an account?'}{' '}
          <Link href={isLogin ? '/signup' : '/login'} className="font-semibold text-[hsl(var(--color-accent))]">
            {isLogin ? 'Create account' : 'Login'}
          </Link>
        </p>
      </Card>
    </div>
  );
}
