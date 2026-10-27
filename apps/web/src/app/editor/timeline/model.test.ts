import assert from 'node:assert/strict';
import test from 'node:test';
import { addItem, activeItems, moveItem, reorderVideo, resizeItem } from './model.ts';
import { browserEffectStyle, effectsWithTemporaryPreview, validateFilterAmount } from './filters.ts';
import { serializeTimelineProject } from './serialization.ts';
import { moveTextGeometry, resizeTextGeometry } from './textGeometry.ts';
import { createEmptyProject } from './types.ts';

const textItem = {
  id: 'text-1', kind: 'text' as const, trackId: 'text' as const, label: 'Title', text: 'Hello',
  startTime: 2, duration: 5, fontFamily: 'Inter' as const, fontSize: 40, color: '#ffffff', bold: false,
  x: 0.5, y: 0.5, width: 0.8, rotation: 0, alignment: 'center' as const,
  outlineColor: '#000000', outlineWidth: 0, shadow: true,
  backgroundColor: '#000000', backgroundOpacity: 0,
};

test('overlay movement and resize are clamped to the 60 second limit', () => {
  const project = addItem(createEmptyProject(), textItem);
  const moved = moveItem(project, 'text-1', 58);
  assert.equal(moved.tracks[0].items[0].startTime, 55);
  const resized = resizeItem(moved, 'text-1', 'left', -10);
  assert.equal(resized.tracks[0].items[0].startTime, 0);
  assert.equal(resized.tracks[0].items[0].duration, 60);
});

test('video reorder recomputes contiguous clip starts', () => {
  let project = createEmptyProject();
  for (const [id, duration] of [['a', 3], ['b', 4], ['c', 2]] as const) project = addItem(project, { id, kind: 'video', trackId: 'video', label: id, mediaId: id, contentType: 'video/mp4', startTime: 0, duration, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  const clips = reorderVideo(project, 'c', 0).tracks.find((track) => track.id === 'video')!.items;
  assert.deepEqual(clips.map((clip) => [clip.id, clip.startTime]), [['c', 0], ['a', 2], ['b', 5]]);
});

test('active lookup excludes an item at its exact end boundary', () => {
  const project = addItem(createEmptyProject(), { id: 'fx', kind: 'effect', trackId: 'effects', label: 'Fade', preset: 'fade-in', amount: 1, startTime: 1, duration: 2 });
  assert.deepEqual(activeItems(project, 2.99).map((item) => item.id), ['fx']);
  assert.deepEqual(activeItems(project, 3), []);
});

test('timeline serialization preserves export-relevant text audio and effects', () => {
  let project = addItem(createEmptyProject(), { id: 'video', kind: 'video', trackId: 'video', label: 'Clip', mediaId: 'a'.repeat(32), contentType: 'video/mp4', startTime: 0, duration: 4, sourceStart: 0.5, cropMode: 'contain', muted: true, volume: 0.4 });
  project = addItem(project, { ...textItem, id: 'title', startTime: 1, duration: 2, fontSize: 48, bold: true, x: 0.27, y: 0.18, width: 0.62, rotation: -12, alignment: 'left', outlineColor: '#112233', outlineWidth: 3, shadow: false, backgroundColor: '#445566', backgroundOpacity: 0.4 });
  project = addItem(project, { id: 'music', kind: 'audio', trackId: 'music', label: 'Music', mediaId: 'b'.repeat(32), contentType: 'audio/mp4', startTime: 0.5, duration: 3, sourceStart: 0.2, muted: false, volume: 0.6 });
  project = addItem(project, { id: 'filter', kind: 'effect', trackId: 'effects', label: 'Natural Pop', preset: 'vibrance', amount: 1.25, startTime: 0, duration: 4 });
  const payload = serializeTimelineProject(project);
  assert.equal(payload.clips[0].start_seconds, 0.5);
  assert.equal(payload.text_overlays[0].font_family, 'Inter');
  assert.deepEqual(
    { x: payload.text_overlays[0].x, y: payload.text_overlays[0].y, width: payload.text_overlays[0].width, rotation: payload.text_overlays[0].rotation_degrees },
    { x: 0.27, y: 0.18, width: 0.62, rotation: -12 },
  );
  assert.deepEqual(
    { alignment: payload.text_overlays[0].alignment, outline: payload.text_overlays[0].outline_width, shadow: payload.text_overlays[0].shadow, background: payload.text_overlays[0].background_opacity },
    { alignment: 'left', outline: 3, shadow: false, background: 0.4 },
  );
  assert.equal(payload.audio_items[0].kind, 'music');
  assert.equal(payload.effects[0].preset, 'vibrance');
});

test('browser filter values are bounded and produce live preview filters', () => {
  assert.equal(validateFilterAmount('grayscale', 4), 1);
  assert.equal(validateFilterAmount('contrast', -1), 0);
  const style = browserEffectStyle([{ id: 'fx', kind: 'effect', trackId: 'effects', label: 'Color', preset: 'saturation', amount: 1.4, startTime: 0, duration: 4 }], 1);
  assert.equal(style.filter, 'saturate(1.4)');
});

test('temporary effect preview can be cancelled without mutating committed effects', () => {
  const committed = [{ id: 'saved', kind: 'effect' as const, trackId: 'effects' as const, label: 'Saved', preset: 'contrast' as const, amount: 1.2, startTime: 0, duration: 4 }];
  const preview = { id: 'preview', kind: 'effect' as const, trackId: 'effects' as const, label: 'Preview', preset: 'grayscale' as const, amount: 1, startTime: 0, duration: 4 };
  assert.deepEqual(effectsWithTemporaryPreview(committed, preview).map((effect) => effect.id), ['saved', 'preview']);
  assert.deepEqual(effectsWithTemporaryPreview(committed, null), committed);
  assert.deepEqual(committed.map((effect) => effect.id), ['saved']);
});

test('text drag uses responsive normalized coordinates and respects safe bounds', () => {
  const geometry = { x: 0.5, y: 0.5, width: 0.4, fontSize: 40 };
  const mobile = moveTextGeometry(geometry, { x: 37.5, y: 66.7 }, { width: 375, height: 667 });
  const desktop = moveTextGeometry(geometry, { x: 72, y: 128 }, { width: 720, height: 1280 });
  assert.equal(mobile.x, desktop.x);
  assert.ok(Math.abs(mobile.y - desktop.y) < 0.001);
  assert.deepEqual(moveTextGeometry(geometry, { x: -1000, y: 1000 }, { width: 375, height: 667 }), { x: 0.2, y: 0.96 });
});

test('text resizing remains normalized and bounded', () => {
  const geometry = { x: 0.5, y: 0.5, width: 0.4, fontSize: 40 };
  assert.deepEqual(resizeTextGeometry(geometry, 72, 720), { width: 0.5, fontSize: 50 });
  assert.deepEqual(resizeTextGeometry(geometry, -1000, 720), { width: 0.12, fontSize: 12 });
});
