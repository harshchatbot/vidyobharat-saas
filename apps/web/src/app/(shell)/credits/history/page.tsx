'use client';

import { useEffect, useState } from 'react';

import { Card } from '@/components/ui/Card';
import { PacmanLoader } from '@/components/ui/PacmanLoader';
import { StatusChip } from '@/components/ui/StatusChip';
import { StudioPageHeader } from '@/components/ui/StudioPageHeader';
import { api } from '@/lib/api';
import { formatCreditFeatureLabel, formatCreditSourceLabel } from '@/lib/credits/historyLabels';
import type { CreditHistoryItem } from '@/types/api';

function getUserIdFromCookie() {
  return document.cookie
    .split('; ')
    .find((item) => item.startsWith('vidyo_user_id='))
    ?.split('=')[1] ?? null;
}

export default function CreditHistoryPage() {
  const [items, setItems] = useState<CreditHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const userId = getUserIdFromCookie();
    if (!userId) {
      setLoading(false);
      return;
    }
    void api.getCreditHistory(userId, 200)
      .then((response) => setItems(response.items))
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load credit history.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card className="rangmanch-studio-panel border-none bg-transparent backdrop-blur-md">
        <PacmanLoader centered size="md" label="Loading credit history..." />
      </Card>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <StudioPageHeader
        eyebrow="Credits"
        title="Credit history"
        description="Full audit log of premium usage, top-ups, free runs, and monthly resets across your workspace."
      />

      {error ? (
        <Card className="rangmanch-studio-panel border-none bg-transparent backdrop-blur-md">
          <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="rangmanch-studio-panel border-none bg-transparent backdrop-blur-md">
          <p className="text-sm text-muted">No credit history yet.</p>
        </Card>
      ) : (
        <Card className="rangmanch-studio-panel overflow-x-auto border-none bg-transparent p-0 backdrop-blur-md">
          <table className="min-w-full divide-y divide-[hsl(var(--color-border))] text-sm">
            <thead className="bg-[hsl(var(--color-bg)/0.72)]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text">Feature</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Credits</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Date / Time</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Balance After</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.7)]">
              {items.map((item) => (
                <tr key={item.id} className="transition hover:bg-[hsl(var(--color-bg)/0.56)]">
                  <td className="px-4 py-3 text-text">{formatCreditFeatureLabel(item)}</td>
                  <td className="px-4 py-3 text-text">
                    <StatusChip variant={item.transactionType === 'credit' ? 'success' : 'default'}>
                      {item.transactionType === 'credit' ? '+' : '-'}
                      {item.creditsUsed}
                    </StatusChip>
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted">{item.remainingBalance}</td>
                  <td className="px-4 py-3 text-muted">{formatCreditSourceLabel(item)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
