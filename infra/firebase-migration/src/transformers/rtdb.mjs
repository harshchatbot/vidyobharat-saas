import path from 'node:path';

import { config } from '../config.mjs';
import { readJson, writeJson } from '../utils/fs.mjs';

export async function buildRealtimeDatabasePayload() {
  const firestorePayload = await readJson(path.join(config.outputDir, 'transformed', 'firestore.collections.json'));
  const tree = {};

  for (const [collectionName, docs] of Object.entries(firestorePayload)) {
    tree[collectionName] = {};
    for (const doc of docs) {
      tree[collectionName][doc.id] = doc.data;
    }
  }

  const outputPath = path.join(config.outputDir, 'transformed', 'realtimedb.export.json');
  await writeJson(outputPath, tree);
  return { outputPath, tree };
}
