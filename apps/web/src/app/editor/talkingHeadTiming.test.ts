import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEditedSegments, remapWords, sourceToTimeline } from './talkingHeadTiming.ts';

test('keeps entire recording when no pauses are removed', () => {
  assert.deepEqual(buildEditedSegments(10, []), [
    { sourceStart: 0, sourceEnd: 10, timelineStart: 0, duration: 10 },
  ]);
});

test('merges overlapping pauses and builds contiguous edited timeline', () => {
  const segments = buildEditedSegments(12, [
    { start: 8, end: 9 },
    { start: 2, end: 3 },
    { start: 2.5, end: 4 },
  ]);
  assert.deepEqual(segments, [
    { sourceStart: 0, sourceEnd: 2, timelineStart: 0, duration: 2 },
    { sourceStart: 4, sourceEnd: 8, timelineStart: 2, duration: 4 },
    { sourceStart: 9, sourceEnd: 12, timelineStart: 6, duration: 3 },
  ]);
  assert.equal(sourceToTimeline(5, segments), 3);
  assert.equal(sourceToTimeline(3, segments), null);
  assert.equal(sourceToTimeline(9, segments), 6);
});

test('drops short retained fragments', () => {
  assert.deepEqual(buildEditedSegments(3, [{ start: 0.1, end: 1 }]), [
    { sourceStart: 1, sourceEnd: 3, timelineStart: 0, duration: 2 },
  ]);
});

test('rejects invalid intervals', () => {
  assert.throws(() => buildEditedSegments(5, [{ start: -1, end: 2 }]), /Invalid removal/);
  assert.throws(() => buildEditedSegments(5, [{ start: 2, end: 7 }]), /Invalid removal/);
  assert.throws(() => buildEditedSegments(0, []), /Invalid source/);
});

test('remaps captions to new timeline after silence removal', () => {
  const segments = buildEditedSegments(8, [{ start: 2, end: 4 }]);
  assert.deepEqual(remapWords([
    { text: 'hello', start: 0.5, end: 1 },
    { text: 'world', start: 4.5, end: 5 },
    { text: 'silence', start: 2.5, end: 3 },
  ], segments), [
    { text: 'hello', sourceStart: 0.5, sourceEnd: 1, start: 0.5, end: 1 },
    { text: 'world', sourceStart: 4.5, sourceEnd: 5, start: 2.5, end: 3 },
  ]);
});

test('splits a word intersecting a cut instead of drifting', () => {
  const segments = buildEditedSegments(5, [{ start: 2, end: 3 }]);
  assert.deepEqual(remapWords([{ text: 'long', start: 1.5, end: 3.5 }], segments), [
    { text: 'long', sourceStart: 1.5, sourceEnd: 2, start: 1.5, end: 2 },
    { text: 'long', sourceStart: 3, sourceEnd: 3.5, start: 2, end: 2.5 },
  ]);
});
