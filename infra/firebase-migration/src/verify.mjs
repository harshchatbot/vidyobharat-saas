import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getFirestoreDb, getRealtimeDb, getFirebaseAuth, getFirebaseStorageBucket } from './firebase.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { readJson, writeJson } from './utils/fs.mjs';

export async function runVerify() {
  const report = {
    started_at: new Date().toISOString(),
    firestore: {},
    rtdb: {},
    auth: {},
    storage: {},
  };

  const rawManifest = await readJson(path.join(config.outputDir, 'raw', 'manifest.json'));
  const firestore = getFirestoreDb();

  if (config.migrationTarget === 'firestore' || config.migrationTarget === 'both') {
    for (const [fileName, meta] of Object.entries(rawManifest)) {
      if (meta.schema !== 'public') continue;
      const collection = meta.table;
      const snapshot = await firestore.collection(collection).count().get();
      report.firestore[collection] = { expected: meta.rows, actual: snapshot.data().count };
    }
  }

  if (config.migrationTarget === 'rtdb' || config.migrationTarget === 'both') {
    const db = getRealtimeDb();
    const root = await db.ref('/rangmanch_migration').get();
    report.rtdb.collections = root.exists() ? Object.keys(root.val()).length : 0;
  }

  const auth = getFirebaseAuth();
  const authUsers = await readJson(path.join(config.outputDir, 'raw', 'auth.users.export.json'));
  report.auth.expected_users = authUsers.length;
  report.auth.actual_users = await countFirebaseUsers(auth);

  const firebaseBucket = getFirebaseStorageBucket();
  for (const bucket of config.supabase.storageBuckets) {
    const sourceObjects = await readJson(path.join(config.outputDir, 'raw', `storage.${bucket}.objects.json`));
    const [files] = await firebaseBucket.getFiles({ prefix: `${bucket}/` });
    report.storage[bucket] = { expected: sourceObjects.length, actual: files.length };
  }

  report.finished_at = new Date().toISOString();
  await writeJson(path.join(config.outputDir, 'logs', 'verification-report.json'), report);
  logger.info('verification_finished', report);
  return report;
}

async function countFirebaseUsers(auth) {
  let total = 0;
  let nextPageToken;
  do {
    const page = await auth.listUsers(1000, nextPageToken);
    total += page.users.length;
    nextPageToken = page.pageToken;
  } while (nextPageToken);
  return total;
}

async function main() {
  try {
    await runVerify();
  } catch (error) {
    logger.error('verification_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
