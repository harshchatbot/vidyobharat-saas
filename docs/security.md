# Security Baseline (MVP)

## API Middleware

- Request ID middleware:
  - accepts `X-Request-ID` or generates UUID
  - sets response `X-Request-ID`
  - request ID is propagated to logs
- Security headers middleware:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: strict-origin-when-cross-origin`
- CORS allowlist from env (`ALLOWED_ORIGINS`)
- Rate-limit stub middleware for future Redis-backed limiters

## Input Validation

- Pydantic schemas with max lengths and safe defaults for all mutable endpoints.

## Logging

- Structured JSON logs only.
- Never log secrets.
- Include `request_id`; include `render_id` on render pipeline logs.

## Storage

- Storage abstracted through provider layer.
- Local storage is default for dev; provider can be swapped with Supabase Storage.
