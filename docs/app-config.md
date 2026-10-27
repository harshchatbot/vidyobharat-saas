# Runtime AppConfig

RangManch reads non-secret runtime settings from the server-only Firestore
collection `app_config`. The Admin SDK reads these documents; Firestore rules
deny direct browser access. Each API/worker process caches the validated
snapshot for `APP_CONFIG_CACHE_TTL_SECONDS` (default: 45 seconds, allowed:
30-60 seconds).

Missing documents use validated deployment defaults. If Firestore is
temporarily unavailable, the process keeps its last valid snapshot, or uses
deployment defaults when no snapshot has been loaded. Invalid category
documents are ignored as a unit and logged without their values.

## Documents

Create only the fields that need an override in Firebase Console:

```text
app_config/guest
  max_uploads: 20                 # 1..100
  max_exports: 3                  # 1..20
  max_uploaded_bytes: 262144000   # 1 MiB..10 GiB
  max_storage_bytes: 524288000    # 1 MiB..20 GiB
  max_processing_seconds: 600     # 1..7200
  max_concurrent_processing: 1    # 1..4

app_config/media
  max_file_bytes: 104857600       # 1 MiB..2 GiB
  max_video_duration_seconds: 600 # 1..600
  max_image_pixels: 40000000      # 1M..100M

app_config/editor
  max_clips: 12                   # 1..50
  max_duration_seconds: 60        # 1..120

app_config/export
  list_limit: 50                  # 1..100

app_config/features
  guest_editor_enabled: true
```

Quota changes do not rewrite guest session documents. Existing `used` and
`reserved` counters remain authoritative. Each Firestore transaction compares
those counters against the effective cached limit, so lowering a limit blocks
new reservations without deleting prior usage.

## Public API

`GET /api/editor/config` returns only allowlisted UI settings: upload/export
counts, per-file size and duration, editor clip/duration limits, and public
feature availability. Storage quotas, processing capacity, leases, rate limits,
credentials, and secrets are never returned.

## Adding a key

1. Add a strictly typed, bounded field to the appropriate model in
   `app/services/app_config_service.py`.
2. Add its deployment fallback to `defaults_from_settings` when an environment
   fallback is required.
3. Read it at the operation boundary that enforces the behavior. Limits must be
   passed into the existing Firestore transaction rather than checked only in
   the browser.
4. Add it to `PublicAppConfig` only when a browser genuinely needs it and it is
   safe to disclose.
5. Add unit validation/cache tests and an emulator-backed integration test.

Do not place credentials, cookie policy, CSRF values, trusted origins,
rate-limit secrets, Firebase project identity, object paths, or other security
deployment controls in AppConfig.
