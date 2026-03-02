import path from 'node:path';

import { config } from '../config.mjs';
import { readJson, writeJson } from '../utils/fs.mjs';

function byAssetTags(assetTags, assetType, assetId, source) {
  return assetTags
    .filter((tag) => tag.asset_type === assetType && tag.asset_id === assetId && (!source || tag.source === source))
    .map((tag) => tag.tag);
}

function toFirestoreTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toISOString();
}

export async function buildFirestorePayload() {
  const rawDir = path.join(config.outputDir, 'raw');
  const [
    users,
    projects,
    renders,
    assets,
    videos,
    images,
    assetTags,
    wallets,
    transactions,
    topups,
    personas,
    scenes,
  ] = await Promise.all([
    readJson(path.join(rawDir, 'public.users.json')),
    readJson(path.join(rawDir, 'public.projects.json')),
    readJson(path.join(rawDir, 'public.renders.json')),
    readJson(path.join(rawDir, 'public.assets.json')),
    readJson(path.join(rawDir, 'public.videos.json')),
    readJson(path.join(rawDir, 'public.image_generations.json')),
    readJson(path.join(rawDir, 'public.asset_tags.json')),
    readJson(path.join(rawDir, 'public.credit_wallets.json')),
    readJson(path.join(rawDir, 'public.credit_transactions.json')),
    readJson(path.join(rawDir, 'public.credit_topup_orders.json')),
    readJson(path.join(rawDir, 'public.influencer_personas.json')),
    readJson(path.join(rawDir, 'public.influencer_scene_presets.json')),
  ]);

  const collections = {
    users: users.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        credit_wallet_id: row.id,
      },
    })),
    projects: projects.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        _refs: {
          user: `users/${row.user_id}`,
        },
      },
    })),
    renders: renders.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        updated_at: toFirestoreTimestamp(row.updated_at),
        _refs: {
          user: `users/${row.user_id}`,
          project: `projects/${row.project_id}`,
        },
      },
    })),
    assets: assets.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        auto_tags: byAssetTags(assetTags, row.kind, row.id, 'auto'),
        user_tags: byAssetTags(assetTags, row.kind, row.id, 'user'),
        _refs: {
          user: `users/${row.user_id}`,
          project: row.project_id ? `projects/${row.project_id}` : null,
        },
      },
    })),
    videos: videos.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        updated_at: toFirestoreTimestamp(row.updated_at),
        image_urls: safeJson(row.image_urls, []),
        reference_images: safeJson(row.reference_images, []),
        auto_tags: byAssetTags(assetTags, 'video', row.id, 'auto'),
        user_tags: byAssetTags(assetTags, 'video', row.id, 'user'),
        _refs: { user: `users/${row.user_id}` },
      },
    })),
    image_generations: images.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        reference_urls: safeJson(row.reference_urls, []),
        auto_tags: byAssetTags(assetTags, 'image', row.id, 'auto'),
        user_tags: byAssetTags(assetTags, 'image', row.id, 'user'),
        _refs: {
          user: `users/${row.user_id}`,
          parent_image: row.parent_image_id ? `image_generations/${row.parent_image_id}` : null,
        },
      },
    })),
    credit_wallets: wallets.map((row) => ({
      id: row.user_id,
      data: {
        ...row,
        last_reset: toFirestoreTimestamp(row.last_reset),
        _refs: { user: `users/${row.user_id}` },
      },
    })),
    credit_transactions: transactions.map((row) => ({
      id: String(row.id),
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        metadata_json: safeJson(row.metadata_json, {}),
        _refs: { user: `users/${row.user_id}`, wallet: `credit_wallets/${row.user_id}` },
      },
    })),
    credit_topup_orders: topups.map((row) => ({
      id: String(row.id),
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        verified_at: toFirestoreTimestamp(row.verified_at),
        metadata_json: safeJson(row.metadata_json, {}),
        _refs: { user: `users/${row.user_id}`, wallet: `credit_wallets/${row.user_id}` },
      },
    })),
    influencer_personas: personas.map((row) => ({
      id: row.id,
      data: {
        ...row,
        personality_traits: safeJson(row.personality_traits, []),
        reference_embedding_vector: safeJson(row.reference_embedding_vector, []),
        style_embedding_vector: safeJson(row.style_embedding_vector, []),
        created_at: toFirestoreTimestamp(row.created_at),
        updated_at: toFirestoreTimestamp(row.updated_at),
        _refs: { user: `users/${row.user_id}` },
      },
    })),
    influencer_scene_presets: scenes.map((row) => ({
      id: row.id,
      data: {
        ...row,
        created_at: toFirestoreTimestamp(row.created_at),
        _refs: {
          user: `users/${row.user_id}`,
          persona: row.persona_id ? `influencer_personas/${row.persona_id}` : null,
        },
      },
    })),
    migration_meta: [
      {
        id: 'summary',
        data: {
          exported_at: new Date().toISOString(),
          source: 'supabase',
          target: 'firestore',
          collections: Object.fromEntries(
            Object.entries({ users, projects, renders, assets, videos, images, wallets, transactions, topups, personas, scenes }).map(([key, value]) => [key, value.length]),
          ),
        },
      },
    ],
  };

  const outputPath = path.join(config.outputDir, 'transformed', 'firestore.collections.json');
  await writeJson(outputPath, collections);
  return { outputPath, collections };
}

function safeJson(raw, fallback) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}
