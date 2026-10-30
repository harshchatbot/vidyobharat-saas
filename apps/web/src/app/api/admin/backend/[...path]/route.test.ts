import assert from 'node:assert/strict';
import test from 'node:test';
import { NextRequest } from 'next/server';
import { POST } from './route';
import { SAFE_PATH } from '../routeSecurity';

test('allows only the exact existing-audio registration path', () => {
  assert.equal(SAFE_PATH.test('audio-library/register'), true);
  assert.equal(SAFE_PATH.test('audio-library/register/extra'), false);
  assert.equal(SAFE_PATH.test('audio-library/../../users'), false);
});

test('admin registration proxy forwards an allowed mutation with CSRF and cookie', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    assert.equal(String(input), 'http://localhost:8000/api/admin/audio-library/register');
    return new Response(JSON.stringify({ id: 'draft-id' }), { status: 201, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  try {
    const request = new NextRequest('https://rangmanch.test/api/admin/backend/audio-library/register', {
      method: 'POST', headers: { origin: 'https://rangmanch.test', 'x-rangmanch-admin-csrf': '1', 'content-type': 'application/json', cookie: 'rangmanch_admin_session=verified-token' }, body: '{}',
    });
    const response = await POST(request, { params: Promise.resolve({ path: ['audio-library', 'register'] }) });
    assert.equal(response.status, 201);
  } finally { globalThis.fetch = originalFetch; }
});

test('guest and creator cookies cannot authorize registration', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ detail: 'Admin access denied.' }), { status: 403 })) as typeof fetch;
  try {
    const guest = new NextRequest('https://rangmanch.test/api/admin/backend/audio-library/register', { method: 'POST', headers: { origin: 'https://rangmanch.test', 'x-rangmanch-admin-csrf': '1' } });
    assert.equal((await POST(guest, { params: Promise.resolve({ path: ['audio-library', 'register'] }) })).status, 401);
    const creator = new NextRequest('https://rangmanch.test/api/admin/backend/audio-library/register', { method: 'POST', headers: { origin: 'https://rangmanch.test', 'x-rangmanch-admin-csrf': '1', cookie: 'vidyo_user_id=creator-only' } });
    assert.equal((await POST(creator, { params: Promise.resolve({ path: ['audio-library', 'register'] }) })).status, 403);
  } finally { globalThis.fetch = originalFetch; }
});
