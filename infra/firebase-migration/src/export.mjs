import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { exportAllTables, exportAuthUsers, listStorageObjects, testConnection, closeSupabasePool } from './supabase.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { writeJson } from './utils/fs.mjs';

export async function runExport() {
  logger.info('export_started', { target: config.migrationTarget });
  const connection = await testConnection();
  logger.info('supabase_connection_ok', connection);

  const manifest = await exportAllTables();
  const authUsers = await exportAuthUsers();
  logger.info('auth_users_exported', { users: authUsers.length });

  const storageManifest = {};
  for (const bucket of config.supabase.storageBuckets) {
    const objects = await listStorageObjects(bucket);
    await writeJson(path.join(config.outputDir, 'raw', `storage.${bucket}.objects.json`), objects);
    storageManifest[bucket] = objects.length;
  }
  await writeJson(path.join(config.outputDir, 'raw', 'storage.manifest.json'), storageManifest);
  logger.info('storage_objects_exported', storageManifest);
  logger.info('export_finished', { manifest });

  return { manifest, authUsers: authUsers.length, storageManifest };
}

async function main() {
  try {
    await runExport();
  } catch (error) {
    logger.error('export_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    await closeSupabasePool();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
