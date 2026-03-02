import path from 'node:path';
import { Pool } from 'pg';

import { config } from './config.mjs';
import { logger } from './logger.mjs';
import { withRetry } from './utils/retry.mjs';
import { writeJson } from './utils/fs.mjs';

const pool = new Pool({
  connectionString: config.supabase.databaseUrl,
  max: config.concurrency,
  ssl: config.supabase.databaseUrl.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
});

export async function testConnection() {
  const client = await pool.connect();
  try {
    const result = await client.query('select current_database() as database, current_user as current_user, version() as version');
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function exportTable(schema, table) {
  const client = await pool.connect();
  try {
    const query = `select * from ${schema}.${table}`;
    const result = await client.query(query);
    logger.info('table_exported', { schema, table, rows: result.rows.length });
    return result.rows.map(serializeRow);
  } finally {
    client.release();
  }
}

export async function exportAllTables() {
  const manifest = {};
  for (const item of config.appSchemaTables) {
    const rows = await exportTable(item.schema, item.table);
    const fileName = `${item.schema}.${item.table}.json`;
    await writeJson(path.join(config.outputDir, 'raw', fileName), rows);
    manifest[fileName] = { schema: item.schema, table: item.table, rows: rows.length };
  }
  await writeJson(path.join(config.outputDir, 'raw', 'manifest.json'), manifest);
  return manifest;
}

export async function listStorageObjects(bucket) {
  const rows = await exportStorageObjectsTable(bucket);
  return rows.map((row) => ({
    bucket_id: row.bucket_id,
    name: row.name,
    metadata: row.metadata || {},
    version: row.version,
    created_at: row.created_at,
    updated_at: row.updated_at,
    id: row.id,
  }));
}

async function exportStorageObjectsTable(bucket) {
  const client = await pool.connect();
  try {
    const result = await client.query('select * from storage.objects where bucket_id = $1 order by name asc', [bucket]);
    return result.rows.map(serializeRow);
  } finally {
    client.release();
  }
}

export async function exportAuthUsers() {
  const client = await pool.connect();
  try {
    const result = await client.query(`
      select
        id,
        email,
        phone,
        created_at,
        updated_at,
        email_confirmed_at,
        last_sign_in_at,
        raw_user_meta_data,
        raw_app_meta_data,
        encrypted_password,
        aud,
        role,
        is_sso_user
      from auth.users
      order by created_at asc
    `);
    const rows = result.rows.map(serializeRow);
    await writeJson(path.join(config.outputDir, 'raw', 'auth.users.export.json'), rows);
    return rows;
  } finally {
    client.release();
  }
}

export async function downloadStorageObject(bucket, objectPath) {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const url = `${config.supabase.url}/storage/v1/object/${bucket}/${encodedPath}`;
  const response = await withRetry(
    () => fetch(url, {
      headers: {
        apikey: config.supabase.serviceRoleKey,
        Authorization: `Bearer ${config.supabase.serviceRoleKey}`,
      },
    }),
    {
      shouldRetry: (error) => Boolean(error),
    },
  );
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to download storage object ${bucket}/${objectPath}: ${response.status} ${body}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

export async function closeSupabasePool() {
  await pool.end();
}

function serializeRow(row) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (value instanceof Date) return [key, value.toISOString()];
      return [key, value];
    }),
  );
}
