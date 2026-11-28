# Infra

Deployment target notes:
- Frontend -> Vercel
- API + workers (export, music, STT) -> AWS EC2 via `docker-compose.prod.yml`, configured from `apps/api/.env.production`
- Redis -> Managed Redis
