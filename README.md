# VidyoBharat (MVP Monorepo)

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
