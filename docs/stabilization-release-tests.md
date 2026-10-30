# Stabilization release checks

These checks avoid paid providers and production Firebase data.

## Reliable release checks

Frontend, from `apps/web`:

```sh
npx tsc --noEmit
npm run lint:stabilization
npm run test:stabilization
npx playwright test tests/e2e/editor-copilot-stabilization.spec.ts --project=desktop-chrome
npm run build
```

The production build requires the documented public API and Firebase variables. Test builds may use non-secret, non-routable placeholder values.

Backend, from `apps/api` with the project requirements installed:

```sh
python -m pytest -q tests/test_admin_auth.py tests/test_admin_dashboard.py tests/test_editor_audio_library.py tests/test_editor_copilot.py
```

## Full backend collection blockers

The unfiltered repository-level `pytest` command currently collects two root-level avatar pipeline scripts that execute during import and require configured Firebase. It also collects `tests/test_cors.py`, which imports the application startup path and requires Firebase configuration, and `tests/test_ltx_video_service.py`, which imports a legacy module that is not present. These are pre-existing collection/environment issues and are excluded from the focused release command above; they should be repaired separately rather than bypassed with production credentials.

The repository-wide ESLint configuration exposes a substantial pre-existing legacy backlog. `lint:stabilization` is the noninteractive release gate for files changed by this PR; it does not suppress or rewrite unrelated legacy violations.
