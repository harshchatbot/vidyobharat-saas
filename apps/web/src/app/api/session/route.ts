import { NextRequest, NextResponse } from 'next/server';

import { setUserAvatarCookie, setUserEmailCookie, setUserNameCookie } from '@/lib/session';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ detail: 'Invalid session payload' }, { status: 400 });
  }

  const { name, email, avatarUrl } = body as { name?: string; email?: string; avatarUrl?: string };

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
