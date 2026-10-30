import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAndValidateModelJson, validateCommands, BrowserAiValidationError } from './webllmService.ts';

const instruction = "Set all images to 5 seconds. Add the title 'Hello RangManch' at the beginning, centered, with a 2-second fade-in.";

test('accepts the requested duration and title commands', () => {
  assert.deepEqual(validateCommands({ commands: [
    { op: 'set_duration', target: 'all_images', seconds: 5 },
    { op: 'add_text', text: 'Hello RangManch', position: 'center', start: 0, duration: 5, animation: 'fade-in', animationDuration: 2 },
  ] }, instruction).commands.length, 2);
});

test('rejects duplicate set_duration commands', () => {
  assert.throws(() => validateCommands({ commands: [
    { op: 'set_duration', target: 'all_images', seconds: 5 },
    { op: 'set_duration', target: 'all_images', seconds: 5 },
  ] }));
});

test('rejects missing explicitly requested title and animation', () => {
  assert.throws(() => validateCommands({ commands: [
    { op: 'set_duration', target: 'all_images', seconds: 5 },
  ] }, instruction), /title command/);
});

test('rejects invalid values and unsupported fields', () => {
  assert.throws(() => validateCommands({ commands: [
    { op: 'set_duration', target: 'all_images', seconds: 0 },
  ] }));
  assert.throws(() => validateCommands({ commands: [
    { op: 'add_text', text: 'Hello', position: 'center', start: 0, duration: 3, animation: 'fade-in', animationDuration: 4 },
  ] }));
  assert.throws(() => validateCommands({ commands: [
    { op: 'set_duration', target: 'all_images', seconds: 5, extra: true },
  ] }));
});

test('does not require unmentioned operations', () => {
  assert.equal(validateCommands({ commands: [{ op: 'set_duration', target: 'all_images', seconds: 5 }] }, 'Set all images to 5 seconds.').commands.length, 1);
});

test('rejects array-shaped intermediate output instead of deduplicating it', () => {
  assert.throws(() => validateCommands({ commands: [
    { op: 'set_duration', target: 'all_images', seconds: 5 },
    { op: 'set_duration', target: 'all_images', seconds: 5 },
  ] }));
});

test('preserves raw JSON and identifies the invalid text field', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 5,
    title: 'Hello RangManch',
    title_position: 'center',
    title_start: 0,
    title_duration: 5,
    title_animation: 'fade-in',
    title_animation_duration: 6,
  });

  assert.throws(
    () => parseAndValidateModelJson(rawJson, 'Add the title "Hello RangManch" centered.'),
    (error: unknown) =>
      error instanceof BrowserAiValidationError &&
      error.rawJson === rawJson &&
      error.message.includes('animationDuration')
  );
});

test('omits optional null animation fields without weakening validation', () => {
  const rawJson = JSON.stringify({
    duration_seconds: null,
    title: 'Hello RangManch',
    title_position: 'center',
    title_start: 0,
    title_duration: 5,
    title_animation: null,
    title_animation_duration: null,
  });
  assert.deepEqual(
    parseAndValidateModelJson(rawJson, 'Add the title "Hello RangManch" centered.').commands,
    [{ op: 'add_text', text: 'Hello RangManch', position: 'center', start: 0, duration: 5 }]
  );
});

test('uses requested image duration only when title display duration is unspecified', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 5,
    title: 'Hello RangManch',
    title_position: 'center',
    title_start: 0,
    title_duration: null,
    title_animation: 'fade-in',
    title_animation_duration: 2,
  });
  const result = parseAndValidateModelJson(rawJson, instruction);
  assert.equal(result.commands[1]?.op, 'add_text');
  assert.deepEqual(result.commands[1], {
    op: 'add_text', text: 'Hello RangManch', position: 'center', start: 0,
    duration: 5, animation: 'fade-in', animationDuration: 2,
  });
});

test('normalizes a model fade duration that contradicts the instruction', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 5,
    title: 'Hello RangManch',
    title_position: 'center',
    title_start: 0,
    title_duration: null,
    title_animation: 'fade-in',
    title_animation_duration: 5,
  });
  const result = parseAndValidateModelJson(rawJson, instruction);
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].animationDuration : null, 2);
});

test('normalizes clearly reversed model timing fields from explicit instruction', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 2, title: 'Hello RangManch', title_position: 'center',
    title_start: 0, title_duration: 2, title_animation: 'fade-in',
    title_animation_duration: 5,
  });
  const result = parseAndValidateModelJson(rawJson, instruction);
  assert.equal(result.commands[0]?.op === 'set_duration' ? result.commands[0].seconds : null, 5);
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].duration : null, 5);
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].animationDuration : null, 2);
});

test('rejects conflicting timing phrases as ambiguous', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 5, title: 'Hello RangManch', title_position: 'center',
    title_start: 0, title_duration: null, title_animation: 'fade-in',
    title_animation_duration: 2,
  });
  assert.throws(
    () => parseAndValidateModelJson(rawJson, 'Set all images to 5 seconds and images to 6 seconds.'),
    /Ambiguous image duration/
  );
});

test('honors an explicit title display duration separately from fade duration', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 5, title: 'Hello RangManch', title_position: 'center',
    title_start: 0, title_duration: 5, title_animation: 'fade-in',
    title_animation_duration: 5,
  });
  const result = parseAndValidateModelJson(rawJson, 'Set all images to 5 seconds. Add the title "Hello RangManch" for 3 seconds with a 2-second fade-in.');
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].duration : null, 3);
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].animationDuration : null, 2);
});

test('normalizes clear Hinglish image and fade timing', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 2, title: 'Mera Bharat', title_position: 'center',
    title_start: 0, title_duration: 2, title_animation: 'fade-in',
    title_animation_duration: 6,
  });
  const result = parseAndValidateModelJson(
    rawJson,
    'Saari images ko 6 seconds ka kar do aur starting mein "Mera Bharat" title center mein add karo, 2 seconds ka fade-in chahiye.'
  );
  assert.equal(result.commands[0]?.op === 'set_duration' ? result.commands[0].seconds : null, 6);
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].duration : null, 6);
  assert.equal(result.commands[1]?.op === 'add_text' ? result.commands[1].animationDuration : null, 2);
});

test('carries only the current attempt diagnostics through validation errors', () => {
  const rawJson = JSON.stringify({
    duration_seconds: 6, title: 'Mera Bharat', title_position: 'left',
    title_start: 0, title_duration: 6, title_animation: 'fade-in',
    title_animation_duration: 2,
  });
  assert.throws(
    () => parseAndValidateModelJson(rawJson, 'Saari images ko 6 seconds ka kar do aur title "Mera Bharat" ke liye 2 seconds ka fade-in chahiye.'),
    (error: unknown) => error instanceof BrowserAiValidationError &&
      error.rawJson === rawJson &&
      typeof error.normalizedJson === 'string' &&
      error.normalizedJson.includes('"duration_seconds": 6')
  );
});
