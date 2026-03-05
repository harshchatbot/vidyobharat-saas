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
      <Card className="flex items-center gap-3 border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.65)] backdrop-blur-md">
        <LoaderCircle className="h-4 w-4 animate-spin text-[hsl(var(--color-accent))]" />
        <p className="text-sm text-muted">Loading credit history...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      <Card
        className="border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.6)] backdrop-blur-md"
        style={{
          background:
            'radial-gradient(circle at top right, hsl(var(--color-accent)/0.16), transparent 45%), linear-gradient(145deg, hsl(var(--color-surface)/0.8), hsl(var(--color-elevated)/0.7))',
        }}
      >
        <h1 className="font-heading text-3xl font-extrabold tracking-tight text-text">Credit History</h1>
        <p className="mt-1 text-sm text-muted">Full audit log of premium usage, free runs, top-ups, and monthly resets.</p>
      </Card>

      {error ? (
        <Card className="border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.6)] backdrop-blur-md">
          <p className="text-sm text-[hsl(var(--color-danger))]">{error}</p>
        </Card>
      ) : items.length === 0 ? (
        <Card className="border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.6)] backdrop-blur-md">
          <p className="text-sm text-muted">No credit history yet.</p>
        </Card>
      ) : (
        <Card className="overflow-x-auto border-[hsl(var(--color-border))] bg-[hsl(var(--color-surface)/0.6)] p-0 backdrop-blur-md">
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
