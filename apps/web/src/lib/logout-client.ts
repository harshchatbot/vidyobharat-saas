'use client';

const LOCAL_AUTH_KEYS = [
  'vidyo_access_token',
  'vidyo_user_id',
  'test-user-id',
] as const;

const SESSION_CACHE_PREFIXES = [
  'rangmanch:api-cache:',
  'rangmanch:dashboard:',
  'rangmanch:credit-wallet:',
] as const;

export function clearLocalAuthState() {
  if (typeof window === 'undefined') return;

  try {
    LOCAL_AUTH_KEYS.forEach((key) => window.localStorage.removeItem(key));

    for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (key.startsWith('rangmanch:dashboard:') || key.startsWith('rangmanch:credit-wallet:')) {
        window.localStorage.removeItem(key);
      }
    }

    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key) continue;
      if (SESSION_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        window.sessionStorage.removeItem(key);
      }
    }
  } catch {
    // Ignore storage failures in strict/private browsing contexts.
  }

  window.google?.accounts?.id?.disableAutoSelect?.();
  window.dispatchEvent(new CustomEvent('rangmanch:logged-out'));
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
