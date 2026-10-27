from fastapi import APIRouter

router = APIRouter(prefix="/api/editor", tags=["RangManch Editor"])


@router.get("/health")
def editor_health():
    return {
        "status": "ok",
        "service": "rangmanch-editor",
        "mode": "local",
    }
