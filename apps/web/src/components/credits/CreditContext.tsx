'use client';

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';

import { LowBalanceModal } from '@/components/credits/LowBalanceModal';
import { api } from '@/lib/api';
import type { CreditWallet } from '@/types/api';

type CreditContextValue = {
  wallet: CreditWallet | null;
  loading: boolean;
  refresh: () => Promise<void>;
  applyWallet: (wallet: CreditWallet) => void;
  openLowBalanceModal: (requiredCredits?: number) => void;
};

const CreditContext = createContext<CreditContextValue | null>(null);

export function CreditProvider({
  userId,
  children,
}: PropsWithChildren<{
  userId: string | null;
}>) {
  const [wallet, setWallet] = useState<CreditWallet | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const [lowBalanceOpen, setLowBalanceOpen] = useState(false);
  const [requiredCredits, setRequiredCredits] = useState<number | undefined>(undefined);

  const refresh = async () => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const nextWallet = await api.getCreditWallet(userId);
      setWallet(nextWallet);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    if (!userId) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [userId]);

  const value = useMemo<CreditContextValue>(
    () => ({
      wallet,
      loading,
      refresh,
      applyWallet: setWallet,
      openLowBalanceModal: (nextRequiredCredits?: number) => {
        setRequiredCredits(nextRequiredCredits);
        setLowBalanceOpen(true);
      },
    }),
    [wallet, loading],
  );

  return (
    <CreditContext.Provider value={value}>
      {children}
      <LowBalanceModal
        open={lowBalanceOpen}
        onClose={() => setLowBalanceOpen(false)}
        wallet={wallet}
        requiredCredits={requiredCredits}
      />
    </CreditContext.Provider>
  );
}

export function useCredits() {
  const context = useContext(CreditContext);
  if (!context) {
    throw new Error('useCredits must be used within CreditProvider');
  }
  return context;
}
