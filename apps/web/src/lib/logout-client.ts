'use client';

const LOCAL_AUTH_KEYS = [
  'vidyo_access_token',
  'vidyo_user_id',
] as const;

export function clearLocalAuthState() {
  if (typeof window === 'undefined') return;

  try {
    LOCAL_AUTH_KEYS.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // Ignore storage failures in strict/private browsing contexts.
  }

  window.google?.accounts?.id?.disableAutoSelect?.();
}

export async function clearServerSession() {
  try {
    await fetch('/api/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      cache: 'no-store',
      keepalive: true,
    });
  } catch {
    // Navigation should not be blocked by session cleanup network failures.
  }
}
