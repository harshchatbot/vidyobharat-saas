# RangManch localhost Firebase Auth + Creative Mode verification

## Verified code changes
- Unified `/login` and `/admin/login` visual language with the existing
  RangManch cream/lavender/yellow Creative Mode palette. No duplicate
  standalone asset manager route remains.
- `/admin/assets` lives within existing protected `(shell)/admin` layout.
- Admin guard checks existing same-origin admin session and redirects missing
  or unauthorized sessions to `/admin/login?next=...`.
- Admin APIs use the Next.js admin-session cookie proxy, NOT a direct
  Firebase browser auth fetch on every request. Backend still validates admin
  permissions.
- An expired admin session returns to admin login. API outages return
  a retryable unavailable error instead of treating an outage as a bad login.
- Firebase Auth emulator connects **only** when explicitly opted in using
  `NEXT_PUBLIC_USE_FIREBASE_AUTH_EMULATOR=true`. Merely having
  `NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL` present is no longer enough.
- The SDK checks default Firebase app consistency, and initializes with
  a 12-second bounded wait and retry after transient failure.

## Investigate `auth/network-request-failed`

This Firebase SDK error is not proof that the Firebase API key is wrong.
Possible causes: local emulator URL accidentally enabled, rejected/blocked
Google Identity Toolkit requests, restrictive API key HTTP referrers,
network/DNS/ad blockers, wrong project/Auth domain, or stale Next.js
environment compilation. Only browser Network evidence can identify the
specific cause on the user's Mac.

Run the safe diagnostic:
```bash
cd ~/Downloads/vidyobharat-saas/apps/web
node scripts/diagnose-local-auth.mjs
```

In Firebase Console verify:
1. Authentication -> Settings -> Authorized domains contains `localhost`
   for local login. Add it manually if missing.
2. Email/Password and/or Google provider enabled.
3. All `NEXT_PUBLIC_FIREBASE_*` fields are from the SAME Firebase web app.
4. API key restrictions allow the Identity Toolkit and token endpoints,
   with localhost browser referrers as needed. Never place a service account
   secret in `NEXT_PUBLIC_*`.
5. The auth emulator flag is off unless intentionally running it.

Open browser DevTools -> Network, attempt login and inspect only the
**status, hostname and error code** for identitytoolkit.googleapis.com or
the emulator URL. Do NOT share tokens, password, private keys, request
bodies, API-key query strings or full Authorization headers.

## Clear stale Next.js UI

Stop the existing Next.js dev server(s) first. Check port occupancy:
```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

Once the correct process is stopped, from `apps/web`:
```bash
rm -rf .next
npm run dev
```

Changing `.env.local` requires a server restart. Hard refresh the browser.
Use exactly `http://localhost:3000/login` and
`http://localhost:3000/admin/assets` (do not mix localhost and 127.0.0.1).
An expired admin session redirects to `/login?next=%2Fadmin%2Fassets`,
then returns to asset management after verified login.

## Tests and caveats

```bash
cd apps/web
node --experimental-strip-types --test src/app/api/admin/backend/routeSecurity.test.ts
npx tsc --noEmit
```

These checks and live Firebase sign-in have not been executed on the user's
local environment by the assistant. Authentication cannot be confirmed
until the locally configured Firebase project and browser network are tested.
