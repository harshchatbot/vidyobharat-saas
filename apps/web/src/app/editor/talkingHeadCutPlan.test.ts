import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTalkingHeadCutPlan } from './talkingHeadCutPlan.ts';
import type { VideoTimelineItem } from './timeline/types.ts';

const video: VideoTimelineItem = {
  id: 'recording', kind: 'video', trackId: 'video', label: 'Recording',
  mediaId: 'video-1', contentType: 'video/mp4', startTime: 0, duration: 10,
  sourceStart: 0, cropMode: 'cover', muted: false, volume: 0.8,
};

test('generates contiguous clips with source offsets after silence removal', () => {
  const plan = buildTalkingHeadCutPlan({
    video, sourceDuration: 10, removals: [{ start: 2, end: 4 }, { start: 7, end: 8 }],
    voiceMediaId: 'voice-1',
  });
  assert.deepEqual(plan.video.map(({ startTime, sourceStart, duration }) => ({ startTime, sourceStart, duration })), [
    { startTime: 0, sourceStart: 0, duration: 2 },
    { startTime: 2, sourceStart: 4, duration: 3 },
    { startTime: 5, sourceStart: 8, duration: 2 },
  ]);
  assert.deepEqual(plan.voice.map(({ startTime, sourceStart, duration }) => ({ startTime, sourceStart, duration })),
    plan.video.map(({ startTime, sourceStart, duration }) => ({ startTime, sourceStart, duration })));
  assert.equal(plan.editedDuration, 7);
  assert.equal(plan.removedDuration, 3);
  assert.equal(plan.voice[0].volume, 0.8);
});

test('does not fabricate a voice track if extraction has not happened', () => {
  const plan = buildTalkingHeadCutPlan({ video, sourceDuration: 10, removals: [] });
  assert.equal(plan.voice.length, 0);
  assert.equal(plan.video.length, 1);
});

test('rejects a clip whose timing does not match the analyzed source', () => {
  assert.throws(() => buildTalkingHeadCutPlan({
    video: { ...video, sourceStart: 1 }, sourceDuration: 10, removals: [],
  }), /untrimmed/);
  assert.throws(() => buildTalkingHeadCutPlan({
    video, sourceDuration: 9, removals: [],
  }), /must match/);
});

test('rejects edits removing all usable footage', () => {
  assert.throws(() => buildTalkingHeadCutPlan({
    video, sourceDuration: 10, removals: [{ start: 0, end: 10 }],
  }), /No usable footage/);
});
