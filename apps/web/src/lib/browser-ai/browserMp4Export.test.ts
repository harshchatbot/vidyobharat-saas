import assert from 'node:assert/strict';
import test from 'node:test';
import { EXPORT_DURATION_SECONDS, EXPORT_FPS, frameTime, titleOpacity, supportedTimelineItems, validateExportDuration, wrapTextLines } from './browserMp4Export.ts';
import { addItem } from '../../app/editor/timeline/model.ts';
import { createEmptyProject, type GuestMedia } from '../../app/editor/timeline/types.ts';
import { browserEffectState, transitionProgress } from '../../app/editor/timeline/filters.ts';

test('frame timing is deterministic at 30 FPS', () => {
  assert.equal(frameTime(0), 0);
  assert.equal(frameTime(EXPORT_FPS * 5), 5);
  assert.equal(frameTime(EXPORT_FPS * 15 - 1), 14.966666666666667);
});

test('accepts 15, 20, and 30 second timelines but rejects longer exports', () => {
  assert.equal(EXPORT_DURATION_SECONDS, 30);
  for (const duration of [15, 20, 30]) assert.doesNotThrow(() => validateExportDuration(duration));
  assert.throws(() => validateExportDuration(30.01), /up to 30 seconds/);
  assert.throws(() => validateExportDuration(0), /greater than zero/);
});

test('cancellation settles the recorder and permits a later export', async () => {
  const originalDocument = globalThis.document;
  const originalRecorder = globalThis.MediaRecorder;
  const originalRaf = globalThis.requestAnimationFrame;
  let frames = 0;
  class FakeRecorder {
    static isTypeSupported() { return true; }
    state: 'inactive' | 'recording' = 'inactive';
    ondataavailable?: (event: { data: Blob }) => void;
    onerror?: () => void;
    onstop?: () => void;
    constructor(stream: MediaStream) { void stream; }
    start() { this.state = 'recording'; }
    stop() { this.state = 'inactive'; this.onstop?.(); }
  }
  const context = { fillStyle: '', fillRect() {}, save() {}, restore() {}, translate() {}, scale() {}, drawImage() {}, measureText: (value: string) => ({ width: value.length * 10 }) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => ({ width: 0, height: 0, getContext: () => context, captureStream: () => ({ getTracks: () => [], addTrack() {} }) }) } });
  Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: FakeRecorder });
  Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { frames += 1; callback(0); return frames; } });
  try {
    const project = addItem(createEmptyProject(), { id: 'image', kind: 'video', trackId: 'video', label: 'Image', mediaId: 'img', contentType: 'image/png', startTime: 0, duration: 15, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
    const assets = { media: [{ media_id: 'img', original_filename: 'img.png', media_type: 'image' as const, content_type: 'image/png' }], images: { img: { naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement } };
    const controller = new AbortController();
    const abortingRaf = globalThis.requestAnimationFrame;
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { const id = abortingRaf(callback); if (frames === 2) controller.abort(); return id; } });
    await assert.rejects(() => import('./browserMp4Export.ts').then(({ exportTimelineMp4 }) => exportTimelineMp4(project, assets, { signal: controller.signal })), { name: 'AbortError' });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: (callback: FrameRequestCallback) => { frames += 1; callback(0); return frames; } });
    const { exportTimelineMp4 } = await import('./browserMp4Export.ts');
    await assert.doesNotReject(() => exportTimelineMp4(project, assets));
  } finally {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: originalDocument });
    Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: originalRecorder });
    Object.defineProperty(globalThis, 'requestAnimationFrame', { configurable: true, value: originalRaf });
  }
});

test('fade-in opacity follows the preview animation timing', () => {
  assert.equal(titleOpacity(0), 0);
  assert.equal(titleOpacity(1), 0.5);
  assert.equal(titleOpacity(2), 1);
  assert.equal(titleOpacity(10), 1);
});

test('long titles wrap within the configured safe width', () => {
  const context = { measureText: (value: string) => ({ width: value.length * 10 }) } as CanvasRenderingContext2D;
  assert.deepEqual(wrapTextLines(context, 'Handmade With Love for Everyone', 120), ['Handmade', 'With Love', 'for Everyone']);
});

