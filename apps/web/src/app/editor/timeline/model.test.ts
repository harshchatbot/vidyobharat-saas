import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { addItem, activeItems, moveItem, projectItem, quantizeTimelineTime, removeItem, reorderVideo, resizeItem, snapTimelineTime, splitItem, updateItem, visualTimelineEnd } from './model.ts';
import { browserEffectStyle, effectsWithTemporaryPreview, validateFilterAmount } from './filters.ts';
import { serializeTimelineProject } from './serialization.ts';
import { moveTextGeometry, resizeTextGeometry } from './textGeometry.ts';
import { textAnimationStyle } from './textAnimations.ts';
import { applyTextTemplate, TEXT_TEMPLATES } from './textTemplates.ts';
import { createEmptyProject, EDITOR_FONTS, editorFontStack } from './types.ts';
import { applyProjectChange, beginProjectTransaction, canRedoProject, canUndoProject, commitProjectTransaction, createProjectHistory, redoProjectChange, undoProjectChange } from './history.ts';
import { effectLaneGroup, packEffectLanes } from './effectLanes.ts';
import { applyEditPlan, calculateProjectRevision, COPILOT_EDIT_PLAN_VERSION, EditPlanValidationError, type CopilotEditPlan } from './editPlan.ts';
import { mapCopilotError, operationDescription } from '../copilotUi.ts';

