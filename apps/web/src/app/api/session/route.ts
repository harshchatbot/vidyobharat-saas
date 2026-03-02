import { NextRequest, NextResponse } from 'next/server';

import {
  clearUserIdCookie,
  setUserAccessTokenCookie,
  setUserAvatarCookie,
  setUserEmailCookie,
  setUserIdCookie,
  setUserNameCookie,
} from '@/lib/session';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ detail: 'Invalid session payload' }, { status: 400 });
  }

  const { userId, accessToken, name, email, avatarUrl } = body as {
    userId?: string;
    accessToken?: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
  };

  if (typeof userId === 'string' && userId) {
    await setUserIdCookie(userId);
  }
  if (typeof accessToken === 'string' && accessToken) {
    await setUserAccessTokenCookie(accessToken);
  }

  if (typeof name === 'string') {
    await setUserNameCookie(name);
  }
  if (typeof email === 'string') {
    await setUserEmailCookie(email);
  }
  if (typeof avatarUrl === 'string') {
    await setUserAvatarCookie(avatarUrl);
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await clearUserIdCookie();
  return NextResponse.json({ ok: true });
}
