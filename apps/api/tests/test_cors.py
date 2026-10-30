import os

from fastapi.testclient import TestClient

# Keep this middleware test independent of production Firebase credentials.
os.environ.setdefault('ENV', 'development')
os.environ.setdefault('LOCAL_EDITOR_MODE', 'true')

from app.main import app


PREVIEW_ORIGIN = (
    'https://vidyobharat-saas-p29ibldyd-harsh-veers-projects.vercel.app'
)


def test_preview_origin_get_includes_credentialed_cors_headers() -> None:
    response = TestClient(app).get('/api/editor/config', headers={'Origin': PREVIEW_ORIGIN})

    assert response.headers['access-control-allow-origin'] == PREVIEW_ORIGIN
    assert response.headers['access-control-allow-credentials'] == 'true'
    assert 'Origin' in response.headers['vary']


def test_preview_origin_options_preflight_includes_requested_headers() -> None:
    response = TestClient(app).options(
        '/api/editor/guest/session',
        headers={
            'Origin': PREVIEW_ORIGIN,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type,x-rangmanch-editor-csrf',
        },
    )

    assert response.status_code == 204
    assert response.headers['access-control-allow-origin'] == PREVIEW_ORIGIN
    assert response.headers['access-control-allow-credentials'] == 'true'
    assert 'content-type' in response.headers['access-control-allow-headers']


def test_unlisted_vercel_preview_is_rejected() -> None:
    response = TestClient(app).get(
        '/api/editor/config',
        headers={'Origin': 'https://another-preview.vercel.app'},
    )

    assert 'access-control-allow-origin' not in response.headers
