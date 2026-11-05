import assert from 'node:assert/strict';
import test from 'node:test';
import { createMotionTitleFromCommand, MOTION_TITLE_PRESETS } from './motionTitleCommands.ts';

test('all MCP-ready motion title commands resolve to allowlisted editable text items', () => {
  for (const preset of MOTION_TITLE_PRESETS) {
    const result = createMotionTitleFromCommand({ op: 'add_motion_title', preset, text: 'Launch', start: 1, duration: 4 });
    assert.equal(result.text, 'Launch');
    assert.equal(result.startTime, 1);
    assert.equal(result.duration, 4);
    assert.notEqual(result.inAnimation, 'none');
  }
});
test('motion title commands reject invalid timing and empty text', () => {
  assert.throws(() => createMotionTitleFromCommand({ op: 'add_motion_title', preset: 'motion-pop', text: 'x', start: -1, duration: 3 }), /outside/);
  assert.throws(() => createMotionTitleFromCommand({ op: 'add_motion_title', preset: 'motion-pop', text: ' ', start: 0, duration: 3 }), /1–500/);
});
