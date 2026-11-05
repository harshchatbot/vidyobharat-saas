# RangManch admin-managed asset library (LUTs, emoji and music)

Implemented on feature branch `feature/video-first-auto-edit-v1` — not deployed.

## Architecture

- Admin interface: `http://localhost:3000/admin/assets`
- Backend: `apps/api/app/api/routers/visual_asset_routes.py`
- Registry: Firestore collection `editor_visual_assets`
- Object bytes: existing **Firebase Storage**, private logical prefixes
  `visual-library/lut/`, `visual-library/emoji/`, `visual-library/music/`.
- Seed files: `app/assets/luts.seed.json`, `emojis.seed.json`, `music.seed.json`.
- Initial data: **6 LUT** presets, **64 emoji** definitions, **23 music**
  tracks from supplied manifests = **93 draft records**.
- Seed is on-demand from the admin UI and idempotent. Running again never
  overwrites an edited Firestore record.
- Add or edit from the admin UI without redeploying. Details JSON, title,
  descriptions, tags, license and evidence remain editable.
- All create/edit/upload/preview/publish/retire routes require
  `require_admin_principal` (Firebase admin). Public listing and content only
  expose explicitly published assets.
- Publishing checks file existence/size/type, SHA256 reference, documented
  permission and evidence, after an administrator's review.
- A file upload resets approval to draft and revokes previous confirmation.
- Remote asset URLs from user manifests are stored as **metadata** only.
  Nothing is automatically fetched from them.

## Music licensing warning — critical

Official Mixkit Free Music licence permits a range of commercial **finished
video** uses, but Mixkit terms restrict redistribution or repackaging of the
original music as a stock inventory inside a third-party service. Using tracks
as a browser-selectable embedded SaaS asset library is **not automatically
authorized** by a creator's commercial video-use license.

All 23 provided Mixkit entries import as **drafts**. The backend explicitly
refuses publishing tracks identified as Mixkit, even if a checkbox is enabled.
Do not circumvent the restriction by falsifying the `source` or `license`.
Use separately licensed music with explicit SaaS distribution/sublicensing
rights, obtain direct permission, or implement a suitably licensed provider
integration instead.

Official terms: https://mixkit.co/terms/
Official music license: https://mixkit.co/license/modal/musicFree/

For LUTs: the metadata and generator names are not actual `.cube` bytes.
Confirm the `spectral_film_lut` source and distributable file license
individually. Film-stock trademarks are descriptive, not endorsements.
For emojis: validate file provenance and retain applicable Microsoft Fluent
Emoji MIT notices; uploaded PNG/APNG must pass structural checks.

## Try locally

```bash
cd ~/Downloads/vidyobharat-saas
git pull --ff-only origin feature/video-first-auto-edit-v1

cd apps/api
source .venv/bin/activate
python -m pytest tests/test_visual_asset_library.py -q
uvicorn app.main:app --reload --port 8000

# In another terminal:
cd ~/Downloads/vidyobharat-saas/apps/web
npm run dev
```

Then navigate to `http://localhost:3000/admin/assets`, sign in as the
configured Firebase administrator, and click **Import preset library**.
This operation requires your Firestore and Firebase Storage configuration.
It **does not** publish or download any assets.

For new items: Add asset → Create draft → Upload actual file → Save
metadata/rights evidence → Publish. The status is controlled from the UI.
Supported files: checked 3D `.cube`, PNG/APNG, MP3 (requires `ffprobe`).
Admin-only preview is available for uploaded files.

Important: the public asset listing endpoint
`GET /api/editor/visual-assets?kind=emoji|lut|music` only exposes
rights-cleared published files. The AI V2.1 asset resolver and full editor
timeline integration are *future work*; this first milestone creates the
admin-controlled registry, not finished video effects.

## Operational follow-ups

- Add automated image decoding / frames validation, audio LUFS normalization
  and long-running transcoding on a worker.
- Add immutable asset versions and audit history to protect old exports.
- Add licensing review workflow and object lifecycle cleanup after updates.
- Optimize listing/indexes and build matching/resolution hooks for V2.1.
- Add visual samples to preview LUT effects and proper APNG animation tests.
