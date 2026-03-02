import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { config } from './config.mjs';
import { getFirebaseAuth } from './firebase.mjs';
import { logger } from './logger.mjs';
import { readJson, writeJson } from './utils/fs.mjs';
import { chunk } from './utils/chunk.mjs';

export async function runImportAuth() {
  const auth = getFirebaseAuth();
  const users = await readJson(path.join(config.outputDir, 'raw', 'auth.users.export.json'));
  const resetCandidates = [];

  for (const group of chunk(users, 500)) {
    const importUsers = [];
    for (const user of group) {
      const baseRecord = {
        uid: user.id,
        email: user.email || undefined,
        phoneNumber: user.phone || undefined,
        emailVerified: Boolean(user.email_confirmed_at),
        displayName: user.raw_user_meta_data?.full_name || user.raw_user_meta_data?.name || undefined,
        photoURL: user.raw_user_meta_data?.avatar_url || user.raw_user_meta_data?.picture || undefined,
        disabled: false,
      };

      if (config.authImportMode === 'hash' && user.encrypted_password) {
        importUsers.push({
          ...baseRecord,
          passwordHash: Buffer.from(user.encrypted_password),
        });
      } else {
        importUsers.push(baseRecord);
        if (user.email) {
          resetCandidates.push({ uid: user.id, email: user.email, reason: 'password_reset_required' });
        }
      }
    }

    if (config.authImportMode === 'hash') {
      const result = await auth.importUsers(importUsers, {
        hash: {
          algorithm: 'BCRYPT',
        },
      });
      logger.info('firebase_auth_import_batch', { imported: result.successCount, failed: result.failureCount });
      if (result.failureCount > 0) {
        result.errors.forEach((entry) => logger.warn('firebase_auth_import_error', { index: entry.index, error: entry.error.message }));
      }
    } else {
      for (const user of importUsers) {
        await auth.importUsers([user]);
      }
      logger.info('firebase_auth_import_batch', { imported: importUsers.length, failed: 0, mode: 'reset' });
    }
  }

  await writeJson(path.join(config.outputDir, 'transformed', 'firebase-auth-reset-candidates.json'), resetCandidates);
  logger.info('firebase_auth_import_finished', { resetCandidates: resetCandidates.length, mode: config.authImportMode });
}

async function main() {
  try {
    await runImportAuth();
  } catch (error) {
    logger.error('firebase_auth_import_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
