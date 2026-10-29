import { NextRequest, NextResponse } from 'next/server';

import { getApiUrl } from '@/lib/env';

const COOKIE = 'rangmanch_admin_session';
const SAFE_PATH = /^(me|dashboard|guests(?:\/[A-Za-z0-9_-]{1,128}\/exports)?|config(?:\/audit)?|templates(?:\/[A-Za-z0-9_-]{1,128}(?:\/status)?)?|templates\/upload-preview)$/;
const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: segments } = await context.params;
  const path = segments.join('/');
  const method = request.method.toUpperCase();
  if (!SAFE_PATH.test(path) || !['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return NextResponse.json({ detail: 'Admin route is not allowed.' }, { status: 404 });
  }
  if (MUTATING.has(method)) {
    const origin = request.headers.get('origin');
    if (origin !== new URL(request.url).origin || request.headers.get('x-rangmanch-admin-csrf') !== '1') {
      return NextResponse.json({ detail: 'Admin mutation was rejected.' }, { status: 403 });
    }
  }
  const token = request.cookies.get(COOKIE)?.value;
  if (!token) return NextResponse.json({ detail: 'Admin session has expired.' }, { status: 401 });
  const query = request.nextUrl.search;
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  const contentType = request.headers.get('content-type');
  if (contentType) headers.set('Content-Type', contentType);
  const body = ['GET', 'HEAD'].includes(method) ? undefined : await request.arrayBuffer();
  const upstream = await fetch(`${getApiUrl()}/api/admin/${path}${query}`, {
    method, headers, body, cache: 'no-store', redirect: 'manual',
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ detail: 'Admin service is unavailable.' }, { status: 503 });
  const response = new NextResponse(upstream.body, { status: upstream.status });
  const upstreamType = upstream.headers.get('content-type');
  if (upstreamType) response.headers.set('Content-Type', upstreamType);
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
