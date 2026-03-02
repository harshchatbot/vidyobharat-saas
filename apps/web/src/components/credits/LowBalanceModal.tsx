'use client';

import Link from 'next/link';
import { AlertTriangle, Coins, Wallet } from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import type { CreditWallet } from '@/types/api';

export function LowBalanceModal({
  open,
  onClose,
  wallet,
  requiredCredits,
}: {
  open: boolean;
  onClose: () => void;
  wallet: CreditWallet | null;
  requiredCredits?: number;
}) {
  return (
    <Modal open={open} onClose={onClose}>
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[hsl(var(--color-danger)/0.12)] text-[hsl(var(--color-danger))]">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <div>
            <h2 className="font-heading text-xl font-extrabold text-text">Insufficient credits</h2>
            <p className="mt-1 text-sm text-muted">
              This action needs more credits than your wallet currently has. Top up or move to a higher plan before generating.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Current balance</p>
            <p className="mt-2 inline-flex items-center gap-2 text-lg font-semibold text-text">
              <Wallet className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              {wallet?.currentCredits ?? 0} credits
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[hsl(var(--color-border))] bg-[hsl(var(--color-bg))] p-4">
            <p className="text-[11px] uppercase tracking-[0.16em] text-muted">Required for this action</p>
            <p className="mt-2 inline-flex items-center gap-2 text-lg font-semibold text-text">
              <Coins className="h-4 w-4 text-[hsl(var(--color-accent))]" />
              {requiredCredits ?? 0} credits
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/billing" className="flex-1">
            <Button className="w-full">Top-Up Credits</Button>
          </Link>
          <Link href="/pricing" className="flex-1">
            <Button variant="secondary" className="w-full">View Plans</Button>
          </Link>
        </div>
      </div>
    </Modal>
  );
}
