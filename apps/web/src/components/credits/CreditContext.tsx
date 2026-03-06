'use client';

import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useRef, useState } from 'react';

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
const WALLET_CACHE_TTL_MS = 60 * 1000;
const WALLET_REFRESH_THROTTLE_MS = 8 * 1000;

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
  const inFlightRef = useRef<Promise<CreditWallet | null> | null>(null);
  const lastFetchedAtRef = useRef<number>(0);
  const cacheKey = userId ? `rangmanch:credit-wallet:${userId}` : null;

  const persistWalletCache = (nextWallet: CreditWallet) => {
    if (!cacheKey || typeof window === 'undefined') return;
    try {
      window.sessionStorage.setItem(
        cacheKey,
        JSON.stringify({
          ts: Date.now(),
          wallet: nextWallet,
        }),
      );
    } catch {
      // ignore storage write issues
    }
  };

  const readWalletCache = (): CreditWallet | null => {
    if (!cacheKey || typeof window === 'undefined') return null;
    try {
      const raw = window.sessionStorage.getItem(cacheKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts?: number; wallet?: CreditWallet };
      if (!parsed.ts || !parsed.wallet) return null;
      if (Date.now() - parsed.ts > WALLET_CACHE_TTL_MS) return null;
      return parsed.wallet;
    } catch {
      return null;
    }
  };

  const refreshInternal = async (silent = false, force = false): Promise<CreditWallet | null> => {
    if (!userId) {
      setWallet(null);
      setLoading(false);
      return null;
    }

    const now = Date.now();
    if (!force && wallet && now - lastFetchedAtRef.current < WALLET_REFRESH_THROTTLE_MS) {
      return wallet;
    }

    if (inFlightRef.current) {
      const existing = await inFlightRef.current;
      if (!silent) setLoading(false);
      return existing;
    }

    if (!silent) setLoading(true);

    const request = (async () => {
      const nextWallet = await api.getCreditWallet(userId);
      lastFetchedAtRef.current = Date.now();
      setWallet(nextWallet);
      persistWalletCache(nextWallet);
      return nextWallet;
    })();

    inFlightRef.current = request;
    try {
      return await request;
    } finally {
      inFlightRef.current = null;
      if (!silent) setLoading(false);
    }
  };

  const refresh = async () => {
    await refreshInternal(false, true);
  };

  useEffect(() => {
    const cached = readWalletCache();
    if (cached) {
      setWallet(cached);
      setLoading(false);
      lastFetchedAtRef.current = Date.now();
      void refreshInternal(true, false);
    } else {
      void refreshInternal(false, false);
    }
    if (!userId) return;
    const interval = window.setInterval(() => {
      void refreshInternal(true, false);
    }, 45000);
    return () => window.clearInterval(interval);
  }, [userId]);

  const value = useMemo<CreditContextValue>(
    () => ({
      wallet,
      loading,
      refresh,
      applyWallet: (nextWallet: CreditWallet) => {
        setWallet(nextWallet);
        lastFetchedAtRef.current = Date.now();
        persistWalletCache(nextWallet);
      },
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
