'use client';

export function getCurrentUserId(): string | null {
  if (typeof window === 'undefined') return null;

  const realUserId = window.localStorage.getItem('vidyo_user_id');
  if (realUserId && realUserId.trim()) return realUserId.trim();

  const testUserId = window.localStorage.getItem('test-user-id');
  if (testUserId && testUserId.trim()) return testUserId.trim();

  return null;
}

export function getCurrentUserIdOrThrow(context: string): string {
  const userId = getCurrentUserId();
  if (userId) return userId;
  throw new Error(`${context}: Missing user identity. Please sign in again.`);
}
