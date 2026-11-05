import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogMediaId, isCatalogMediaId, catalogPlaybackUrl, resolveCatalogEntry, type AudioLibraryEntry } from './audioLibrary.ts';

const entry: AudioLibraryEntry = { id: 'calm-01', title: 'Calm', category: 'ambient', type: 'music', duration_seconds: 4, content_type: 'audio/mpeg', tags: ['soft'], license: 'CC0', attribution: null, source: 'catalog', evidence_reference: 'license-record', playback_url: '/static/audio/calm.mp3' };

test('catalog media IDs remain distinct from uploaded media IDs', () => {
  assert.equal(catalogMediaId(entry.id), 'catalog:calm-01');
  assert.equal(isCatalogMediaId('catalog:calm-01'), true);
  assert.equal(isCatalogMediaId('guest-media-01'), false);
});

test('relative catalog playback URLs resolve through the API origin', () => {
  assert.equal(catalogPlaybackUrl(entry).endsWith('/static/audio/calm.mp3'), true);
});

test('resolves a persisted numeric SFX ID to the current stable catalog record', () => {
  const current = { ...entry, id: '5e99826447cf966cdce1414f60c259cc89405c89', title: '877112 zenosounds cinematic whoosh' };
  assert.equal(resolveCatalogEntry([current], 'catalog:877112')?.id, current.id);
  assert.equal(resolveCatalogEntry([current], 'catalog:not-a-legacy-id'), undefined);
});
