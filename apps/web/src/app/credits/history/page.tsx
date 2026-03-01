'use client';

import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';

import { Card } from '@/components/ui/Card';
import { api } from '@/lib/api';
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
      <Card className="flex items-center gap-3">
        <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--color-accent))]" />
        <p className="text-sm text-muted">Loading credit history...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <h1 className="font-heading text-2xl font-extrabold tracking-tight text-text">Credit History</h1>
        <p className="mt-1 text-sm text-muted">Full audit log of premium usage, free runs, top-ups, and monthly resets.</p>
      </Card>

      {error ? (
        <Card>
          <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No credit history yet.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="min-w-full divide-y divide-[hsl(var(--color-border))] text-sm">
            <thead className="bg-[hsl(var(--color-bg))]">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-text">Feature</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Credits</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Date / Time</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Balance After</th>
                <th className="px-4 py-3 text-left font-semibold text-text">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[hsl(var(--color-border))] bg-[hsl(var(--color-surface))]">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3 text-text">{item.featureName}</td>
                  <td className="px-4 py-3 text-text">
                    {item.transactionType === 'credit' ? '+' : '-'}
                    {item.creditsUsed}
                  </td>
                  <td className="px-4 py-3 text-muted">{new Date(item.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-muted">{item.remainingBalance}</td>
                  <td className="px-4 py-3 text-muted">{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
