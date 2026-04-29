'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const GoogleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s12-5.373 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-2.641-.21-5.236-.611-7.743z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C42.022 35.026 44 30.038 44 24c0-2.641-.21-5.236-.611-7.743z" />
  </svg>
);

export interface Testimonial {
  avatarSrc: string;
  name: string;
  handle: string;
  text: string;
}

interface SignInPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  error?: React.ReactNode;
  notice?: React.ReactNode;
  submitLabel?: string;
  googleLabel?: string;
  createAccountLabel?: React.ReactNode;
  resetPasswordLabel?: React.ReactNode;
  footer?: React.ReactNode;
  emailValue?: string;
  passwordValue?: string;
  rememberMeDefaultChecked?: boolean;
  submitting?: boolean;
  onEmailChange?: (value: string) => void;
  onPasswordChange?: (value: string) => void;
  onSignIn?: (event: React.FormEvent<HTMLFormElement>) => void;
  onGoogleSignIn?: () => void;
  onResetPassword?: () => void;
  onCreateAccount?: () => void;
}

const GlassInputWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-[1.1rem] border border-border bg-[hsl(var(--color-surface-glass)/0.65)] backdrop-blur-sm transition-colors focus-within:border-[hsl(var(--color-accent)/0.45)] focus-within:bg-[hsl(var(--color-surface-glass-strong)/0.82)]">
    {children}
  </div>
);

const TestimonialCard = ({ testimonial, delay }: { testimonial: Testimonial; delay: string }) => (
  <div
    className={`animate-testimonial ${delay} flex w-64 items-start gap-3 rounded-[1.6rem] border border-[hsl(var(--color-border)/0.55)] bg-[hsl(var(--color-surface-glass-strong)/0.74)] p-5 backdrop-blur-xl`}
  >
    <img src={testimonial.avatarSrc} className="h-10 w-10 rounded-2xl object-cover" alt={testimonial.name} />
    <div className="text-sm leading-snug">
      <p className="flex items-center gap-1 font-medium text-text">{testimonial.name}</p>
      <p className="text-muted">{testimonial.handle}</p>
      <p className="mt-1 text-[hsl(var(--color-text)/0.82)]">{testimonial.text}</p>
    </div>
  </div>
);

export const SignInPage: React.FC<SignInPageProps> = ({
  title = <span className="font-light tracking-tighter text-text">Welcome</span>,
  description = 'Access your account and continue your journey with us',
  heroImageSrc,
  testimonials = [],
  error,
  notice,
  submitLabel = 'Sign In',
  googleLabel = 'Continue with Google',
  createAccountLabel = 'Create Account',
  resetPasswordLabel = 'Reset password',
  footer,
  emailValue,
  passwordValue,
  rememberMeDefaultChecked = false,
  submitting = false,
  onEmailChange,
  onPasswordChange,
  onSignIn,
  onGoogleSignIn,
  onResetPassword,
  onCreateAccount,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="flex min-h-[100dvh] w-full flex-col font-sans md:flex-row">
      <section className="flex flex-1 items-center justify-center p-6 sm:p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-6">
            <h1 className="animate-element animate-delay-100 text-4xl font-semibold leading-tight text-text md:text-5xl">
              {title}
            </h1>
            <p className="animate-element animate-delay-200 text-muted">{description}</p>

            {error ? (
              <div className="animate-element animate-delay-250 rounded-[1.1rem] border border-[hsl(var(--color-danger)/0.35)] bg-[hsl(var(--color-danger)/0.08)] px-4 py-3 text-sm text-danger">
                {error}
              </div>
            ) : null}
            {notice ? (
              <div className="animate-element animate-delay-260 rounded-[1.1rem] border border-[hsl(var(--color-border)/0.7)] bg-[hsl(var(--color-surface)/0.6)] px-4 py-3 text-sm text-text">
                {notice}
              </div>
            ) : null}

            <form className="space-y-5" onSubmit={onSignIn}>
              <div className="animate-element animate-delay-300">
                <label className="mb-2 block text-sm font-medium text-muted">Email Address</label>
                <GlassInputWrapper>
                  <input
                    name="email"
                    type="email"
                    placeholder="Enter your email address"
                    value={emailValue}
                    onChange={(event) => onEmailChange?.(event.target.value)}
                    className="w-full rounded-[1.1rem] bg-transparent p-4 text-sm text-text focus:outline-none"
                  />
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-400">
                <label className="mb-2 block text-sm font-medium text-muted">Password</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter your password"
                      value={passwordValue}
                      onChange={(event) => onPasswordChange?.(event.target.value)}
                      className="w-full rounded-[1.1rem] bg-transparent p-4 pr-12 text-sm text-text focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((current) => !current)}
                      className="absolute inset-y-0 right-3 flex items-center"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-muted transition-colors hover:text-text" />
                      ) : (
                        <Eye className="h-5 w-5 text-muted transition-colors hover:text-text" />
                      )}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>

              <div className="animate-element animate-delay-500 flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-3">
                  <input
                    type="checkbox"
                    name="rememberMe"
                    className="custom-checkbox"
                    defaultChecked={rememberMeDefaultChecked}
                  />
                  <span className="text-[hsl(var(--color-text)/0.9)]">Keep me signed in</span>
                </label>
                <a
                  href="#"
                  onClick={(event) => {
                    event.preventDefault();
                    onResetPassword?.();
                  }}
                  className="text-accent transition-colors hover:underline"
                >
                  {resetPasswordLabel}
                </a>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="animate-element animate-delay-600 w-full rounded-[1.1rem] bg-accent py-4 font-medium text-accent-contrast transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitLabel}
              </button>
            </form>

            <div className="animate-element animate-delay-700 relative flex items-center justify-center">
              <span className="w-full border-t border-border" />
              <span className="absolute bg-bg px-4 text-sm text-muted">Or continue with</span>
            </div>

            <button
              type="button"
              onClick={onGoogleSignIn}
              disabled={submitting}
              className="animate-element animate-delay-800 flex w-full items-center justify-center gap-3 rounded-[1.1rem] border border-border bg-[hsl(var(--color-surface)/0.55)] py-4 transition-colors hover:bg-elevated disabled:cursor-not-allowed disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLabel}
            </button>

            <p className="animate-element animate-delay-900 text-center text-sm text-muted">
              New to our platform?{' '}
              <a
                href="#"
                onClick={(event) => {
                  event.preventDefault();
                  onCreateAccount?.();
                }}
                className="text-accent transition-colors hover:underline"
              >
                {createAccountLabel}
              </a>
            </p>

            {footer ? <div className="animate-element animate-delay-1000">{footer}</div> : null}
          </div>
        </div>
      </section>

      {heroImageSrc ? (
        <section className="relative hidden flex-1 p-4 md:block">
          <div
            className="animate-slide-right animate-delay-300 absolute inset-4 rounded-[2rem] bg-cover bg-center"
            style={{ backgroundImage: `url(${heroImageSrc})` }}
          />
          <div className="absolute inset-4 rounded-[2rem] bg-[linear-gradient(180deg,hsl(var(--color-bg)/0.1),hsl(var(--color-bg)/0.16)_28%,hsl(var(--color-bg)/0.88)_92%)]" />
          {testimonials.length > 0 ? (
            <div className="absolute bottom-8 left-1/2 flex w-full -translate-x-1/2 justify-center gap-4 px-8">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] ? (
                <div className="hidden xl:flex">
                  <TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" />
                </div>
              ) : null}
              {testimonials[2] ? (
                <div className="hidden 2xl:flex">
                  <TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" />
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};