const textItem = {
  id: 'text-1', kind: 'text' as const, trackId: 'text' as const, label: 'Title', text: 'Hello',
  startTime: 2, duration: 5, fontFamily: 'Inter' as const, fontSize: 40, color: '#ffffff', bold: false,
  x: 0.5, y: 0.5, width: 0.8, rotation: 0, alignment: 'center' as const,
  outlineColor: '#000000', outlineWidth: 0, shadow: true,
  backgroundColor: '#000000', backgroundOpacity: 0,
  inAnimation: 'none' as const, outAnimation: 'none' as const, loopAnimation: 'none' as const,
  inAnimationDuration: 0.5, outAnimationDuration: 0.5,
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

test('visual reorder preserves intentional leading and inter-clip gaps', () => {
  let project = createEmptyProject();
  project = addItem(project, { id: 'a', kind: 'video', trackId: 'video', label: 'a', mediaId: 'a', contentType: 'video/mp4', startTime: 1, duration: 2, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  project = addItem(project, { id: 'b', kind: 'video', trackId: 'video', label: 'b', mediaId: 'b', contentType: 'video/mp4', startTime: 4.5, duration: 3, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  project = addItem(project, { id: 'c', kind: 'video', trackId: 'video', label: 'c', mediaId: 'c', contentType: 'video/mp4', startTime: 8, duration: 1, sourceStart: 0, cropMode: 'cover', muted: false, volume: 1 });
  const clips = reorderVideo(project, 'c', 0).tracks.find((track) => track.id === 'video')!.items;
  assert.deepEqual(clips.map((clip) => [clip.id, clip.startTime]), [['c', 1], ['a', 3.5], ['b', 6]]);
  assert.equal(visualTimelineEnd(reorderVideo(project, 'c', 0)), 9);
});

test('timeline edits quantize movement resize source offsets and splits to V1 frames', () => {
  let project = addItem(createEmptyProject(), { id: 'clip', kind: 'video', trackId: 'video', label: 'Clip', mediaId: 'a', contentType: 'video/mp4', startTime: 0.02, duration: 2.02, sourceStart: 0.02, cropMode: 'cover', muted: false, volume: 1 });
  let clip = project.tracks.find((track) => track.id === 'video')!.items[0];
  assert.equal(clip.startTime, 1 / 30);
  assert.equal((clip as typeof clip & { sourceStart: number }).sourceStart, 1 / 30);
  project = moveItem(project, 'clip', 0.051);
  project = resizeItem(project, 'clip', 'right', 1.049);
  clip = project.tracks.find((track) => track.id === 'video')!.items[0];
  assert.equal(clip.startTime, 2 / 30);
  assert.equal(clip.duration, 29 / 30);
  const split = splitItem(project, 'clip', 0.56, 'clip-right').tracks.find((track) => track.id === 'video')!.items;
  assert.ok(split.every((item) => Number.isInteger(item.startTime * 30) && Number.isInteger(item.duration * 30)));
});

test('snapping uses the nearest boundary including the playhead and remains frame aligned', () => {
  const item = { startTime: 1, duration: 2 };
  const snappedStart = snapTimelineTime(4.94, item, 'move', [0, 5, 8], 0.1);
  assert.equal(snappedStart, 5);
  const snappedEnd = snapTimelineTime(5.96, item, 'move', [8], 0.1);
  assert.equal(snappedEnd, 6);
  assert.equal(quantizeTimelineTime(1.019), 1 + 1 / 30);
});

test('active lookup excludes an item at its exact end boundary', () => {
  const project = addItem(createEmptyProject(), { id: 'fx', kind: 'effect', trackId: 'effects', label: 'Fade', preset: 'fade-in', amount: 1, startTime: 1, duration: 2 });
  assert.deepEqual(activeItems(project, 2.99).map((item) => item.id), ['fx']);
  assert.deepEqual(activeItems(project, 3), []);
});

test('effect timeline separates fades from looks without changing item identity', () => {
  const negative = { id: 'negative', kind: 'effect' as const, trackId: 'effects' as const, label: 'Negative', preset: 'invert' as const, amount: 1, startTime: 0, duration: 3 };
  const fade = { id: 'fade', kind: 'effect' as const, trackId: 'effects' as const, label: 'Fade In', preset: 'fade-in' as const, amount: 1, startTime: 0, duration: 3 };
  const packed = packEffectLanes([negative, fade]);
  assert.equal(effectLaneGroup(negative), 'looks');
  assert.equal(effectLaneGroup(fade), 'fades');
  assert.deepEqual(packed.items.map(({ item, group, row }) => [item.id, group, row]), [
    ['negative', 'looks', 0],
    ['fade', 'fades', 0],
  ]);
  assert.equal(packed.items[0].item, negative);
  assert.equal(packed.items[1].item, fade);
});

test('overlapping effects pack into clickable rows while non-overlapping effects reuse rows', () => {
  const makeEffect = (id: string, startTime: number, duration: number) => ({
    id, kind: 'effect' as const, trackId: 'effects' as const, label: id,
    preset: 'invert' as const, amount: 1, startTime, duration,
  });
  const packed = packEffectLanes([
    makeEffect('first', 0, 2),
    makeEffect('overlap', 1, 2),
    makeEffect('later', 2, 1),
  ]);
  assert.deepEqual(packed.items.map(({ item, row }) => [item.id, row]), [
    ['first', 0],
    ['overlap', 1],
    ['later', 0],
  ]);
  assert.equal(packed.rowCounts.looks, 2);
  assert.equal(packed.rowCounts.fades, 1);
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
  assert.equal(payload.duration_seconds, 4);
});

test('manual overlay extension is explicit and preserves the visual boundary', () => {
  let project = addItem(createEmptyProject(), { id: 'visual', kind: 'video', trackId: 'video', label: 'Still', mediaId: 'a'.repeat(32), contentType: 'image/png', startTime: 0, duration: 3, sourceStart: 0, cropMode: 'cover', muted: true, volume: 0 });
  project = addItem(project, { ...textItem, startTime: 2, duration: 3 });
  assert.equal(visualTimelineEnd(project), 3);
  assert.equal(project.duration, 5);
  assert.equal(project.extensionExplicit, true);
  assert.equal(serializeTimelineProject(project).duration_seconds, 5);
});

test('serialization quantizes timeline values to the selected output frame', () => {
  let project = addItem(createEmptyProject(), { id: 'visual', kind: 'video', trackId: 'video', label: 'Clip', mediaId: 'a'.repeat(32), contentType: 'video/mp4', startTime: 0.01, duration: 1.01, sourceStart: 0.01, cropMode: 'cover', muted: false, volume: 1 });
  project = { ...project, exportSettings: { ...project.exportSettings, fps: 30 } };
  const payload = serializeTimelineProject(project);
  assert.equal(payload.clips[0].timeline_start_seconds, 0);
  assert.equal(payload.clips[0].duration_seconds, 1);
  assert.equal(payload.duration_seconds, 1);
});

test('legacy export settings normalize to the V1 preset during serialization', () => {
  const project = {
    ...createEmptyProject(),
    aspectRatio: '16:9' as const,
    exportSettings: { filename: 'Client Cut', resolution: '1080p' as const, fps: 60 as const, quality: 'standard' as const },
  };
  const payload = serializeTimelineProject(project);
  assert.deepEqual(
    { ratio: payload.aspect_ratio, width: payload.width, height: payload.height, fps: payload.fps, quality: payload.quality, filename: payload.output_filename },
    { ratio: '16:9', width: 1280, height: 720, fps: 30, quality: 'standard', filename: 'Client Cut.mp4' },
  );
});

test('browser filter values are bounded and produce live preview filters', () => {
  assert.equal(validateFilterAmount('grayscale', 4), 1);
  assert.equal(validateFilterAmount('contrast', -1), 0);
  const style = browserEffectStyle([{ id: 'fx', kind: 'effect', trackId: 'effects', label: 'Color', preset: 'saturation', amount: 1.4, startTime: 0, duration: 4 }], 1);
  assert.equal(style.filter, 'saturate(1.4)');
});

test('new effects are bounded and produce browser preview filters', () => {
  assert.equal(validateFilterAmount('sepia', 3), 1);
  assert.equal(validateFilterAmount('invert', -1), 0);
  const effects = [
    { preset: 'sepia' as const, amount: 0.75 },
    { preset: 'hue-rotate' as const, amount: 0.15 },
    { preset: 'invert' as const, amount: 1 },
    { preset: 'warm' as const, amount: 1 },
    { preset: 'cool' as const, amount: 1 },
  ].map((effect, index) => ({
    id: `new-fx-${index}`, kind: 'effect' as const, trackId: 'effects' as const,
    label: effect.preset, startTime: 0, duration: 4, ...effect,
  }));

  const filter = String(browserEffectStyle(effects, 1).filter);
  assert.match(filter, /sepia\(0\.75\)/);
  assert.match(filter, /hue-rotate\(27deg\)/);
  assert.match(filter, /invert\(1\)/);
  assert.match(filter, /saturate/);
});

test('new effects serialize only as committed timeline data', () => {
  let project = createEmptyProject();
  for (const [index, preset] of ['sepia', 'hue-rotate', 'invert', 'warm', 'cool'].entries()) {
    project = addItem(project, {
      id: `fx-${index}`, kind: 'effect', trackId: 'effects', label: preset,
      preset: preset as 'sepia' | 'hue-rotate' | 'invert' | 'warm' | 'cool',
      amount: 1, startTime: 0, duration: 1,
    });
  }
  assert.deepEqual(serializeTimelineProject(project).effects.map((effect) => effect.preset), ['sepia', 'hue-rotate', 'invert', 'warm', 'cool']);
});

test('editor font catalog includes localized Noto families with browser fallback', () => {
  assert.equal(EDITOR_FONTS.length, 13);
  assert.ok(EDITOR_FONTS.includes('Noto Sans Devanagari'));
  assert.ok(EDITOR_FONTS.includes('Noto Sans Malayalam'));
  assert.equal(editorFontStack('Noto Sans Bengali'), '"Noto Sans Bengali", "Noto Sans", sans-serif');
  assert.equal(editorFontStack('unsafe"font'), '"unsafefont", "Noto Sans", sans-serif');
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

test('text template preview leaves the serialized project unchanged until commit', () => {
  const project = addItem(createEmptyProject(), textItem);
  const before = serializeTimelineProject(project);
  const preview = applyTextTemplate(textItem, TEXT_TEMPLATES[3]);
  assert.equal(preview.color, '#67e8f9');
  assert.deepEqual(serializeTimelineProject(project), before);
  const committed = updateItem(project, textItem.id, preview);
  assert.equal(serializeTimelineProject(committed).text_overlays[0].color, '#67e8f9');
});

test('text animation timing and serialization preserve committed animation choices', () => {
  const animated = { ...textItem, inAnimation: 'fade-in' as const, outAnimation: 'slide-down' as const, loopAnimation: 'float' as const, inAnimationDuration: 1, outAnimationDuration: 1 };
  const start = textAnimationStyle(animated, 0);
  const middle = textAnimationStyle(animated, 2.5);
  assert.equal(start.opacity, 0);
  assert.equal(middle.opacity, 1);
  assert.match(String(middle.transform), /translateY/);
  const payload = serializeTimelineProject(addItem(createEmptyProject(), animated)).text_overlays[0];
  assert.deepEqual(
    { in: payload.in_animation, out: payload.out_animation, loop: payload.loop_animation, inDuration: payload.in_animation_duration, outDuration: payload.out_animation_duration },
    { in: 'fade-in', out: 'slide-down', loop: 'float', inDuration: 1, outDuration: 1 },
  );
});

test('project history supports undo redo and clears redo after a new edit', () => {
  const initial = createEmptyProject();
  const first = addItem(initial, { id: 'one', kind: 'video', trackId: 'video', label: 'One', mediaId: 'a'.repeat(32), contentType: 'image/png', startTime: 0, duration: 2, sourceStart: 0, cropMode: 'cover', muted: true, volume: 0 });
  const second = updateItem(first, 'one', { duration: 3 });
  let history = applyProjectChange(createProjectHistory(initial), first);
  history = applyProjectChange(history, second);
  assert.equal(history.present.duration, 3);
  history = undoProjectChange(history);
  assert.equal(history.present.duration, 2);
  assert.equal(canRedoProject(history), true);
  history = redoProjectChange(history);
  assert.equal(history.present.duration, 3);
  history = undoProjectChange(history);
  history = applyProjectChange(history, removeItem(history.present, 'one'));
  assert.equal(canRedoProject(history), false);
  assert.equal(history.present.duration, 0);
});

test('continuous pointer edits commit as one bounded history transaction', () => {
  const initial = addItem(createEmptyProject(), textItem);
  let history = createProjectHistory(initial, 2);
  history = beginProjectTransaction(history, 'canvas:text-1:move');
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.55 }), 'canvas:text-1:move');
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.65 }), 'canvas:text-1:move');
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.75 }), 'canvas:text-1:move');
  history = commitProjectTransaction(history, 'canvas:text-1:move');
  assert.equal(history.past.length, 1);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).x, 0.75);
  history = undoProjectChange(history);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).x, 0.5);

  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.6 }));
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.7 }));
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.8 }));
  assert.equal(history.past.length, 2);
});

