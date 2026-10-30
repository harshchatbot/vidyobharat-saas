import assert from 'node:assert/strict';
import test from 'node:test';
import { detectBeatsFromSamples, snapDurationsToBeats } from './beatDetection.ts';

test('detects candidate beats in synthetic rhythmic audio', () => {
  const sampleRate = 8000;
  const samples = new Float32Array(sampleRate * 4);
  for (const time of [0.5, 1.5, 2.5, 3.5]) {
    const start = Math.floor(time * sampleRate);
    for (let index = start; index < start + 180; index += 1) samples[index] = Math.sin((index - start) * 0.8) * 0.95;
  }
  const result = detectBeatsFromSamples(samples, sampleRate);
  assert.ok(result.beats.length >= 2);
  assert.ok(result.confidence > 0);
});

test('silence and weak signals fall back without misleading BPM', () => {
  const silence = detectBeatsFromSamples(new Float32Array(8000 * 3), 8000);
  assert.deepEqual(silence.beats, []);
  assert.equal(silence.bpm, undefined);
  const weak = detectBeatsFromSamples(Float32Array.from({ length: 8000 * 3 }, (_, index) => Math.sin(index / 20) * 0.001), 8000);
  assert.equal(weak.bpm, undefined);
});

test('snaps only strong nearby boundaries and preserves exact duration', () => {
  const durations = snapDurationsToBeats([4, 4, 4], [{ time: 4.08, confidence: 0.9 }, { time: 8.02, confidence: 0.85 }], 12);
  assert.ok(Math.abs(durations[0] - 4.08) < 1e-9);
  assert.ok(Math.abs(durations[1] - 3.94) < 1e-9);
  assert.ok(Math.abs(durations[2] - 3.98) < 1e-9);
  assert.ok(Math.abs(durations.reduce((sum, duration) => sum + duration, 0) - 12) < 1e-9);
  assert.deepEqual(snapDurationsToBeats([4, 4, 4], [{ time: 4.08, confidence: 0.2 }], 12), [4, 4, 4]);
});

test('rejects beat snapping that would violate minimum clip duration', () => {
  assert.deepEqual(snapDurationsToBeats([1, 1, 1], [{ time: 0.1, confidence: 1 }], 3), [1, 1, 1]);
});
