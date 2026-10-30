import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBrowserCopilotPlan } from './browserCopilotAdapter.ts';
import { addItem } from './timeline/model.ts';
import { applyEditPlan, calculateProjectRevision } from './timeline/editPlan.ts';
import { createEmptyProject, type GuestMedia } from './timeline/types.ts';
import type { BrowserEditCommand } from '../../lib/browser-ai/webllmService.ts';
import { parseBrowserIntent, resolveBrowserIntent } from '../../lib/browser-ai/browserIntent.ts';
import { buildBrowserCopilotPlanFromIntents } from './browserCopilotAdapter.ts';

const image = (id: string): GuestMedia => ({ media_id: id, original_filename: `${id}.png`, media_type: 'image', content_type: 'image/png', availability: 'available' });
const video = (id: string): GuestMedia => ({ media_id: id, original_filename: `${id}.mp4`, media_type: 'video', content_type: 'video/mp4', availability: 'available' });
function projectWith(items: Array<{ id: string; mediaId: string; startTime: number; duration: number }>) {
  let project = createEmptyProject();
  for (const item of items) project = addItem(project, { id: item.id, kind: 'video', trackId: 'video', label: item.id, mediaId: item.mediaId, contentType: item.mediaId.endsWith('v') ? 'video/mp4' : 'image/png', startTime: item.startTime, duration: item.duration, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  return project;
}

test('maps image duration safely and applies through the existing plan validator', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }, { id: 'b', mediaId: 'b', startTime: 3, duration: 3 }]);
  const revision = await calculateProjectRevision(project);
  const plan = buildBrowserCopilotPlan(project, revision, [{ op: 'set_duration', target: 'all_images', seconds: 5 }], [image('a'), image('b')]);
  const applied = await applyEditPlan(project, plan);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  assert.deepEqual(clips.map((item) => [item.id, item.startTime, item.duration]), [['a', 0, 5], ['b', 5, 5]]);
});

test('changes only images in a mixed image/video timeline when gaps permit', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }, { id: 'v', mediaId: 'v', startTime: 5, duration: 2 }]);
  const revision = await calculateProjectRevision(project);
  const plan = buildBrowserCopilotPlan(project, revision, [{ op: 'set_duration', target: 'all_images', seconds: 4 }], [image('a'), video('v')]);
  const applied = await applyEditPlan(project, plan);
  assert.equal(applied.project.tracks.find((track) => track.id === 'video')!.items.find((item) => item.id === 'v')!.duration, 2);
});

test('maps centered animated text using text defaults', async () => {
  const project = createEmptyProject();
  const revision = await calculateProjectRevision(project);
  const command: BrowserEditCommand = { op: 'add_text', text: 'Hello', position: 'center', start: 0, duration: 5, animation: 'fade-in', animationDuration: 2 };
  const plan = buildBrowserCopilotPlan(project, revision, [command], []);
  const applied = await applyEditPlan(project, plan);
  const text = applied.project.tracks.find((track) => track.id === 'text')!.items[0];
  assert.equal(text.kind, 'text');
  if (text.kind === 'text') assert.deepEqual({ text: text.text, alignment: text.alignment, inAnimation: text.inAnimation, inAnimationDuration: text.inAnimationDuration }, { text: 'Hello', alignment: 'center', inAnimation: 'fade-in', inAnimationDuration: 2 });
});

test('rejects missing metadata, unsafe overlaps, and preserves the input project', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }, { id: 'v', mediaId: 'v', startTime: 3, duration: 3 }]);
  const snapshot = JSON.stringify(project);
  const revision = await calculateProjectRevision(project);
  assert.throws(() => buildBrowserCopilotPlan(project, revision, [{ op: 'set_duration', target: 'all_images', seconds: 5 }], [image('a')]));
  assert.throws(() => buildBrowserCopilotPlan(project, revision, [{ op: 'set_duration', target: 'all_images', seconds: 5 }], [image('a'), video('v')]));
  assert.equal(JSON.stringify(project), snapshot);
});