test('undo safely commits an active text transaction before restoring its baseline', () => {
  const initial = addItem(createEmptyProject(), textItem);
  let history = beginProjectTransaction(createProjectHistory(initial), 'inspector:text-1');
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { text: 'Hello world', label: 'Hello world' }), 'inspector:text-1');
  assert.equal(canUndoProject(history), true);
  history = undoProjectChange(history);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).text, 'Hello');
  assert.equal(canRedoProject(history), true);
});

test('async audio completion during text drag remains a separate undo step', () => {
  const initial = addItem(createEmptyProject(), textItem);
  const dragKey = 'canvas:text-1:move';
  let history = beginProjectTransaction(createProjectHistory(initial), dragKey);
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.7 }), dragKey);
  history = applyProjectChange(history, addItem(history.present, {
    id: 'uploaded-audio', kind: 'audio', trackId: 'music', label: 'Uploaded music',
    mediaId: 'a'.repeat(32), contentType: 'audio/mpeg', startTime: 0, duration: 2,
    sourceStart: 0, muted: false, volume: 0.65,
  }));
  assert.equal(history.transaction?.key, dragKey);
  history = commitProjectTransaction(history, dragKey);

  history = undoProjectChange(history);
  assert.equal(projectItem(history.present, 'uploaded-audio'), undefined);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).x, 0.7);
  history = undoProjectChange(history);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).x, 0.5);
  history = redoProjectChange(history);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).x, 0.7);
  assert.equal(projectItem(history.present, 'uploaded-audio'), undefined);
  history = redoProjectChange(history);
  assert.ok(projectItem(history.present, 'uploaded-audio'));
});

