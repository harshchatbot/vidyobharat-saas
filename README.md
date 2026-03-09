# RangManch AI (MVP Monorepo)

India-first Hybrid Text-to-Video SaaS MVP with a Next.js frontend and FastAPI + Celery backend.

## Monorepo Structure

- `apps/web` - Next.js App Router frontend
- `apps/api` - FastAPI API + Celery worker + render pipeline
- `docs` - Architecture conventions and security/theming notes
- `infra` - Deployment placeholders
- `assets` - Brand/design assets placeholder

## Prerequisites

- Node.js 20+
- Python 3.11+
- Docker + Docker Compose

## Environment Setup

1. Copy root and app env files as needed:
- `cp .env.example .env`
- `cp apps/web/.env.example apps/web/.env.local`
- `cp apps/api/.env.example apps/api/.env`

2. Ensure frontend points to API:
- `NEXT_PUBLIC_API_URL=http://localhost:8000`

## Run API + Worker + Redis

```bash
docker-compose up --build
```

Services:
- API: `http://localhost:8000`
- Redis: `localhost:6379`

## Run Frontend

```bash
cd apps/web
npm install
npm run dev
```

Frontend:
- Web app: `http://localhost:3000`

## API Endpoints (MVP)

- `GET /health`
- `POST /auth/mock-signup`
- `POST /auth/mock-login`
- `POST /projects`
- `PATCH /projects/{id}`
- `GET /projects`
- `GET /projects/{id}`
- `POST /renders`
- `GET /renders/{render_id}`
- `POST /uploads/sign`
- `DELETE /uploads/{asset_id}`

## Demo Flow

1. Sign up from `/signup` (first time)
2. Login from `/login`
3. Open `/projects` and create a project
4. Open editor and click `Generate`
5. Watch render progress auto-update
6. Open final video URL when status becomes `completed`

## Notes

- Local persistence uses SQLite (`apps/api/data/vidyobharat.db`)
- Upload/storage is provider-based and ready to swap to Supabase Storage
- Render pipeline is mock-structured with ffmpeg fallback
- Structured JSON logs include request IDs and render IDs when applicable

## Admin Access For Template Management

There is no separate admin login screen.

Admin mode currently works by:
1. logging in normally with the existing app auth flow
2. allowing that user at the backend through environment configuration

Backend admin access is checked using:
- `ADMIN_USER_EMAILS`
- `ADMIN_USER_IDS`

These values are read in:
- `apps/api/app/core/config.py`
- `apps/api/app/api/deps.py`

### Recommended setup

Use email allowlisting first.

Example:

```env
ADMIN_USER_EMAILS=harshveernirwan@gmail.com
```

Multiple admins:

```env
ADMIN_USER_EMAILS=harshveernirwan@gmail.com,teammember@example.com
```

If needed, you can also allowlist Firebase user IDs:

```env
ADMIN_USER_IDS=uid_1,uid_2
```

After changing these values, redeploy the API service.

### How to log in as admin

1. Add your email or Firebase UID to the backend admin allowlist
2. Redeploy the API
3. Log in normally from the app
4. Open:

```text
/admin/templates
```

Example production URL:

- `/admin/templates`

### What admin mode can do today

From `/admin/templates`, an allowed admin user can:
- create new templates
- edit template title, slug, type, category, prompt template, hints, and defaults
- upload preview images
- activate/deactivate templates
- mark templates as trending
- mark templates as featured
- archive old templates

This is the current path for:
- adding new trending templates
- updating prompt structures
- changing template visuals

### Important behavior

- Admin access is backend-guarded, not purely hidden by frontend UI
- If `ADMIN_USER_EMAILS` / `ADMIN_USER_IDS` are not configured, admin protection is only placeholder-level and should be tightened before wider team usage
- Existing video/image create flows continue to work even if the new template admin flow is unused
