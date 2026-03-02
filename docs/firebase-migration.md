# Firebase Migration Guide for RangManch AI

## Scope

This migration toolkit moves the current Supabase-backed platform to Firebase with these phases:

1. Export Supabase PostgreSQL tables to JSON.
2. Export Supabase Auth users.
3. Export Supabase Storage object metadata and copy files to Firebase Storage.
4. Transform relational rows into Firestore collections and a Realtime Database tree.
5. Import users into Firebase Auth.
6. Verify counts and samples before cutover.

Migration toolkit location:

- `infra/firebase-migration`

## Current data model covered

The exporter is tailored to the current application schema:

- `users`
- `projects`
- `renders`
- `assets`
- `videos`
- `image_generations`
- `asset_tags`
- `credit_wallets`
- `credit_transactions`
- `credit_topup_orders`
- `influencer_personas`
- `influencer_scene_presets`
- `auth.users`
- `storage.objects`

## Environment setup

1. Copy:

```bash
cd infra/firebase-migration
cp .env.example .env
```

2. Fill:

- `SUPABASE_DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_STORAGE_BUCKETS`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_DATABASE_URL` if using Realtime Database
- `FIREBASE_SERVICE_ACCOUNT_PATH`

3. Place the Firebase service account JSON at the path referenced by `FIREBASE_SERVICE_ACCOUNT_PATH`.

4. Install dependencies:

```bash
cd infra/firebase-migration
npm install
```

## Staging-first process

Do not run against production first.

### Phase A: Dry run on staging

1. Clone Supabase data into staging or use a staging Supabase project.
2. Create a separate staging Firebase project.
3. Run:

```bash
npm run export
npm run import:firestore
npm run import:rtdb
npm run import:auth
npm run import:storage
npm run verify
```

4. Review:

- `output/raw/manifest.json`
- `output/transformed/firestore.collections.json`
- `output/transformed/realtimedb.export.json`
- `output/transformed/firebase-auth-reset-candidates.json`
- `output/logs/verification-report.json`

### Phase B: Production cutover with minimal downtime

1. Announce read-only maintenance window.
2. Disable new writes in the app or place write-heavy flows behind maintenance mode.
3. Run final export from production Supabase.
4. Run imports to production Firebase.
5. Run verification.
6. Switch backend/frontend environment variables to Firebase.
7. Re-enable writes.
8. Monitor auth sign-ins, uploads, and generated asset reads.

## Data transformation strategy

### Firestore

The migration keeps collections mostly one-to-one with the SQL tables to avoid destructive reshaping.

Relationships are preserved using:

- explicit foreign key fields such as `user_id`, `project_id`, `persona_id`
- `_refs` fields containing Firestore-style document references as strings
- denormalized tags on `videos`, `image_generations`, and `assets`

This reduces migration risk and keeps backend reimplementation straightforward.

### Realtime Database

A complete tree is also produced under `rangmanch_migration/`.

Use Realtime Database only if you have a concrete need for it. Firestore is the recommended primary target for this project.

## Auth migration details

### Password preservation

By default the toolkit uses:

- `AUTH_IMPORT_MODE=reset`

This imports user identities into Firebase Auth and outputs a reset-candidate file.

Reason:

- Password-hash interoperability between Supabase GoTrue and Firebase must be validated carefully per project.
- A forced reset is the safest production migration path.

### Optional hash import

Set:

```env
AUTH_IMPORT_MODE=hash
```

The script will attempt to import `auth.users.encrypted_password` using Firebase Admin import hashing.

You must validate this in staging first. If the hash algorithm or format is incompatible, do not use this mode in production.

### Secure reset flow

If using reset mode:

1. Run:

```bash
npm run auth:reset-links
```

2. Distribute the generated reset links from:

- `output/transformed/firebase-password-reset-links.json`

This gives you a secure operational path for users whose passwords are not imported directly.

## Storage migration details

The script:

1. lists objects from `storage.objects`
2. downloads them from Supabase Storage using the service role key
3. uploads them into Firebase Storage using the same logical path under the source bucket namespace

Example:

- Supabase: `rangmanch-assets/influencer-references/abc.png`
- Firebase: `rangmanch-assets/influencer-references/abc.png`

Metadata preserved where available:

- `contentType`
- `cacheControl`
- custom metadata for source bucket/path/object id

## Verification checklist

After import, confirm:

1. Row/document counts match for every exported table.
2. Sample user records match email, display name, and avatar URL.
3. Sample persona records retain:
   - `reference_image_url`
   - `style_embedding_vector`
   - `character_locked`
4. Sample video records retain:
   - `script`
   - `selected_model`
   - `output_url`
   - `music_*`
5. Credit wallets and transactions line up for several users.
6. Storage object counts match by bucket.
7. Firebase Auth user count matches expected users.
8. Reset candidates file is generated if running in reset mode.

## Frontend/backend cutover checklist

### Backend changes to make after migration

1. Replace Supabase JWT verification in:
   - `apps/api/app/api/deps.py`
   with Firebase ID token verification via Firebase Admin.

2. Replace Supabase storage provider in:
   - `apps/api/app/providers/storage.py`
   with a Firebase Storage provider.

3. Remove Supabase settings from:
   - `apps/api/app/core/config.py`
   and add:
   - Firebase project id
   - Firebase storage bucket
   - Firebase service account path or JSON

4. Replace Postgres-backed repository logic with Firestore access layer.
   Recommended first targets:
   - users
   - wallets
   - videos
   - image_generations
   - influencer_personas

5. Replace `DATABASE_URL` deployment dependency once Firestore is primary.

### Frontend changes to make after migration

1. Replace:
   - `apps/web/src/lib/supabase-auth.ts`
   with Firebase Auth SDK helpers.

2. Update env usage in:
   - `apps/web/src/lib/env.ts`
   to Firebase values.

3. Replace Google sign-in flow with:
   - Firebase `signInWithPopup` or `signInWithRedirect`

4. Replace email/password auth with Firebase Auth SDK:
   - `createUserWithEmailAndPassword`
   - `sendEmailVerification`
   - `signInWithEmailAndPassword`
   - `sendPasswordResetEmail`

5. Replace storage upload flows to Firebase Storage SDK.

6. If moving backend data access fully to Firebase, remove frontend assumptions about Supabase callback/session semantics.

## Operational guidance

- Run staging first.
- Do not preserve passwords in production unless validated end-to-end.
- Keep Supabase read-only access available for rollback during the first production window.
- Export artifacts should be retained until sign-in, storage, and wallet consistency are confirmed.
