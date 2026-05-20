'use client';

import { useMemo } from 'react';
import { TrendingUp, Calendar } from 'lucide-react';
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card } from '@/components/ui/Card';
import type { CreditHistoryItem } from '@/types/api';

interface SpendingByFeature {
  name: string;
  credits: number;
}

interface DailyUsage {
  date: string;
  credits: number;
}

interface CreditsAnalyticsProps {
  history: CreditHistoryItem[];
}

// Comprehensive feature name mapping covering all variants
const FEATURE_LABELS: Record<string, string> = {
  tts_preview_standalone: 'Voice Preview',
  tts_preview: 'Voice Preview',
  standalone_tts_preview: 'Voice Preview',
  avatar_product: 'UGC Ad',
  avatar_product_mock: 'UGC Ad (Mock)',
  video_create: 'Video',
  video_create_mock: 'Video (Mock)',
  video_create_mod: 'Video (Mock)',
  'video_create mock': 'Video (Mock)',
  storyboard_video: 'Storyboard Video',
  storyboard_video_mock: 'Storyboard Video',
  storyboard_initialize: 'Storyboard',
  script_generate: 'Script',
  image_create: 'Image',
  lipsync: 'Lip Sync',
  audio_generate: 'Audio',
};

function getFeatureLabel(featureKey: string): string {
  return FEATURE_LABELS[featureKey] || featureKey
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .slice(0, 16);
}

function getSpendingByFeature(history: CreditHistoryItem[]): SpendingByFeature[] {
  const spending: Record<string, number> = {};

  history.forEach(item => {
    if (item.transactionType === 'debit') {
      const feat = item.featureName || 'other';
      spending[feat] = (spending[feat] || 0) + item.creditsUsed;
    }
  });

  const byFeature = Object.entries(spending)
    .map(([feature, credits]) => ({
      name: getFeatureLabel(feature),
      credits,
    }))
    .sort((a, b) => b.credits - a.credits);

  // Merge entries with same label (handles duplicates like "Voice Preview")
  const merged = byFeature.reduce((acc, item) => {
    const existing = acc.find(x => x.name === item.name);
    if (existing) {
      existing.credits += item.credits;
    } else {
      acc.push({ ...item });
    }
    return acc;
  }, [] as { name: string; credits: number }[]);

  // Sort merged entries by credits descending
  merged.sort((a, b) => b.credits - a.credits);

  return merged.slice(0, 6);
}

function getDailyUsage(history: CreditHistoryItem[]): DailyUsage[] {
  const daily: Record<string, number> = {};
  const now = new Date();

  // Initialize last 30 days
  for (let i = 29; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split('T')[0];
    daily[key] = 0;
  }

  // Add spending data
  history.forEach(item => {
    const date = new Date(item.createdAt).toISOString().split('T')[0];
    if (date in daily && item.transactionType === 'debit') {
      daily[date] += item.creditsUsed;
    }
  });

  return Object.entries(daily).map(([date, credits]) => ({
    date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    credits,
  }));
}

export function CreditsAnalytics({ history }: CreditsAnalyticsProps) {
  const spendingByFeature = useMemo(() => getSpendingByFeature(history), [history]);
  const dailyUsage = useMemo(() => getDailyUsage(history), [history]);

  const totalSpent = useMemo(() =>
    history.reduce((sum, item) => sum + (item.transactionType === 'debit' ? item.creditsUsed : 0), 0),
    [history]
  );

  const avgDailySpend = useMemo(() => Math.round(totalSpent / 30), [totalSpent]);

  const thisMonth = useMemo(() => {
    const now = new Date();
    return history
      .filter(t => {
        if (t.transactionType !== 'debit') return false;
        const d = new Date(t.createdAt);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, t) => sum + t.creditsUsed, 0);
  }, [history]);

  const topFeature = useMemo(() => spendingByFeature[0]?.name || 'N/A', [spendingByFeature]);

  if (history.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Stats Row - 4 Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Card className="rangmanch-studio-panel space-y-2 border-none bg-transparent">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-primary)/0.14)] text-[hsl(var(--color-primary))]">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Total spent (all-time)</p>
          <p className="font-heading text-xl font-extrabold text-text sm:text-2xl">{totalSpent}</p>
        </Card>

        <Card className="rangmanch-studio-panel space-y-2 border-none bg-transparent">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-primary)/0.14)] text-[hsl(var(--color-primary))]">
            <Calendar className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Spent this month</p>
          <p className="font-heading text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[hsl(var(--color-primary))] to-[hsl(var(--color-accent-pink))] sm:text-2xl">
            {thisMonth}
          </p>
        </Card>

        <Card className="rangmanch-studio-panel space-y-2 border-none bg-transparent">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-primary)/0.14)] text-[hsl(var(--color-primary))]">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Avg daily spend</p>
          <p className="font-heading text-xl font-extrabold text-text sm:text-2xl">{avgDailySpend}</p>
        </Card>

        <Card className="rangmanch-studio-panel space-y-2 border-none bg-transparent">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--color-primary)/0.14)] text-[hsl(var(--color-primary))]">
            <TrendingUp className="h-5 w-5" />
          </div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted">Top feature</p>
          <p className="font-heading text-xl font-extrabold text-text sm:text-2xl truncate">{topFeature}</p>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Spending by Feature Bar Chart */}
        {spendingByFeature.length > 0 && (
          <Card className="rangmanch-studio-panel border-none bg-transparent p-4">
            <p className="mb-4 text-sm font-semibold text-text">Spending by feature</p>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart
                data={spendingByFeature}
                margin={{ top: 8, right: 8, left: -20, bottom: 60 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--color-border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="name"
                  tick={{ fill: 'hsl(var(--color-muted))', fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                  angle={-35}
                  textAnchor="end"
                  height={60}
                  interval={0}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--color-muted))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--color-surface))',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: 'var(--radius-md)',
                    color: 'hsl(var(--color-text))',
                    fontSize: 12,
                  }}
                  formatter={(value: unknown) => [`${Number(value)} credits`, 'Spent']}
                />
                <Bar
                  dataKey="credits"
                  fill="hsl(var(--color-primary))"
                  radius={[6, 6, 0, 0]}
                  animationDuration={600}
                />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Daily Usage Area Chart */}
        {dailyUsage.length > 0 && (
          <Card className="rangmanch-studio-panel border-none bg-transparent p-4">
            <p className="mb-4 text-sm font-semibold text-text">Daily spending (30 days)</p>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={dailyUsage} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCredits" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="5%"
                      stopColor="hsl(var(--color-primary))"
                      stopOpacity={0.8}
                    />
                    <stop
                      offset="95%"
                      stopColor="hsl(var(--color-primary))"
                      stopOpacity={0.1}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--color-border))"
                  vertical={false}
                />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'hsl(var(--color-muted))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'hsl(var(--color-muted))', fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--color-surface))',
                    border: '1px solid hsl(var(--color-border))',
                    borderRadius: 'var(--radius-md)',
                    color: 'hsl(var(--color-text))',
                    fontSize: 12,
                  }}
                  formatter={(value: unknown) => [`${Number(value)} credits`, 'Spent']}
                />
                <Area
                  type="monotone"
                  dataKey="credits"
                  stroke="hsl(var(--color-primary))"
                  fill="url(#colorCredits)"
                  animationDuration={600}
                  isAnimationActive={true}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        )}
      </div>
    </div>
  );
}
