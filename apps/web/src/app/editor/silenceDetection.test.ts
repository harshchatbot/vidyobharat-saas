import assert from 'node:assert/strict';
import test from 'node:test';
import { detectSilence } from './silenceDetection.ts';

const samples = (sections: Array<[number, number]>, rate = 1000): Float32Array =>
  Float32Array.from(sections.flatMap(([seconds, amplitude]) =>
    Array(Math.round(seconds * rate)).fill(amplitude)));

test('detects an interior pause while preserving speech padding', () => {
  const result = detectSilence(samples([[1, 0.4], [1, 0], [1, 0.4]]), 1000);
  assert.deepEqual(result.removals, [{ start: 1.12, end: 1.88 }]);
});

test('removes leading and trailing dead air', () => {
  const result = detectSilence(samples([[0.8, 0], [1, 0.4], [0.8, 0]]), 1000);
  assert.deepEqual(result.removals, [{ start: 0, end: 0.68 }, { start: 1.92, end: 2.6 }]);
});

test('does not remove short natural pauses', () => {
  assert.deepEqual(detectSilence(samples([[1, 0.4], [0.3, 0], [1, 0.4]]), 1000).removals, []);
});

test('does not remove quiet but audible speech above threshold', () => {
  assert.deepEqual(detectSilence(samples([[1, 0.025]]), 1000).removals, []);
});

test('supports custom thresholds and minimum pause lengths', () => {
  const result = detectSilence(samples([[1, 0.1], [0.4, 0.01], [1, 0.1]]), 1000, {
    threshold: 0.02, minSilenceSeconds: 0.35, speechPaddingSeconds: 0.05,
  });
  assert.equal(result.removals.length, 1);
  assert.ok(Math.abs(result.removals[0].start - 1.05) < 1e-6);
  assert.ok(Math.abs(result.removals[0].end - 1.35) < 1e-6);
});

test('rejects invalid analysis parameters', () => {
  assert.throws(() => detectSilence(new Float32Array(10), 0), /Invalid sample rate/);
  assert.throws(() => detectSilence(new Float32Array(10), 1000, { threshold: 2 }), /Invalid silence/);
});
