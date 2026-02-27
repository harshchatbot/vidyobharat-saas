import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.request_context import get_request_id
from app.db.base import Base
from app.db.session import engine
from app.middleware.rate_limit import RateLimitStubMiddleware
from app.middleware.request_id import RequestIDMiddleware
from app.middleware.security import SecurityHeadersMiddleware

settings = get_settings()
configure_logging(settings.log_level)
logger = logging.getLogger(__name__)

app = FastAPI(title=settings.app_name)

app.add_middleware(RequestIDMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitStubMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)

Base.metadata.create_all(bind=engine)

Path('data/uploads').mkdir(parents=True, exist_ok=True)
Path('data/renders').mkdir(parents=True, exist_ok=True)
app.mount('/static', StaticFiles(directory='data'), name='static')
app.include_router(router)


@app.middleware('http')
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    logger.info(
        'request_completed',
        extra={
            'request_id': get_request_id(),
            'method': request.method,
            'path': request.url.path,
            'status_code': response.status_code,
        },
    )
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(_: Request, exc: Exception):
    logger.exception('unhandled_error', extra={'request_id': get_request_id()})
    return JSONResponse(status_code=500, content={'detail': 'Internal server error'})
