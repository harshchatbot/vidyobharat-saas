# Add a Public UGC AI Avatar

This guide documents the **shared public preset avatar** flow used by RangManch today for UGC ads and avatar-led product ads.

Use this when you want a new AI avatar to be available to **all users** in the avatar picker for flows like:

- `avatar_product`
- `talking_avatar`

This guide is **not** for the private user-owned actor flow created through `/actors/create`.

## How the current flow works

The current source of truth is:

- Firestore collection: `avatars`
- Public picker API: `GET /api/avatars/library`
- Frontend consumer: `UnifiedCreateStudioClient`

An avatar shows up in the shared picker only if it resolves as a public avatar and has at least one usable image source:

- `primary_image`, or
- `thumbnail_url`, or
- `reference_images[0]`

The repo currently uses a **reference-image public avatar model**, not HeyGen.

## Prerequisites

Before adding a new avatar, make sure you have:

- Firebase service account access
- the Firebase Storage bucket name
- one final front-facing avatar image prepared
- a chosen recommended voice from the current supported voice catalog
- an avatar ID in the `av-<name>` format

Recommended asset shape:

- one clean, front-facing portrait
- realistic lighting
- no occluded face
- creator-style or spokesperson-style framing
- optional preview video if you already have one

## Required Firestore fields

At minimum, a public preset avatar should resolve with the following fields:

- `id`
- `name`
- `provider=reference_image`
- `avatar_type=system`
- `scope=public`
- `visibility=public`
- `status=active`
- `primary_image`
- `thumbnail_url`
- `reference_images`
- `recommended_voice`
- `category`
- `style`
- `description`
- `tags`

Language support can be stored as:

- `language_support`
- optionally `language_tags`

The backend accepts language data from `language_support`, `supported_languages`, or `language_tags`, but for new public avatars prefer `language_support` with locale codes like:

- `en-IN`
- `hi-IN`
- `ta-IN`

## Recommended naming

Use IDs like:

- `av-charulata`
- `av-neha`
- `av-raghav`

Keep names human-friendly:

- `Charulata`
- `Neha`
- `Raghav`

Recommended conventions:

- `category`: `ugc_creator` or `ugc_influencer`
- `provider`: `reference_image`
- `avatar_type`: `system`
- `scope`: `public`
- `visibility`: `public`
- `status`: `active`

## Add the avatar

### 1. Upload the reference image to Firebase Storage

Upload the final avatar image to a stable path such as:

```text
avatars/charulata/avatar_charulata.jpg
```

You will use this storage path in the seeding script.

### 2. Run the existing seeding helper

Use the existing helper:

```text
apps/api/scripts/seed_reference_avatar.py
```

Example:

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/apps/api
./venv/bin/python scripts/seed_reference_avatar.py \
  --service-account service-account.json \
  --bucket rangmanch-ai-backend.firebasestorage.app \
  --avatar-id av-charulata \
  --name Charulata \
  --gender female \
  --storage-path avatars/charulata/avatar_charulata.jpg \
  --voice Priya \
  --style "premium lifestyle creator" \
  --category ugc_creator \
  --description "Elegant Indian creator avatar suitable for premium UGC ads."
```

What the script does:

- verifies the image exists in Firebase Storage
- creates a public download token
- builds the public image URL
- writes or updates Firestore document `avatars/{avatar_id}`

### 3. Inspect the Firestore record

After running the script, verify:

- document exists at `avatars/av-charulata`
- `provider` is `reference_image`
- `avatar_type` is `system`
- `scope` is `public`
- `visibility` is `public`
- `status` is `active`
- `primary_image` is populated
- `thumbnail_url` is populated
- `reference_images[0]` is populated
- `recommended_voice` is present

The helper already writes the core fields the current code expects.

## Optional fields worth adding

If you want richer picker behavior, add or confirm:

- `preview_video_url`
- `language_tags`
- `prompt_template`
- `negative_prompt`
- `supported_languages`
- `voice_profile`

These are not required for the avatar to appear, but they improve metadata quality and preview behavior.

## Validate it end to end

### 1. Check the API

Call:

```text
GET /api/avatars/library
```

Confirm the avatar is returned in the `avatars` list.

### 2. Check the create picker

Open the create flow and select an avatar-driven recipe:

- `avatar_product`
- `talking_avatar`
- `ugc_ad` if the current flow exposes spokesperson selection there

Confirm:

- the avatar appears in the picker
- the thumbnail loads
- the recommended voice label appears if `recommended_voice` is set
- language tags show correctly if present

### 3. Check voice/language sync behavior

Current frontend behavior:

- picker prefers `recommended_voice` when available
- picker prefers the first language in `language_tags` when available

Current limitation:

- some voice/language defaults elsewhere in the app still fall back to values like `Shubh`, `Priya`, `en-IN`, or `hi-IN`
- do not assume every surface is fully driven by the avatar record yet

### 4. Run one render smoke test

Generate at least one:

- `ugc_ad`, or
- `avatar_product`

Confirm:

- avatar resolves successfully
- output renders without avatar lookup errors
- the selected voice/language path behaves as expected

## Troubleshooting

### Avatar is not visible in the picker

Check:

- `status` is `active`, `ready`, or `ready_for_preview`
- `scope` is `public`
- `visibility` is `public`
- `avatar_type` is `system`, or equivalent public flags are present
- one of these exists:
  - `primary_image`
  - `thumbnail_url`
  - `reference_images[0]`

### Avatar exists in Firestore but still does not show

Check:

- you wrote to `avatars`, not `actors`
- the document ID matches the intended avatar ID
- the picker API `GET /api/avatars/library` includes the avatar

If it is missing from the API response, the issue is backend field resolution rather than frontend rendering.

### Recommended voice does not apply

Check:

- `recommended_voice` is present
- the value exists in the current backend voice catalog

The backend validates and normalizes voice keys against the catalog, so unsupported values may fall back.

### Language preference does not apply

Check:

- `language_support` uses locale-style codes such as `en-IN`
- optionally mirror the same value in `language_tags`

The frontend currently reads avatar language hints from `language_tags`, so including both is safest for now.

## Current limitations

- Public avatars are currently reference-image driven, not HeyGen-driven.
- The picker and pipeline support public avatar metadata well, but voice/language defaults are still partly hardcoded in other create/runtime surfaces.
- This guide covers the **shared public preset** path only, not the private uploaded actor path.

## Related code paths

Useful references:

- `apps/api/scripts/seed_reference_avatar.py`
- `apps/api/app/services/avatar_service.py`
- `apps/api/app/api/routers/avatar_routes.py`
- `apps/web/src/components/create/UnifiedCreateStudioClient.tsx`

