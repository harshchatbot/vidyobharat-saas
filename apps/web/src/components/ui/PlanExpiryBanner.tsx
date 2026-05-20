'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';
import { api } from '@/lib/api';

interface PlanStatus {
  plan_name: string | null;
  billing_cycle: string | null;
  credits_expires_at: string | null;
  days_until_expiry: number | null;
  is_expired: boolean;
  current_credits: number;
  plan_activated_at: string | null;
}

export function PlanExpiryBanner() {
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPlanStatus = async () => {
      try {
        const response = await fetch('/api/plan', {
          headers: { 'X-User-ID': 'current-user' },
        });
        if (response.ok) {
          const data = await response.json();
          setPlanStatus(data);
        }
      } catch (err) {
        console.error('Failed to load plan status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchPlanStatus();
  }, []);

  if (loading || !planStatus) {
    return null;
  }

  // Don't show banner if user is on free plan or credits don't expire
  if (!planStatus.credits_expires_at || planStatus.plan_name === 'free') {
    return null;
  }

  // Show warning if expiring within 7 days
  if (!planStatus.is_expired && planStatus.days_until_expiry !== null && planStatus.days_until_expiry > 7) {
    return null;
  }

  if (planStatus.is_expired) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 mb-4"
        style={{
          border: '1px solid hsl(var(--color-danger) / 0.4)',
          background: 'hsl(var(--color-danger) / 0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          <AlertTriangle
            className="h-5 w-5"
            style={{ color: 'hsl(var(--color-danger))' }}
          />
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Your {planStatus.plan_name} plan has expired
            </p>
            <p
              className="text-xs"
              style={{ color: 'hsl(var(--color-muted))' }}
            >
              Renew your plan to continue creating content
            </p>
          </div>
        </div>
        <Link
          href="/pricing"
          className="text-xs font-semibold px-4 py-2 rounded-md whitespace-nowrap"
          style={{
            background: 'hsl(var(--color-danger))',
            color: 'white',
          }}
        >
          Renew Now
        </Link>
      </div>
    );
  }

  // Show warning if expiring soon (≤7 days)
  if (planStatus.days_until_expiry !== null && planStatus.days_until_expiry <= 7) {
    return (
      <div
        className="flex items-center justify-between gap-3 rounded-lg px-4 py-3 mb-4"
        style={{
          border: '1px solid hsl(var(--color-warning) / 0.4)',
          background: 'hsl(var(--color-warning) / 0.06)',
        }}
      >
        <div className="flex items-center gap-3">
          <Clock
            className="h-5 w-5"
            style={{ color: 'hsl(var(--color-warning))' }}
          />
          <div>
            <p
              className="text-sm font-semibold"
              style={{ color: 'hsl(var(--color-text))' }}
            >
              Your {planStatus.plan_name} plan expires in{' '}
              <strong>{planStatus.days_until_expiry} day{planStatus.days_until_expiry !== 1 ? 's' : ''}</strong>
            </p>
            <p
              className="text-xs"
              style={{ color: 'hsl(var(--color-muted))' }}
            >
              Renew to keep creating without interruptions
            </p>
          </div>
        </div>
        <Link
          href="/pricing"
          className="text-xs font-semibold px-4 py-2 rounded-md whitespace-nowrap"
          style={{
            background: 'hsl(var(--color-primary))',
            color: 'hsl(var(--color-primary-contrast))',
          }}
        >
          Renew
        </Link>
      </div>
    );
  }

  return null;
}