test('parses the compound request and resolves text across the first two clips', () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }, { id: 'b', mediaId: 'b', startTime: 3, duration: 3 }]);
  const intents = parseBrowserIntent('hi can you please add the second image also and add a text on clip 1 continuing on clip 2 saying "welcome people". Also add the music also with 50% volume and add fade-in effect in the video starting');
  assert.deepEqual(intents.map((intent) => intent.op), ['add_media', 'add_text', 'add_audio', 'add_effect']);
  assert.equal(resolveBrowserIntent(intents, project, [image('a'), image('b'), { media_id: 'music', original_filename: 'music.mp3', media_type: 'audio', content_type: 'audio/mpeg' }]).find((intent) => intent.op === 'add_text')?.duration, 6);
});

test('adds the second image and spans text across the newly inserted clip atomically', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }]);
  const revision = await calculateProjectRevision(project);
  const intents = parseBrowserIntent('Add the second image and show Welcome People across both clips.');
  const plan = buildBrowserCopilotPlanFromIntents(project, revision, intents, [image('a'), image('b')]);
  assert.deepEqual(plan.operations.map((operation) => operation.op), ['add_media', 'add_text']);
  const applied = await applyEditPlan(project, plan);
  const videos = applied.project.tracks.find((track) => track.id === 'video')!.items;
  const text = applied.project.tracks.find((track) => track.id === 'text')!.items[0];
  assert.equal(videos.length, 2);
  assert.deepEqual(text && { startTime: text.startTime, duration: text.duration }, { startTime: 0, duration: 6 });
});

test('rejects ambiguous music and invalid timing without partial plan creation', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }]);
  const revision = await calculateProjectRevision(project);
  const intents = parseBrowserIntent('add music with 50% volume');
  assert.throws(() => resolveBrowserIntent(intents, project, [image('a'), { ...video('m1'), media_id: 'm1', media_type: 'audio' }, { ...video('m2'), media_id: 'm2', media_type: 'audio' }]), /Ambiguous music/);
  assert.throws(() => buildBrowserCopilotPlanFromIntents(project, revision, [{ op: 'add_text', text: 'x', clipReferences: ['clip_1'], position: 'center', start: 0, duration: 0 }], [image('a')]), /duration/);
  const audioPlan = buildBrowserCopilotPlanFromIntents(project, revision, parseBrowserIntent('add music with 50% volume'), [image('a'), { media_id: 'music', original_filename: 'music.mp3', media_type: 'audio', content_type: 'audio/mpeg', duration_seconds: 4 }]);
  const applied = await applyEditPlan(project, audioPlan);
  const audio = applied.project.tracks.find((track) => track.id === 'music')!.items[0];
  assert.equal(audio.kind, 'audio');
  if (audio.kind === 'audio') assert.equal(audio.volume, 0.5);
});

test('adds a supported video effect atomically', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }]);
  const revision = await calculateProjectRevision(project);
  const plan = buildBrowserCopilotPlanFromIntents(project, revision, [{ op: 'add_effect', preset: 'fade-in', target: 'video', start: 0, duration: 1 }], [image('a')]);
  const applied = await applyEditPlan(project, plan);
  const effect = applied.project.tracks.find((track) => track.id === 'effects')!.items[0];
  assert.equal(effect.kind, 'effect');
  if (effect.kind === 'effect') assert.equal(effect.preset, 'fade-in');
});

test('rejects an explicitly overlapping generated visual clip before apply', async () => {
  const project = projectWith([{ id: 'a', mediaId: 'a', startTime: 0, duration: 3 }]);
  const revision = await calculateProjectRevision(project);
  assert.throws(() => buildBrowserCopilotPlanFromIntents(project, revision, [{ op: 'add_media', mediaReference: 'second_image', start: 2, duration: 3 }], [image('a'), image('b')]), /overlap an existing visual clip/);
});