test('stale transaction updates and completion callbacks cannot close a newer transaction', () => {
  const initial = addItem(createEmptyProject(), textItem);
  const oldKey = 'canvas:text-1:move';
  const newKey = 'canvas:text-1:resize';
  let history = beginProjectTransaction(createProjectHistory(initial), oldKey);
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.6 }), oldKey);
  history = beginProjectTransaction(history, newKey);
  history = commitProjectTransaction(history, oldKey);
  assert.equal(history.transaction?.key, newKey);
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { width: 0.6 }), newKey);
  const beforeStaleUpdate = history;
  history = applyProjectChange(history, updateItem(history.present, 'text-1', { x: 0.9 }), oldKey);
  assert.equal(history, beforeStaleUpdate);
  history = commitProjectTransaction(history, oldKey);
  assert.equal(history.transaction?.key, newKey);
  history = commitProjectTransaction(history, newKey);
  assert.equal(history.transaction, undefined);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).x, 0.6);
  assert.equal((projectItem(history.present, 'text-1') as typeof textItem).width, 0.6);
});

function copilotProject() {
  let project = createEmptyProject();
  project = addItem(project, { id: 'clip-a', kind: 'video', trackId: 'video', label: 'First', mediaId: 'a'.repeat(32), contentType: 'image/png', startTime: 1, duration: 2, sourceStart: 0, cropMode: 'cover', muted: true, volume: 0 });
  project = addItem(project, { id: 'clip-b', kind: 'video', trackId: 'video', label: 'Second', mediaId: 'b'.repeat(32), contentType: 'image/png', startTime: 4, duration: 3, sourceStart: 0, cropMode: 'cover', muted: true, volume: 0 });
  return project;
}

