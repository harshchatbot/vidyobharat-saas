import { describe, expect, it } from 'vitest';
import { MAX_REFERENCE_VIDEO_BYTES, validateReferenceVideo } from './referenceVideo';

describe('reference video validation', () => {
  it('accepts supported media', () => {
    expect(validateReferenceVideo({ name: 'ref.mp4', type: 'video/mp4', size: 1024 })).toBeNull();
  });
  it('rejects unsupported and oversized uploads', () => {
    expect(validateReferenceVideo({ name: 'ref.png', type: 'image/png', size: 1024 })).toBeTruthy();
    expect(validateReferenceVideo({ name: 'ref.mov', type: 'video/quicktime', size: MAX_REFERENCE_VIDEO_BYTES + 1 })).toBeTruthy();
  });
  it('rejects empty files', () => {
    expect(validateReferenceVideo({ name: 'ref.mp4', type: 'video/mp4', size: 0 })).toBeTruthy();
  });
});
