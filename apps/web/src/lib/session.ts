import { cookies } from 'next/headers';

const USER_COOKIE = 'vidyo_user_id';
const USER_NAME_COOKIE = 'vidyo_user_name';
const USER_EMAIL_COOKIE = 'vidyo_user_email';
const USER_AVATAR_COOKIE = 'vidyo_user_avatar';
const USER_ACCESS_TOKEN_COOKIE = 'vidyo_access_token';

export async function getUserIdFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}

export async function setUserIdCookie(userId: string): Promise<void> {
  const store = await cookies();
  store.set(USER_COOKIE, userId, { httpOnly: false, sameSite: 'lax', path: '/' });
}

export async function getUserNameFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_NAME_COOKIE)?.value ?? null;
}

export async function setUserNameCookie(userName: string): Promise<void> {
  const store = await cookies();
  store.set(USER_NAME_COOKIE, userName, { httpOnly: false, sameSite: 'lax', path: '/' });
}

export async function getUserEmailFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_EMAIL_COOKIE)?.value ?? null;
}

export async function setUserEmailCookie(userEmail: string): Promise<void> {
  const store = await cookies();
  store.set(USER_EMAIL_COOKIE, userEmail, { httpOnly: false, sameSite: 'lax', path: '/' });
}

export async function getUserAvatarFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_AVATAR_COOKIE)?.value || null;
}

export async function setUserAvatarCookie(userAvatar: string): Promise<void> {
  const store = await cookies();
  store.set(USER_AVATAR_COOKIE, userAvatar, { httpOnly: false, sameSite: 'lax', path: '/' });
}

export async function clearUserIdCookie(): Promise<void> {
  const store = await cookies();
  store.delete(USER_COOKIE);
  store.delete(USER_NAME_COOKIE);
  store.delete(USER_EMAIL_COOKIE);
  store.delete(USER_AVATAR_COOKIE);
  store.delete(USER_ACCESS_TOKEN_COOKIE);
}

export async function getUserAccessTokenFromCookie(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_ACCESS_TOKEN_COOKIE)?.value ?? null;
}

export async function setUserAccessTokenCookie(accessToken: string): Promise<void> {
  const store = await cookies();
  store.set(USER_ACCESS_TOKEN_COOKIE, accessToken, { httpOnly: false, sameSite: 'lax', path: '/' });
}
