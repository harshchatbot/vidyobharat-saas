import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_REFERENCE_VIDEO_BYTES, validateReferenceVideo } from './referenceVideo.ts';

test('accepts supported reference video', () => {
  assert.equal(validateReferenceVideo({ name: 'ref.mp4', type: 'video/mp4', size: 1024 }), null);
});

test('rejects unsupported and oversized uploads', () => {
  assert.ok(validateReferenceVideo({ name: 'ref.png', type: 'image/png', size: 1024 }));
  assert.ok(validateReferenceVideo({ name: 'ref.mov', type: 'video/quicktime', size: MAX_REFERENCE_VIDEO_BYTES + 1 }));
});

test('rejects empty files', () => {
  assert.ok(validateReferenceVideo({ name: 'ref.mp4', type: 'video/mp4', size: 0 }));
});
