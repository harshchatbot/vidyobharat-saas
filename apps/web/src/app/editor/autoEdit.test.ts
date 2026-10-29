import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutoEditPlan } from './autoEdit.ts';
import { applyEditPlan, calculateProjectRevision } from './timeline/editPlan.ts';
import { createEmptyProject, type GuestMedia } from './timeline/types.ts';
import { routeBrowserRequest } from '../../lib/browser-ai/browserIntent.ts';

const images: GuestMedia[] = [1, 2, 3].map((id) => ({ media_id: `img-${id}`, original_filename: `image-${id}.png`, media_type: 'image', content_type: 'image/png' }));
const music: GuestMedia = { media_id: 'music', original_filename: 'music.mp3', media_type: 'audio', content_type: 'audio/mpeg', duration_seconds: 20 };

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
