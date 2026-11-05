import test from 'node:test';
import assert from 'node:assert/strict';
import { SAFE_PATH, MUTATING } from './routeSecurity.ts';

test('admin visual asset proxy allows documented operations', () => {
  for (const path of [
    'me', 'dashboard', 'audio-library', 'visual-assets', 'visual-assets/seed',
    'visual-assets/lut:portra400', 'visual-assets/emoji:brain/upload',
    'visual-assets/emoji%3Abrain/preview', 'visual-assets/music:comical/publish',
    'visual-assets/music:comical/retire',
  ]) assert.equal(SAFE_PATH.test(path), true, path);
});

test('admin asset proxy rejects path traversal and arbitrary API actions', () => {
  for (const path of [
    'visual-assets/../../admin', 'visual-assets/music:comical/delete',
    'visual-assets/evil:fake', 'visual-assets/emoji:brain/download-anything',
    'visual-assets/emoji:brain/preview/more', 'visual-assets/seed/extra',
    'visual-assets/emoji:brain%2Fretire', 'visual-assets//publish',
  ]) assert.equal(SAFE_PATH.test(path), false, path);
  assert.equal(MUTATING.has('POST'), true);
  assert.equal(MUTATING.has('GET'), false);
});
