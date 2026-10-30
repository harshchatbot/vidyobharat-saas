import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutoEditPlan } from './autoEdit.ts';
import { applyEditPlan, calculateProjectRevision } from './timeline/editPlan.ts';
import { addItem } from './timeline/model.ts';
import { createEmptyProject, type GuestMedia, type VideoTimelineItem } from './timeline/types.ts';
import { routeBrowserRequest } from '../../lib/browser-ai/browserIntent.ts';

const images: GuestMedia[] = [1, 2, 3].map((id) => ({ media_id: `img-${id}`, original_filename: `image-${id}.png`, media_type: 'image', content_type: 'image/png' }));
const music: GuestMedia = { media_id: 'music', original_filename: 'music.mp3', media_type: 'audio', content_type: 'audio/mpeg', duration_seconds: 20 };
const uploadedVideo: GuestMedia = { media_id: 'video-1', original_filename: 'existing.mp4', media_type: 'video', content_type: 'video/mp4', duration_seconds: 8 };

for (const style of ['elegant', 'energetic', 'cinematic'] as const) test(`builds ${style} deterministic plan`, async () => {
  const project = createEmptyProject();
  const plan = buildAutoEditPlan(project, [...images, music], await calculateProjectRevision(project), { style, mode: 'add', title: 'Welcome' });
  const applied = await applyEditPlan(project, plan);
  assert.equal(applied.project.aspectRatio, '9:16');
  assert.equal(applied.project.tracks.find((track) => track.id === 'video')!.items.length, 3);
  assert.equal(applied.project.tracks.find((track) => track.id === 'text')!.items.length, 1);
  assert.equal(applied.project.tracks.find((track) => track.id === 'music')!.items.length, 1);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  assert.equal(clips[0].kind === 'video' ? clips[0].transitionOut?.type : undefined, style === 'energetic' ? 'slide-left' : 'crossfade');
});

test('rejects missing images and preserves existing work in replace/add planning', async () => {
  const project = createEmptyProject();
  assert.throws(() => buildAutoEditPlan(project, [], 'sha256:test', { style: 'elegant', mode: 'add' }), /at least one/);
  const plan = buildAutoEditPlan(project, images, await calculateProjectRevision(project), { style: 'cinematic', mode: 'replace' });
  assert.ok(plan.operations.some((operation) => operation.op === 'add_media'));
});

test('routes the natural-language reel request and preserves exact target duration', async () => {
  const route = routeBrowserRequest('Create a beautiful 20-second Instagram reel for my crochet products, with smooth transitions, soft background music, and the title Handmade With Love.');
  assert.deepEqual(route, { kind: 'CREATE_REEL', duration: 20, style: 'elegant', title: 'Handmade With Love', musicVolume: 0.3, transition: 'crossfade' });
  const project = createEmptyProject();
  if (route.kind !== 'CREATE_REEL') throw new Error('Expected CREATE_REEL route.');
  const plan = buildAutoEditPlan(project, [...images, music], await calculateProjectRevision(project), { style: route.style, mode: 'replace', targetDuration: route.duration, title: route.title, musicVolume: route.musicVolume, transition: route.transition });
  const applied = await applyEditPlan(project, plan);
  assert.equal(applied.project.duration, 20);
  assert.equal(applied.project.tracks.find((track) => track.id === 'music')!.items[0].kind, 'audio');
});

test('uses deterministic style-aware pacing and professional safe-margin titles', async () => {
  const project = createEmptyProject();
  const plan = buildAutoEditPlan(project, images, await calculateProjectRevision(project), { style: 'cinematic', mode: 'replace', targetDuration: 20, title: 'A very long Handmade With Love product collection title' });
  const applied = await applyEditPlan(project, plan);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  const durations = clips.map((clip) => clip.duration);
  assert.equal(applied.project.duration, 20);
  assert.ok(durations[0] > durations[1]);
  const title = applied.project.tracks.find((track) => track.id === 'text')!.items[0];
  assert.equal(title.kind, 'text');
  if (title.kind === 'text') { assert.ok(title.width <= 0.84); assert.ok(title.y <= 0.22); assert.ok(title.fontSize <= 48); assert.equal(title.inAnimation, 'fade-in'); }
  const repeat = buildAutoEditPlan(project, images, await calculateProjectRevision(project), { style: 'cinematic', mode: 'replace', targetDuration: 20, title: 'A very long Handmade With Love product collection title' });
  assert.deepEqual(plan.operations.map((operation) => operation.op), repeat.operations.map((operation) => operation.op));
  assert.deepEqual(plan.operations.map((operation) => operation.op === 'add_media' ? [operation.item.mediaId, operation.item.startTime, operation.item.duration] : operation.op), repeat.operations.map((operation) => operation.op === 'add_media' ? [operation.item.mediaId, operation.item.startTime, operation.item.duration] : operation.op));
});

