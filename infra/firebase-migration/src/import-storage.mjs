import path from 'node:path';
import { pathToFileURL } from 'node:url';
import pLimit from 'p-limit';

import { config } from './config.mjs';
import { getFirebaseStorageBucket } from './firebase.mjs';
import { logger } from './logger.mjs';
import { readJson } from './utils/fs.mjs';
import { downloadStorageObject } from './supabase.mjs';
import { withRetry } from './utils/retry.mjs';

export async function runImportStorage() {
  const bucket = getFirebaseStorageBucket();
  const limit = pLimit(config.concurrency);

  for (const sourceBucket of config.supabase.storageBuckets) {
    const objects = await readJson(path.join(config.outputDir, 'raw', `storage.${sourceBucket}.objects.json`));
    logger.info('storage_import_bucket_start', { bucket: sourceBucket, objects: objects.length });
    await Promise.all(
      objects.map((object) =>
        limit(async () => {
          const buffer = await downloadStorageObject(sourceBucket, object.name);
          const targetFile = bucket.file(`${sourceBucket}/${object.name}`);
          await withRetry(
            () => targetFile.save(buffer, {
              resumable: false,
              metadata: {
                contentType: object.metadata?.mimetype || 'application/octet-stream',
                cacheControl: object.metadata?.cacheControl || undefined,
                metadata: {
                  sourceBucket,
                  sourceObjectPath: object.name,
                  sourceObjectId: String(object.id),
                },
              },
            }),
            {},
          );
          logger.info('storage_object_uploaded', { sourceBucket, objectPath: object.name });
        }),
      ),
    );
    logger.info('storage_import_bucket_finished', { bucket: sourceBucket });
  }
}

async function main() {
  try {
    await runImportStorage();
  } catch (error) {
    logger.error('storage_import_failed', { error: error.message, stack: error.stack });
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main();
}
