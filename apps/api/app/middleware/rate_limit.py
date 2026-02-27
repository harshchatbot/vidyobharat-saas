from starlette.middleware.base import BaseHTTPMiddleware


class RateLimitStubMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        # Placeholder for Redis-backed token bucket limiting.
        return await call_next(request)
