import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { getFirebaseAuth } from './firebase.mjs';
import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { readJson, writeJson } from './utils/fs.mjs';

export async function runGenerateResetLinks() {
  const auth = getFirebaseAuth();
  const candidates = await readJson(path.join(config.outputDir, 'transformed', 'firebase-auth-reset-candidates.json'));
  const results = [];

  for (const candidate of candidates) {
    if (!candidate.email) continue;
    const link = await auth.generatePasswordResetLink(candidate.email);
    results.push({ ...candidate, reset_link: link, generated_at: new Date().toISOString() });
  }

  await writeJson(path.join(config.outputDir, 'transformed', 'firebase-password-reset-links.json'), results);
  logger.info('firebase_reset_links_generated', { count: results.length });
  return results;
}

async function main() {
  try {
    await runGenerateResetLinks();
  } catch (error) {
    logger.error('firebase_reset_link_generation_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
