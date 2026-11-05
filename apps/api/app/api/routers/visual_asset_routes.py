"""Strict admin-only visual asset library plus read-only public resolver."""
from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile

from app.api.deps import AdminPrincipal, require_admin_principal
from app.services.visual_asset_library import (
    VisualAsset, VisualAssetCreate, VisualAssetEdit, VisualAssetRepository,
    approve_asset, make_asset, now, seed_catalog, upload_asset_file,
)

router = APIRouter(tags=["RangManch Visual Asset Library"])


def repo() -> VisualAssetRepository:
    return VisualAssetRepository()


def get_asset(asset_id: str, store: VisualAssetRepository) -> VisualAsset:
    asset = store.get(asset_id)
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found.")
    return asset


@router.get("/api/editor/visual-assets")
def listed_assets(
    kind: str | None = Query(None, pattern="^(lut|emoji)$"),
    store: VisualAssetRepository = Depends(repo),
):
    """Only published + rights-cleared entries; no raw storage URLs."""
    return {"items": [
        {"id": a.id, "type": a.type, "slug": a.slug, "title": a.title,
         "description": a.description, "tags": a.tags, "details": a.details,
         "content_url": f"/api/editor/visual-assets/{a.id}/content",
         "sha256": a.sha256}
        for a in store.list(public=True, kind=kind)
    ]}


@router.get("/api/editor/visual-assets/{asset_id}/content")
def published_asset_content(asset_id: str, store: VisualAssetRepository = Depends(repo)):
    asset = get_asset(asset_id, store)
    if asset.status != "published" or not asset.redistribution_confirmed:
        raise HTTPException(status_code=404, detail="Asset unavailable.")
    return _content(asset)


def _content(asset: VisualAsset):
    from fastapi.responses import Response
    from app.providers.storage import FirebaseStorageProvider, build_storage_provider
    if not asset.storage_path or not asset.storage_path.startswith(f"visual-library/{asset.type}/"):
        raise HTTPException(status_code=404, detail="Asset unavailable.")
    storage = build_storage_provider()
    if not isinstance(storage, FirebaseStorageProvider):
        raise HTTPException(status_code=503, detail="Asset storage unavailable.")
    try:
        blob = storage.bucket.blob(asset.storage_path)
        blob.reload()
        if not blob.size or blob.size > 8 * 1024 * 1024 or blob.size != asset.bytes:
            raise HTTPException(status_code=404, detail="Asset unavailable.")
        content = blob.download_as_bytes()
        import hashlib
        if hashlib.sha256(content).hexdigest() != asset.sha256:
            raise HTTPException(status_code=404, detail="Asset checksum mismatch.")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Asset storage unavailable.") from exc
    return Response(
        content=content, media_type=asset.content_type or "application/octet-stream",
        headers={"Cache-Control": "private,max-age=300", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/api/admin/visual-assets")
def admin_list(
    kind: str | None = Query(None, pattern="^(lut|emoji)$"),
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    return {"items": [item.model_dump() for item in store.list(kind=kind)]}


@router.post("/api/admin/visual-assets/seed")
def admin_seed(
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    return seed_catalog(store)


@router.post("/api/admin/visual-assets", status_code=201)
def admin_create(
    payload: VisualAssetCreate,
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    try:
        return store.create(make_asset(payload))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.patch("/api/admin/visual-assets/{asset_id}")
def admin_edit(
    asset_id: str, payload: VisualAssetEdit,
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    asset = get_asset(asset_id, store)
    # Modifications to licensing, creative tags or attribution invalidate
    # prior approval until an admin re-verifies the published entry.
    updated = asset.model_copy(update={
        **payload.model_dump(), "status": "draft", "updated_at": now(),
    })
    return store.save(updated)


@router.post("/api/admin/visual-assets/{asset_id}/upload")
async def admin_upload(
    asset_id: str, file: UploadFile = File(...),
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    asset = get_asset(asset_id, store)
    content = await file.read(8 * 1024 * 1024 + 1)
    try:
        return upload_asset_file(store, asset, file.filename or "", content)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/api/admin/visual-assets/{asset_id}/preview")
def admin_preview(
    asset_id: str,
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    return _content(get_asset(asset_id, store))


@router.post("/api/admin/visual-assets/{asset_id}/publish")
def admin_publish(
    asset_id: str,
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    try:
        return approve_asset(store, get_asset(asset_id, store))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.post("/api/admin/visual-assets/{asset_id}/retire")
def admin_retire(
    asset_id: str,
    _: AdminPrincipal = Depends(require_admin_principal),
    store: VisualAssetRepository = Depends(repo),
):
    asset = get_asset(asset_id, store)
    return store.save(asset.model_copy(update={"status": "retired", "updated_at": now()}))
