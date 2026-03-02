import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getRealtimeDb } from './firebase.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { readJson } from './utils/fs.mjs';
import { buildRealtimeDatabasePayload } from './transformers/rtdb.mjs';

export async function runImportRtdb() {
  const db = getRealtimeDb();
  const transformedPath = path.join(config.outputDir, 'transformed', 'realtimedb.export.json');
  let payload;
  try {
    payload = await readJson(transformedPath);
  } catch {
    ({ tree: payload } = await buildRealtimeDatabasePayload());
  }
  await db.ref('/rangmanch_migration').set(payload);
  logger.info('rtdb_import_finished', { nodes: Object.keys(payload).length });
}

async function main() {
  try {
    await runImportRtdb();
  } catch (error) {
    logger.error('rtdb_import_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
