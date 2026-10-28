## Firestore Rules Deploy

Run deploys from this directory, or pass this config file explicitly.

Example:

```bash
cd /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/infra/firebase
firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

Alternative from repo root:

```bash
firebase deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID --config /Users/harshveersinghnirwan/Downloads/vidyobharat-saas/infra/firebase/firebase.json
```

Use the same Firebase project id configured in:

- `FIREBASE_PROJECT_ID` for the backend
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` for the frontend

## Local Emulator Suite

Guest editor integration tests must run only against the fixed demo project. The
backend refuses emulator mode if a host is missing, a host is not loopback, the
project differs, or any production credential variable is populated.

Prerequisites:

- Firebase CLI
- Java 21 or newer
- Python dependencies from `apps/api/requirements.txt`

From the repository root, run the smoke test with:

```bash
cd infra/firebase
ENV=development \
LOCAL_EDITOR_MODE=false \
FIREBASE_PROJECT_ID=demo-rangmanch-editor \
GCLOUD_PROJECT=demo-rangmanch-editor \
FIREBASE_STORAGE_BUCKET=demo-rangmanch-editor.appspot.com \
GOOGLE_APPLICATION_CREDENTIALS= \
FIREBASE_SERVICE_ACCOUNT_JSON= \
FIREBASE_SERVICE_ACCOUNT_JSON_B64= \
FIREBASE_SERVICE_ACCOUNT_PATH= \
FIREBASE_PRIVATE_KEY_ID= \
FIREBASE_PRIVATE_KEY= \
FIREBASE_CLIENT_EMAIL= \
FIREBASE_CLIENT_ID= \
FIREBASE_CLIENT_X509_CERT_URL= \
RUN_FIREBASE_EMULATOR_TESTS=1 \
firebase emulators:exec \
  --project demo-rangmanch-editor \
  --only auth,firestore,storage \
  "cd ../../apps/api && pytest -q tests/test_firebase_emulators.py"
```

`firebase emulators:exec` supplies these host variables to the test process:

```text
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
```

Do not set those variables in production. Do not substitute a real Firebase
project id for `demo-rangmanch-editor`.

### Local guest export worker

The FastAPI development server and the Celery worker do not process guest export
documents. While the emulators are running, start the durable export worker in a
separate terminal with the same guarded demo-project environment:

```bash
cd apps/api
ENV=development \
LOCAL_EDITOR_MODE=false \
FIREBASE_PROJECT_ID=demo-rangmanch-editor \
GCLOUD_PROJECT=demo-rangmanch-editor \
FIREBASE_STORAGE_BUCKET=demo-rangmanch-editor.appspot.com \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GOOGLE_APPLICATION_CREDENTIALS= \
FIREBASE_SERVICE_ACCOUNT_JSON= \
FIREBASE_SERVICE_ACCOUNT_JSON_B64= \
FIREBASE_SERVICE_ACCOUNT_PATH= \
FIREBASE_PRIVATE_KEY_ID= \
FIREBASE_PRIVATE_KEY= \
FIREBASE_CLIENT_EMAIL= \
FIREBASE_CLIENT_ID= \
FIREBASE_CLIENT_X509_CERT_URL= \
./.venv/bin/python -m app.services.guest_export_worker
```

### Guest quota compatibility

Guest sessions remain valid for 24 hours and keep their existing Firestore
counter fields. No migration or destructive rewrite is required for existing
`editor_guest_sessions` documents. Those counters continue to enforce the
per-session limits and to track active `storage_bytes`.

New uploads and exports also create bounded entries in
`editor_guest_network_usage`. Document IDs are HMAC verifiers derived from the
client network; raw IP addresses are never stored. These entries enforce rolling
24-hour upload/export counts, uploaded bytes, and processing seconds across new
guest sessions. Existing sessions begin participating on their next upload or
export, while their current session counters are preserved unchanged.

Network limits are independently configurable in Firestore `app_config/guest`
with `network_max_uploads`, `network_max_exports`,
`network_max_uploaded_bytes`, and `network_max_processing_seconds`. Configure
`EDITOR_GUEST_TRUSTED_PROXY_CIDRS` only for known reverse proxies; forwarded IP
headers from other peers are ignored.
