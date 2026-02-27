import { cookies } from 'next/headers';

const USER_COOKIE = 'vidyo_user_id';

export async function getUserIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}

export async function setUserIdCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, { httpOnly: false, sameSite: 'lax', path: '/' });
}

export async function clearUserIdCookie(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
}
