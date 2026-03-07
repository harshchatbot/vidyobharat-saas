'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { estimateCreditsLocal } from '@/lib/credits/estimator';
import type { CreditEstimateResponse } from '@/types/api';

export type CreditEstimateRequest = {
  key: string;
  action: string;
  payload: Record<string, unknown>;
  enabled?: boolean;
};

type CreditEstimateMap = Record<string, CreditEstimateResponse>;

type UseCreditEstimatorOptions = {
  currentCredits: number;
  debounceMs?: number;
};

type UseCreditEstimatorResult = {
  estimates: CreditEstimateMap;
  isEstimating: boolean;
  estimateError: string | null;
  isUsingFallback: boolean;
  refreshEstimate: () => void;
};

const estimateCache = new Map<string, CreditEstimateMap>();

function buildCacheKey(requests: CreditEstimateRequest[], currentCredits: number): string {
  return JSON.stringify({
    currentCredits,
    requests: requests
      .filter((item) => item.enabled !== false)
      .map((item) => ({
        key: item.key,
        action: item.action,
        payload: item.payload,
      })),
  });
}

export function useCreditEstimator(
  requests: CreditEstimateRequest[],
  options: UseCreditEstimatorOptions,
): UseCreditEstimatorResult {
  const { currentCredits, debounceMs = 220 } = options;
  const [estimates, setEstimates] = useState<CreditEstimateMap>({});
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const timerRef = useRef<number | null>(null);

  const cacheKey = useMemo(
    () => buildCacheKey(requests, currentCredits),
    [requests, currentCredits],
  );

  const compute = useCallback(() => {
    const next: CreditEstimateMap = {};
    for (const request of requests) {
      if (request.enabled === false) continue;
      next[request.key] = estimateCreditsLocal(request.action, request.payload, currentCredits);
    }
    estimateCache.set(cacheKey, next);
    return next;
  }, [requests, currentCredits, cacheKey]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    const cached = estimateCache.get(cacheKey);
    if (cached) {
      setEstimates(cached);
      setEstimateError(null);
      setIsEstimating(false);
      return;
    }

    setIsEstimating(true);
    timerRef.current = window.setTimeout(() => {
      try {
        const next = compute();
        setEstimates(next);
        setEstimateError(null);
      } catch {
        setEstimateError('Could not estimate credits right now.');
      } finally {
        setIsEstimating(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [cacheKey, compute, debounceMs, nonce]);

  return {
    estimates,
    isEstimating,
    estimateError,
    isUsingFallback: true,
    refreshEstimate: () => setNonce((value) => value + 1),
  };
}