async function copilotPlan(project = copilotProject(), operations: CopilotEditPlan['operations']): Promise<CopilotEditPlan> {
  return {
    schemaVersion: COPILOT_EDIT_PLAN_VERSION,
    requestId: 'request-1',
    projectRevision: await calculateProjectRevision(project),
    summary: 'Apply requested edits',
    warnings: [],
    operations,
  };
}

test('copilot plan applies valid operations and permits references to earlier additions', async () => {
  const project = copilotProject();
  const addedText = { ...textItem, id: 'ai-title', startTime: 1.02, duration: 1.02 };
  const plan = await copilotPlan(project, [
    { op: 'add_text', item: addedText },
    { op: 'update_item', itemId: 'ai-title', changes: { text: 'Edited by Copilot', fontSize: 52 } },
    { op: 'add_effect', item: { id: 'ai-effect', kind: 'effect', trackId: 'effects', label: 'Warm', preset: 'warm', amount: 0.8, startTime: 1.02, duration: 1.02 } },
    { op: 'set_aspect_ratio', aspectRatio: '1:1' },
  ]);
  const applied = await applyEditPlan(project, plan);
  const title = projectItem(applied.project, 'ai-title');
  assert.equal(title?.kind, 'text');
  assert.equal(title?.kind === 'text' ? title.text : '', 'Edited by Copilot');
  assert.equal(title?.startTime, 31 / 30);
  assert.equal(applied.project.aspectRatio, '1:1');
  assert.equal(applied.summaries.length, 4);
  assert.equal(projectItem(project, 'ai-title'), undefined);
  assert.equal(serializeTimelineProject(applied.project).effects[0].preset, 'warm');
});

