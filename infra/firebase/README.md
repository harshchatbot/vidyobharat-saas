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
