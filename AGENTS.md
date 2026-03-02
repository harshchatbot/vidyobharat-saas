# AGENTS.md - VidyoBharat Monorepo

## Commands

- API local:
  - `cd apps/api && uvicorn app.main:app --reload --port 8000`
- Worker local:
  - `cd apps/api && celery -A app.workers.worker.celery_app worker --loglevel=INFO`
- Web local:
  - `cd apps/web && npm install && npm run dev`
- Full backend stack:
  - `docker-compose up --build`

## Conventions

- Use repository/service layers for all DB access.
- Route handlers stay thin and only orchestrate request/response.
- Keep UI reusable in `apps/web/src/components/ui`.
- Theme tokens only in `apps/web/src/styles/theme.css`; no hardcoded colors in components.
- Use `apps/web/src/lib/api.ts` as the only HTTP client.
- Never log secrets.

## Validation Steps

1. `docker-compose up --build` and verify `/health`.
2. `cd apps/web && npm install && npm run dev`.
3. In UI: mock login, create project, generate render, verify status polling.
4. Confirm cache headers:
   - `/projects`: `Cache-Control: private, max-age=10`
   - `/renders/{id}`: `Cache-Control: no-store`
5. Confirm response includes `X-Request-ID`.
