import assert from 'node:assert/strict';
import test from 'node:test';
import { parseFaceGuidance, captionPlacement, centeredZoomAllowed, sourceAtTimeline } from './faceAwarePlanning.ts';

const report = {
  schema_version: '2.0',
  media: { media_id: 'video-1' },
  visual: { face_status: 'complete' },
  speech: { segments: [{ id: 'seg_001', start: 0.5, end: 3.5 }] },
  creative_guidance: {
    auto_apply: false,
    caption_placements: [{
      segment_id: 'seg_001', status: 'suggested',
      x: 0.5, y: 0.19, width: 0.84,
    }],
    zoom_framing: [{
      segment_id: 'seg_001', status: 'suggested',
      max_scale: 1.06,
    }],
  },
};

test('validates the owner-matched analysis and maps safe caption', () => {
  const guidance = parseFaceGuidance(report, 'video-1');
  assert.ok(guidance);
  assert.deepEqual(captionPlacement(1, guidance), { x: 0.5, y: 0.19, width: 0.84 });
  assert.equal(centeredZoomAllowed(1, guidance), true);
  assert.equal(captionPlacement(8, guidance), null);
});

test('missing face status, wrong media and malformed geometry fail closed', () => {
  assert.equal(parseFaceGuidance(report, 'another-video'), null);
  assert.equal(parseFaceGuidance({ ...report, visual: { face_status: 'unavailable' } }, 'video-1'), null);
  assert.equal(parseFaceGuidance({
    ...report, creative_guidance: {
      ...report.creative_guidance,
      caption_placements: [{ ...report.creative_guidance.caption_placements[0], y: 1.5 }],
    },
  }, 'video-1'), null);
});

test('timeline-to-original mapping accounts for removed pauses', () => {
  const segments = [
    { sourceStart: 0, sourceEnd: 2, timelineStart: 0, duration: 2 },
    { sourceStart: 3, sourceEnd: 5, timelineStart: 2, duration: 2 },
  ];
  assert.equal(sourceAtTimeline(2.5, segments), 3.5);
  assert.equal(sourceAtTimeline(99, segments), null);
});
