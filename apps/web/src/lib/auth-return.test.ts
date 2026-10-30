import assert from 'node:assert/strict';
import test from 'node:test';
import { safeReturnPath } from './auth-return.ts';

test('accepts safe internal return paths', () => {
  assert.equal(safeReturnPath('/editor'), '/editor');
  assert.equal(safeReturnPath('/editor/project-1?tab=timeline'), '/editor/project-1?tab=timeline');
});

test('rejects external, protocol-relative, malformed, and auth-loop destinations', () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil', 'javascript:alert(1)', '/login', '/signup']) {
    assert.equal(safeReturnPath(value), '/dashboard');
  }
});

test('falls back for direct login without a destination', () => {
  assert.equal(safeReturnPath(undefined), '/dashboard');
});
