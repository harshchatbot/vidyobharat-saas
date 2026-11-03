'use strict';
const { onObjectFinalized, onObjectMetadataUpdated, onObjectDeleted } = require('firebase-functions/v2/storage');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');
const { createHash } = require('node:crypto');
const { parseBuffer } = require('music-metadata');

if (!getApps().length) initializeApp();
const collection = () => getFirestore().collection('editor_audio_library');
const supported = (name) => /^(sfx|audio-library\/sfx)\/.+\.(wav|mp3|ogg)$/i.test(name || '');
const idFor = (name) => createHash('sha256').update(name).digest('hex').slice(0, 40);
const MAX_BYTES = 12 * 1024 * 1024;

async function synchronize(event) {
  const object = event.data || {};
  const path = object.name;
  if (!supported(path)) return;
  const ref = collection().doc(idFor(path));
  const metadata = object.metadata || {};
  const license = String(metadata.license || 'unverified');
  const approved = metadata.redistribution_confirmed === 'true' &&
    ['CC0', 'CC0-1.0'].includes(license.toUpperCase()) &&
    Boolean(metadata.evidence_reference && metadata.source);
  const bytes = Number(object.size || 0);
  if (!(bytes > 0 && bytes <= MAX_BYTES)) return;
  let duration = Number(metadata.duration_seconds || 0);
  if (!(duration > 0 && duration <= 3600)) {
    try {
      const [buffer] = await getStorage().bucket(object.bucket).file(path).download();
      const result = await parseBuffer(buffer, object.contentType || undefined, { duration: true });
      duration = Number(result.format.duration);
    } catch (error) {
      console.warn('Could not determine SFX duration', path, String(error));
      return;
    }
  }
  if (!(duration > 0 && duration <= 3600)) return;
  const title = path.split('/').pop().replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ').slice(0, 200);
  const contentType = object.contentType?.startsWith('audio/') ? object.contentType :
    path.toLowerCase().endsWith('.mp3') ? 'audio/mpeg' : path.toLowerCase().endsWith('.ogg') ? 'audio/ogg' : 'audio/wav';
  const tags = String(metadata.tags || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 20);
  const existing = await ref.get();
  // Never overwrite manually retired entries.
  if (existing.exists && existing.get('status') === 'retired') return;
  await ref.set({
    title, category: String(metadata.category || 'sfx').slice(0, 80), type: 'sfx',
    duration_seconds: duration, content_type: contentType, tags, license,
    attribution: metadata.attribution || null, source: metadata.source || 'firebase-storage',
    evidence_reference: metadata.evidence_reference || 'pending-verification',
    playback_url: '', storage_path: path, status: approved ? 'published' : 'draft',
    updated_at: new Date(),
    ...(existing.exists ? {} : { created_at: new Date() }),
  }, { merge: true });
}
exports.onSfxUploaded = onObjectFinalized({ region: 'us-central1', memory: '256MiB' }, synchronize);
exports.onSfxMetadataChanged = onObjectMetadataUpdated({ region: 'us-central1', memory: '256MiB' }, synchronize);
exports.onSfxDeleted = onObjectDeleted({ region: 'us-central1' }, async event => {
  const path = event.data?.name;
  if (!supported(path)) return;
  const ref = collection().doc(idFor(path));
  const doc = await ref.get();
  if (doc.exists && doc.get('storage_path') === path) await ref.update({ status: 'retired', updated_at: new Date() });
});
