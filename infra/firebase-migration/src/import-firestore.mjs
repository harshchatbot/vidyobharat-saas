import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getFirestoreDb } from './firebase.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { readJson } from './utils/fs.mjs';
import { chunk } from './utils/chunk.mjs';
import { buildFirestorePayload } from './transformers/firestore.mjs';

export async function runImportFirestore() {
  const db = getFirestoreDb();
  const transformedPath = path.join(config.outputDir, 'transformed', 'firestore.collections.json');
  let payload;
  try {
    payload = await readJson(transformedPath);
  } catch {
    ({ collections: payload } = await buildFirestorePayload());
  }

  for (const [collectionName, docs] of Object.entries(payload)) {
    logger.info('firestore_collection_import_start', { collection: collectionName, docs: docs.length });
    for (const batchItems of chunk(docs, config.batchSize)) {
      const batch = db.batch();
      for (const doc of batchItems) {
        batch.set(db.collection(collectionName).doc(doc.id), sanitizeForFirestore(doc.data), { merge: true });
      }
      await batch.commit();
    }
    logger.info('firestore_collection_import_finished', { collection: collectionName, docs: docs.length });
  }
}

function sanitizeForFirestore(data) {
  if (Array.isArray(data)) return data.map(sanitizeForFirestore);
  if (data && typeof data === 'object') {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, sanitizeForFirestore(value)]),
    );
  }
  return data;
}

async function main() {
  try {
    await runImportFirestore();
  } catch (error) {
    logger.error('firestore_import_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