test('timeline assets preserve clip order and absolute timing', () => {
  let project = createEmptyProject();
  project = addItem(project, { id: 'second', kind: 'video', trackId: 'video', label: 'Second', mediaId: 'b', contentType: 'image/png', startTime: 5, duration: 5, sourceStart: 0, cropMode: 'contain', muted: true, volume: 0 });
  project = addItem(project, { id: 'first', kind: 'video', trackId: 'video', label: 'First', mediaId: 'a', contentType: 'image/png', startTime: 0, duration: 5, sourceStart: 0, cropMode: 'cover', muted: true, volume: 0 });
  const media: GuestMedia[] = ['a', 'b'].map((media_id) => ({ media_id, original_filename: `${media_id}.png`, media_type: 'image', content_type: 'image/png' }));
  const assets = { media, images: { a: { naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement, b: { naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement } };
  assert.deepEqual(supportedTimelineItems(project, assets).videos.map((item) => item.id), ['first', 'second']);
});

test('rejects unsupported timeline media instead of omitting it', () => {
  let project = createEmptyProject();
  project = addItem(project, { id: 'video', kind: 'video', trackId: 'video', label: 'Video', mediaId: 'v', contentType: 'video/mp4', startTime: 0, duration: 5, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  assert.throws(() => supportedTimelineItems(project, { media: [{ media_id: 'v', original_filename: 'v.mp4', media_type: 'video', content_type: 'video/mp4' }], images: {} }), /Unsupported or missing image media/);
});

test('accepts validated audio timing and requires an audio asset', () => {
  let project = createEmptyProject();
  project = addItem(project, { id: 'music', kind: 'audio', trackId: 'music', label: 'Music', mediaId: 'm', contentType: 'audio/mpeg', startTime: 1, duration: 4, sourceStart: 2, muted: true, volume: 0.5 });
  const media: GuestMedia[] = [{ media_id: 'm', original_filename: 'music.mp3', media_type: 'audio', content_type: 'audio/mpeg' }];
  assert.throws(() => supportedTimelineItems(project, { media, images: {} }), /missing audio media/);
  const assets = { media, images: {}, audio: { m: { currentTime: 0 } as HTMLAudioElement } };
  const resolved = supportedTimelineItems(project, assets);
  assert.deepEqual({ start: resolved.audio[0].startTime, duration: resolved.audio[0].duration, source: resolved.audio[0].sourceStart, volume: resolved.audio[0].volume, muted: resolved.audio[0].muted }, { start: 1, duration: 4, source: 2, volume: 0.5, muted: true });
});

test('uses shared effect interpolation for fade and zoom preview/export state', () => {
  const state = browserEffectState([
    { id: 'fade', kind: 'effect', trackId: 'effects', label: 'fade-in', preset: 'fade-in', amount: 1, startTime: 0, duration: 2 },
    { id: 'zoom', kind: 'effect', trackId: 'effects', label: 'zoom-in', preset: 'zoom-in', amount: 1, startTime: 0, duration: 4 },
  ], 1);
  assert.equal(state.opacity, 0.5);
  assert.equal(state.scale, 1.03);
});

test('accepts effect timeline items in the browser export contract', () => {
  let project = createEmptyProject();
  project = addItem(project, { id: 'image', kind: 'video', trackId: 'video', label: 'Image', mediaId: 'a', contentType: 'image/png', startTime: 0, duration: 5, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  project = addItem(project, { id: 'zoom', kind: 'effect', trackId: 'effects', label: 'Zoom', preset: 'zoom-in', amount: 1, startTime: 0, duration: 5 });
  const assets = { media: [{ media_id: 'a', original_filename: 'a.png', media_type: 'image' as const, content_type: 'image/png' }], images: { a: { naturalWidth: 1, naturalHeight: 1 } as HTMLImageElement } };
  assert.equal(supportedTimelineItems(project, assets).effects[0].preset, 'zoom-in');
});

test('transition boundaries use the same interpolation for preview and export', () => {
  assert.equal(transitionProgress(5, 0.6, 4.7), 0);
  assert.ok(Math.abs(transitionProgress(5, 0.6, 5) - 0.5) < 1e-9);
  assert.ok(Math.abs(transitionProgress(5, 0.6, 5.3) - 1) < 1e-9);
});