test('copilot plan rejects missing and duplicate IDs atomically', async () => {
  const project = copilotProject();
  const missing = await copilotPlan(project, [{ op: 'remove_item', itemId: 'missing' }]);
  await assert.rejects(() => applyEditPlan(project, missing), (error: unknown) => error instanceof EditPlanValidationError && error.code === 'invalid_item_id');

  const duplicate = await copilotPlan(project, [
    { op: 'add_text', item: { ...textItem, id: 'new-text' } },
    { op: 'add_effect', item: { id: 'new-text', kind: 'effect', trackId: 'effects', label: 'Fade', preset: 'fade-in', amount: 1, startTime: 1, duration: 1 } },
  ]);
  await assert.rejects(() => applyEditPlan(project, duplicate), (error: unknown) => error instanceof EditPlanValidationError && error.code === 'duplicate_item_id' && error.operationIndex === 1);
  assert.equal(projectItem(project, 'new-text'), undefined);
});

test('copilot plan rejects visual overlap without exposing earlier operations', async () => {
  const project = copilotProject();
  const plan = await copilotPlan(project, [
    { op: 'add_text', item: { ...textItem, id: 'temporary-title' } },
    { op: 'move_item', itemId: 'clip-b', startTime: 2.5 },
  ]);
  await assert.rejects(() => applyEditPlan(project, plan), (error: unknown) => error instanceof EditPlanValidationError && error.code === 'visual_overlap' && error.operationIndex === 1);
  assert.equal(projectItem(project, 'temporary-title'), undefined);
  assert.equal(projectItem(project, 'clip-b')?.startTime, 4);
});

test('copilot plan quantizes edits to frames and reports committed values', async () => {
  const project = copilotProject();
  const plan = await copilotPlan(project, [
    { op: 'move_item', itemId: 'clip-b', startTime: 4.019 },
    { op: 'update_item', itemId: 'clip-b', changes: { duration: 2.019, sourceStart: 0.019 } },
  ]);
  const applied = await applyEditPlan(project, plan);
  const clip = projectItem(applied.project, 'clip-b');
  assert.equal(clip?.startTime, 4 + 1 / 30);
  assert.equal(clip?.duration, 2 + 1 / 30);
  assert.equal(clip?.kind === 'video' ? clip.sourceStart : -1, 1 / 30);
  assert.equal(applied.summaries[1].after?.duration, 2 + 1 / 30);
});

test('copilot visual reorder preserves leading and inter-clip gaps', async () => {
  const project = copilotProject();
  const plan = await copilotPlan(project, [{ op: 'reorder_visuals', orderedItemIds: ['clip-b', 'clip-a'] }]);
  const applied = await applyEditPlan(project, plan);
  const clips = applied.project.tracks.find((track) => track.id === 'video')!.items;
  assert.deepEqual(clips.map((clip) => [clip.id, clip.startTime]), [['clip-b', 1], ['clip-a', 5]]);
  assert.equal(applied.project.duration, 7);
});

test('copilot revision is deterministic and stale plans are rejected', async () => {
  const project = copilotProject();
  const equivalent = structuredClone(project);
  assert.equal(await calculateProjectRevision(project), await calculateProjectRevision(equivalent));
  const plan = await copilotPlan(project, [{ op: 'set_aspect_ratio', aspectRatio: '16:9' }]);
  const changed = updateItem(project, 'clip-a', { duration: 2.5 });
  assert.notEqual(await calculateProjectRevision(project), await calculateProjectRevision(changed));
  await assert.rejects(() => applyEditPlan(changed, plan), (error: unknown) => error instanceof EditPlanValidationError && error.code === 'stale_project_revision');
});

test('copilot canonical revision matches the shared Python compatibility fixture', async () => {
  const fixture = JSON.parse(readFileSync(new URL('../../../../../../shared/fixtures/editor_copilot_protocol_v1.json', import.meta.url), 'utf8'));
  assert.equal(await calculateProjectRevision(fixture.project), fixture.projectRevision);
});

