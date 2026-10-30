import assert from 'node:assert/strict';
import test from 'node:test';

import { classifyBrowserConversation } from './browserIntent.ts';
import { createEmptyProject, type GuestMedia } from '../../app/editor/timeline/types.ts';

const image: GuestMedia = { media_id: 'image-1', original_filename: 'one.png', media_type: 'image', content_type: 'image/png' };

test('routes a greeting to chat instead of an empty edit plan', () => {
  const response = classifyBrowserConversation('hi', createEmptyProject(), []);
  assert.equal(response?.kind, 'chat');
  assert.match(response?.message ?? '', /video editing assistant/i);
});

test('routes an editing question to contextual advice', () => {
  const response = classifyBrowserConversation('How can I make my reel engaging?', createEmptyProject(), [image]);
  assert.equal(response?.kind, 'advice');
  assert.match(response?.message ?? '', /image|pacing|title/i);
});

test('asks for title copy when a title request has no usable text', () => {
  const response = classifyBrowserConversation('Add a warm title near the beginning.', createEmptyProject(), [image]);
  assert.deepEqual(response, { kind: 'chat', message: 'What should the title say? Put the exact text in quotation marks so I can propose it safely.' });
});

test('does not intercept a quoted executable title request', () => {
  assert.equal(classifyBrowserConversation('Add the title "Warm Welcome" near the beginning.', createEmptyProject(), [image]), null);
});

test('does not intercept valid editing and complete-reel requests', () => {
  assert.equal(classifyBrowserConversation('Add title: Warm Welcome at the beginning.', createEmptyProject(), [image]), null);
  assert.equal(classifyBrowserConversation('Make my reel more engaging.', createEmptyProject(), [image]), null);
  assert.equal(classifyBrowserConversation('Create a reel with the title Handmade With Love.', createEmptyProject(), [image]), null);
});
