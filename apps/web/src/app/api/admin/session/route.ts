import { NextRequest, NextResponse } from 'next/server';

import { getApiUrl } from '@/lib/env';

const COOKIE = 'rangmanch_admin_session';
const MAX_AGE = 55 * 60;

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  return Boolean(origin && origin === new URL(request.url).origin);
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request) || request.headers.get('x-rangmanch-admin-csrf') !== '1') {
    return NextResponse.json({ detail: 'Admin session request was rejected.' }, { status: 403 });
  }
  const body = await request.json().catch(() => null) as { idToken?: unknown } | null;
  if (!body || typeof body.idToken !== 'string' || body.idToken.length > 10000) {
    return NextResponse.json({ detail: 'A Firebase ID token is required.' }, { status: 400 });
  }
  const verified = await fetch(`${getApiUrl()}/api/admin/me`, {
    headers: { Authorization: `Bearer ${body.idToken}` }, cache: 'no-store',
  }).catch(() => null);
  if (!verified) return NextResponse.json({ detail: 'Admin authentication is unavailable.' }, { status: 503 });
  const verifiedBody = await verified.json().catch(() => ({}));
  if (!verified.ok) {
    return NextResponse.json(
      { detail: typeof verifiedBody?.detail === 'string' ? verifiedBody.detail : 'Admin access denied.' },
      { status: verified.status },
    );
  }
  const response = NextResponse.json({ ok: true, admin: verifiedBody });
  response.cookies.set(COOKIE, body.idToken, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: MAX_AGE,
  });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ admin: null }, { status: 401 });
  const verified = await fetch(`${getApiUrl()}/api/admin/me`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
  }).catch(() => null);
  if (!verified) return NextResponse.json({ detail: 'Admin authentication is unavailable.' }, { status: 503 });
  const body = await verified.json().catch(() => ({}));
  if (!verified.ok) return NextResponse.json({ admin: null }, { status: verified.status });
  return NextResponse.json({ admin: body }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
}

export async function DELETE(request: NextRequest) {
  if (!sameOrigin(request) || request.headers.get('x-rangmanch-admin-csrf') !== '1') {
    return NextResponse.json({ detail: 'Admin logout was rejected.' }, { status: 403 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, '', {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict',
    path: '/', maxAge: 0,
  });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}
