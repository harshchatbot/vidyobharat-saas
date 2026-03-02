import { pathToFileURL } from 'node:url';

import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { runExport } from './export.mjs';
import { runImportFirestore } from './import-firestore.mjs';
import { runImportRtdb } from './import-rtdb.mjs';
import { runImportAuth } from './import-auth.mjs';
import { runImportStorage } from './import-storage.mjs';
import { runVerify } from './verify.mjs';
import { closeSupabasePool } from './supabase.mjs';

export async function runMigration() {
  logger.info('migration_orchestrator_start');
  await runExport();
  if (config.migrationTarget === 'firestore' || config.migrationTarget === 'both') {
    await runImportFirestore();
  }
  if (config.migrationTarget === 'rtdb' || config.migrationTarget === 'both') {
    await runImportRtdb();
  }
  await runImportAuth();
  await runImportStorage();
  await runVerify();
  logger.info('migration_orchestrator_finished');
}

async function main() {
  try {
    await runMigration();
  } catch (error) {
    logger.error('migration_orchestrator_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  } finally {
    await closeSupabasePool();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
