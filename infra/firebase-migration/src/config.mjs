import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.resolve(rootDir, relativePath), 'utf8'));
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const appSchemaTables = [
  { schema: 'public', table: 'users', idField: 'id' },
  { schema: 'public', table: 'projects', idField: 'id' },
  { schema: 'public', table: 'renders', idField: 'id' },
  { schema: 'public', table: 'assets', idField: 'id' },
  { schema: 'public', table: 'videos', idField: 'id' },
  { schema: 'public', table: 'image_generations', idField: 'id' },
  { schema: 'public', table: 'asset_tags', idField: 'id' },
  { schema: 'public', table: 'credit_wallets', idField: 'user_id' },
  { schema: 'public', table: 'credit_transactions', idField: 'id' },
  { schema: 'public', table: 'credit_topup_orders', idField: 'id' },
  { schema: 'public', table: 'influencer_personas', idField: 'id' },
  { schema: 'public', table: 'influencer_scene_presets', idField: 'id' },
  { schema: 'auth', table: 'users', idField: 'id' },
  { schema: 'storage', table: 'objects', idField: 'id' },
];

export const config = {
  rootDir,
  outputDir: path.resolve(rootDir, process.env.OUTPUT_DIR || './output'),
  supabase: {
    databaseUrl: required('SUPABASE_DATABASE_URL'),
    url: required('SUPABASE_URL').replace(/\/$/, ''),
    serviceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
    storageBuckets: (process.env.SUPABASE_STORAGE_BUCKETS || 'rangmanch-assets')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  },
  firebase: {
    projectId: required('FIREBASE_PROJECT_ID'),
    storageBucket: required('FIREBASE_STORAGE_BUCKET'),
    databaseURL: process.env.FIREBASE_DATABASE_URL || '',
    serviceAccountPath: path.resolve(rootDir, process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './service-account.json'),
  },
  migrationTarget: (process.env.MIGRATION_TARGET || 'both').toLowerCase(),
  authImportMode: (process.env.AUTH_IMPORT_MODE || 'reset').toLowerCase(),
  batchSize: Number(process.env.FIRESTORE_BATCH_SIZE || 400),
  concurrency: Number(process.env.CONCURRENCY || 8),
  verifySampleSize: Number(process.env.VERIFY_SAMPLE_SIZE || 5),
  logLevel: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  creditPlans: readJson('../../apps/api/app/core/credit_plans.json'),
  creditPricing: readJson('../../apps/api/app/core/credit_pricing.json'),
  appSchemaTables,
};

fs.mkdirSync(config.outputDir, { recursive: true });
fs.mkdirSync(path.join(config.outputDir, 'raw'), { recursive: true });
fs.mkdirSync(path.join(config.outputDir, 'transformed'), { recursive: true });
fs.mkdirSync(path.join(config.outputDir, 'logs'), { recursive: true });