test('handles one-image pacing and keeps the requested duration', async () => {
  const project = createEmptyProject();
  const plan = buildAutoEditPlan(project, [images[0]], await calculateProjectRevision(project), { style: 'elegant', mode: 'replace', targetDuration: 20 });
  const applied = await applyEditPlan(project, plan);
  assert.equal(applied.project.duration, 20);
  assert.equal(applied.project.tracks.find((track) => track.id === 'video')!.items.length, 1);
});

test('uses confident music beats without changing duration or transition validity', async () => {
  const project = createEmptyProject();
  const revision = await calculateProjectRevision(project);
  const plan = buildAutoEditPlan(project, images, revision, {
    style: 'elegant', mode: 'replace', targetDuration: 12,
    beatCandidates: [{ time: 4.08, confidence: 0.9 }, { time: 8.02, confidence: 0.85 }],
  });
  const applied = await applyEditPlan(project, plan);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  assert.equal(applied.project.duration, 12);
  assert.ok(Math.abs(clips[0].duration - 4.08) < 0.05);
  assert.ok(clips[0].kind === 'video' && (clips[0].transitionOut?.duration ?? 0) <= clips[0].duration / 2);
});

test('adds transitions at every clip boundary and bounds zoom effects', async () => {
  const project = createEmptyProject();
  const plan = buildAutoEditPlan(project, images, await calculateProjectRevision(project), { style: 'energetic', mode: 'replace', targetDuration: 18 });
  const mediaOps = plan.operations.filter((operation) => operation.op === 'add_media');
  const effectOps = plan.operations.filter((operation) => operation.op === 'add_effect');
  assert.equal(mediaOps.length, 3);
  assert.equal(mediaOps.filter((operation) => operation.op === 'add_media' && operation.item.transitionOut).length, 2);
  assert.ok(effectOps.filter((operation) => operation.op === 'add_effect' && operation.item.preset === 'zoom-in').every((operation) => operation.item.duration <= 2.5));
});

test('replaces an existing invalid overlapping visual timeline atomically', async () => {
  const first: VideoTimelineItem = { id: 'old-1', kind: 'video', trackId: 'video', label: 'old 1', mediaId: 'old-1', contentType: 'image/png', startTime: 0, duration: 4, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 };
  const second: VideoTimelineItem = { ...first, id: 'old-2', label: 'old 2', mediaId: 'old-2', startTime: 3 };
  const invalid = addItem(addItem(createEmptyProject(), first), second);
  const plan = buildAutoEditPlan(invalid, images, await calculateProjectRevision(invalid), { style: 'elegant', mode: 'replace', targetDuration: 12 });
  const applied = await applyEditPlan(invalid, plan);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  assert.equal(applied.project.duration, 12);
  assert.ok(clips.every((clip, index) => index === 0 || clip.startTime >= clips[index - 1].startTime + clips[index - 1].duration - 1e-9));
});

test('rejects add mode clearly when the existing visual timeline already overlaps', async () => {
  const first: VideoTimelineItem = { id: 'old-1', kind: 'video', trackId: 'video', label: 'old 1', mediaId: 'old-1', contentType: 'image/png', startTime: 0, duration: 4, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 };
  const invalid = addItem(addItem(createEmptyProject(), first), { ...first, id: 'old-2', mediaId: 'old-2', startTime: 3 });
  assert.throws(() => buildAutoEditPlan(invalid, images, 'sha256:test', { style: 'elegant', mode: 'add' }), /overlapping visual clips.*Replace current/i);
});

test('adds image Auto Edit after a valid existing timeline and safely ignores unsupported uploaded video media', async () => {
  const existing: VideoTimelineItem = { id: 'existing', kind: 'video', trackId: 'video', label: 'existing', mediaId: 'existing-media', contentType: 'image/png', startTime: 0, duration: 4, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 };
  const project = addItem(createEmptyProject(), existing);
  const plan = buildAutoEditPlan(project, [uploadedVideo, images[0], music], await calculateProjectRevision(project), { style: 'elegant', mode: 'add', targetDuration: 5 });
  const applied = await applyEditPlan(project, plan);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  assert.equal(clips.length, 2);
  assert.equal(clips[0].id, 'existing');
  assert.equal(clips[1].startTime, 4);
  assert.equal(clips[1].duration, 5);
  assert.equal(clips[1].kind === 'video' ? clips[1].mediaId : '', images[0].media_id);
  assert.ok(plan.operations.every((operation) => operation.op !== 'add_media' || operation.item.mediaId !== uploadedVideo.media_id));
});
