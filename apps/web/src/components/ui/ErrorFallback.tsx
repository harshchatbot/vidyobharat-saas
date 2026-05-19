'use client';

import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

interface ErrorFallbackProps {
  error?: Error;
  onRetry?: () => void;
}

export function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="glass-card p-8 max-w-md w-full text-center">
        {/* Error Icon */}
        <div
          className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4"
          style={{
            backgroundColor: `hsl(var(--color-error) / 0.1)`,
            border: `1px solid hsl(var(--color-error) / 0.3)`,
          }}
        >
          <AlertCircle className="h-8 w-8" style={{ color: `hsl(var(--color-error))` }} />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold mb-2" style={{ color: `hsl(var(--color-text))` }}>
          Something went wrong
        </h1>

        {/* Message */}
        <p className="text-sm mb-6" style={{ color: `hsl(var(--color-text-secondary))` }}>
          {error?.message || 'An unexpected error occurred. Please try again.'}
        </p>

        {/* Retry Button */}
        {onRetry && (
          <button onClick={onRetry} className="glow-button w-full mb-3">
            Try Again
          </button>
        )}

        {/* Home Link */}
        <Link
          href="/"
          className="inline-block px-4 py-2 text-sm font-medium transition-colors"
          style={{
            color: `hsl(var(--color-primary))`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.opacity = '0.7';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.opacity = '1';
          }}
        >
          Go to Home
        </Link>
      </div>
    </div>
  );
}
