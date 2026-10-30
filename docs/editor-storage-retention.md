# RangManch AI editor storage and retention policy

## Phase 1 policy

The creator editor is browser-local by default. Timeline drafts, previews, and browser MP4 exports stay on the device unless the user explicitly uses an existing server export flow. Phase 1 does not add permanent cloud projects, automatic media backup, or a cloud “My Projects” library.

Guest uploads and server-rendered exports continue to use the existing signed guest session, Firestore metadata, Firebase Storage objects, quotas, and expiry fields. They are temporary working data, not creator project storage.

## Cleanup rules

- New uploads and export jobs must retain their existing `expires_at` values and guest ownership checks.
- Cleanup may remove only records and storage objects whose expiry has passed and whose reservation/job is no longer active.
- Cleanup must be idempotent and report missing objects as already-cleaned, not as a user-visible data loss.
- No migration or cleanup task may delete existing assets merely because this policy is introduced.
- Before production launch, operators should run a dry-run inventory of expired media/jobs, then enable deletion with bounded batches and audit logs.

## User-facing messaging

The editor should describe guest uploads and server exports as temporary session data. Sign-in unlocks authenticated AI requests and configured quota accounting; it does not imply permanent cloud project storage in this phase.