test('copilot proposal is one undoable and redoable history entry', async () => {
  const project = copilotProject();
  const plan = await copilotPlan(project, [
    { op: 'update_item', itemId: 'clip-a', changes: { duration: 1.5 } },
    { op: 'set_aspect_ratio', aspectRatio: '4:5' },
  ]);
  const applied = await applyEditPlan(project, plan);
  let history = applyProjectChange(createProjectHistory(project), applied.project);
  assert.equal(history.past.length, 1);
  assert.equal(history.present.aspectRatio, '4:5');
  history = undoProjectChange(history);
  assert.deepEqual(history.present, project);
  history = redoProjectChange(history);
  assert.deepEqual(history.present, applied.project);
});

test('copilot UI maps safe backend states without exposing provider details', () => {
  assert.equal(mapCopilotError(401, {}).code, 'signed_out');
  assert.equal(mapCopilotError(403, {}).code, 'disabled');
  assert.equal(mapCopilotError(409, {}).code, 'stale');
  assert.equal(mapCopilotError(429, { message: 'internal quota subject' }).message.includes('internal'), false);
  assert.equal(mapCopilotError(504, {}).retryable, true);
});

test('copilot operation summaries use the validated operation envelope', () => {
  assert.equal(operationDescription({ op: 'set_aspect_ratio', aspectRatio: '16:9' }), 'Change canvas to 16:9');
  assert.equal(operationDescription({ op: 'move_item', itemId: 'title', startTime: 1.5 }), 'Move item to 1.50s');
});

for (const contentType of ['image/png', 'video/mp4']) {
  test(`copilot null placeholders allow safe ${contentType} slideshow updates and animated title`, async () => {
    let project = copilotProject();
    project = updateItem(project, 'clip-a', { contentType });
    project = updateItem(project, 'clip-b', { contentType });
    const placeholders = { text: null, fontSize: null, shadow: null, inAnimation: null, muted: null, volume: null };
    const title = { ...textItem, id: 'ai-title', text: 'My First AI Video', startTime: 0, duration: 3, x: 0.5, y: 0.5, inAnimation: 'fade-in' as const, inAnimationDuration: 1 };
    const plan = await copilotPlan(project, [
      { op: 'update_item', itemId: 'clip-a', changes: { ...placeholders, startTime: 0, duration: 3 } },
      { op: 'update_item', itemId: 'clip-b', changes: { ...placeholders, startTime: 3, duration: 3 } },
      { op: 'add_text', item: title },
    ] as unknown as CopilotEditPlan['operations']);
    const original = JSON.stringify(plan);
    const applied = await applyEditPlan(project, plan);
    assert.deepEqual(['clip-a', 'clip-b'].map((id) => {
      const item = projectItem(applied.project, id)!;
      assert.equal('text' in item, false);
      return [item.startTime, item.duration];
    }), [[0, 3], [3, 3]]);
    assert.deepEqual(projectItem(applied.project, 'ai-title'), title);
    assert.equal(JSON.stringify(plan), original);
    assert.equal(projectItem(project, 'ai-title'), undefined);
    let history = createProjectHistory(project);
    history = applyProjectChange(history, applied.project);
    assert.equal(projectItem(history.present, 'ai-title')?.kind, 'text');
    assert.deepEqual(undoProjectChange(history).present, project);
  });
}

for (const changes of [
  { duration: 3, text: 'Do not silently discard' },
  { duration: 3, fontSize: 42 },
  { duration: 3, shadow: false },
  { duration: 3, inAnimation: 'fade-in' },
  { duration: 3, unknown: null },
  { duration: 3, mediaId: null },
  { text: null, fontSize: null },
]) {
  test(`copilot rejects unsupported or empty changes ${JSON.stringify(changes)}`, async () => {
    const project = copilotProject();
    const plan = await copilotPlan(project, [{ op: 'update_item', itemId: 'clip-a', changes }] as unknown as CopilotEditPlan['operations']);
    await assert.rejects(applyEditPlan(project, plan), EditPlanValidationError);
  });
}
