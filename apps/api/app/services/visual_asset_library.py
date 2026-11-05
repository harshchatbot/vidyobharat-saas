"""Admin-managed LUT / emoji / music registry. Metadata seeds are NOT usable assets.

Firestore stores mutable records, Firebase Storage stores validated bytes.
Only explicitly approved, verified and present objects become public.
"""
from __future__ import annotations

import hashlib
import json
import re
import struct
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.providers.firebase import get_firestore_client
from app.providers.storage import FirebaseStorageProvider, build_storage_provider

SEEDS = Path(__file__).resolve().parents[1] / "assets"
SLUG = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")
MAX_FILE_SIZE = 20 * 1024 * 1024


class VisualAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^(lut|emoji|music):[a-z0-9][a-z0-9-]{0,79}$")
    type: Literal["lut", "emoji", "music"]
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,79}$")
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=600)
    tags: list[str] = Field(default_factory=list, max_length=30)
    details: dict = Field(default_factory=dict)
    source: str = Field(default="", max_length=500)
    license: str = Field(default="unverified", max_length=120)
    evidence_reference: str = Field(default="", max_length=600)
    attribution: str = Field(default="", max_length=600)
    redistribution_confirmed: bool = False
    status: Literal["draft", "published", "retired"] = "draft"
    storage_path: str | None = None
    content_type: str | None = None
    sha256: str | None = None
    bytes: int | None = None
    created_at: str = ""
    updated_at: str = ""


class VisualAssetEdit(BaseModel):
    title: str = Field(min_length=1, max_length=180)
    description: str = Field(default="", max_length=600)
    tags: list[str] = Field(default_factory=list, max_length=30)
    source: str = Field(default="", max_length=500)
    license: str = Field(default="unverified", max_length=120)
    evidence_reference: str = Field(default="", max_length=600)
    attribution: str = Field(default="", max_length=600)
    redistribution_confirmed: bool = False
    details: dict = Field(default_factory=dict)


class VisualAssetCreate(VisualAssetEdit):
    type: Literal["lut", "emoji"]
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,79}$")


class VisualAssetRepository:
    def __init__(self, db=None):
        self.collection = (db or get_firestore_client()).collection("editor_visual_assets")

    def get(self, asset_id: str) -> VisualAsset | None:
        doc = self.collection.document(asset_id).get()
        if not doc.exists:
            return None
        return VisualAsset.model_validate(doc.to_dict() | {"id": doc.id})

    def list(self, *, public: bool = False, kind: str | None = None) -> list[VisualAsset]:
        query = self.collection
        if public:
            query = query.where("status", "==", "published")
        results = []
        for doc in query.stream():
            asset = VisualAsset.model_validate(doc.to_dict() | {"id": doc.id})
            if (kind is None or asset.type == kind) and (
                not public or (asset.redistribution_confirmed and asset.storage_path and asset.sha256)
            ):
                results.append(asset)
        return sorted(results, key=lambda a: (a.type, a.slug))

    def create(self, asset: VisualAsset) -> VisualAsset:
        doc = self.collection.document(asset.id)
        if doc.get().exists:
            raise ValueError("Asset already exists; edit the existing entry.")
        doc.create(asset.model_dump(exclude={"id"}))
        return asset

    def save(self, asset: VisualAsset) -> VisualAsset:
        self.collection.document(asset.id).set(asset.model_dump(exclude={"id"}))
        return asset


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_asset(payload: VisualAssetCreate) -> VisualAsset:
    timestamp = now()
    return VisualAsset(
        id=f"{payload.type}:{payload.slug}", type=payload.type, slug=payload.slug,
        **payload.model_dump(exclude={"type", "slug"}),
        status="draft", created_at=timestamp, updated_at=timestamp,
    )


def seed_catalog(repo: VisualAssetRepository) -> dict:
    """Idempotent: import as draft only; never overwrite admin modifications."""
    lut_data = json.loads((SEEDS / "luts.seed.json").read_text())
    emoji_data = json.loads((SEEDS / "emojis.seed.json").read_text())
    assets = []
    for slug, info in lut_data.items():
        assets.append(make_asset(VisualAssetCreate(
            type="lut", slug=slug, title=info["title"], description=info["what"],
            tags=["film", "color", "cinematic", slug],
            source="spectral_film_lut 0.18.12 (source and files require verification)",
            details=info,
        )))
    music_data = json.loads((SEEDS / "music.seed.json").read_text())
    for slug, info in music_data.items():
        assets.append(make_asset(VisualAssetCreate(
            type="music", slug=slug, title=slug.replace("-", " ").title(),
            description=", ".join(info["mood"]), tags=info["mood"] + info.get("styles", []),
            source=info["source"], license=info["licence"], details=info,
        )))
    for info in emoji_data["emoji"]:
        assets.append(make_asset(VisualAssetCreate(
            type="emoji", slug=info["slug"], title=info["folder"],
            description=info["use"], tags=[info["slug"], info["kind"], "reaction"],
            source=("microsoft/fluentui-emoji-animated" if info["kind"] == "animated"
                    else "microsoft/fluentui-emoji"),
            details=info,
        )))
    created = 0
    for asset in assets:
        if repo.get(asset.id) is None:
            repo.create(asset)
            created += 1
    return {"created": created, "already_present": len(assets) - created, "total": len(assets)}


def validate_media(asset: VisualAsset, filename: str, data: bytes) -> tuple[str, str]:
    """Inspect bytes, not untrusted browser MIME. Do not allow arbitrary uploads."""
    if not data or len(data) > MAX_FILE_SIZE:
        raise ValueError("File must be non-empty and at most 20 MB.")
    extension = Path(filename).suffix.lower()
    if asset.type == "music":
        if extension != ".mp3":
            raise ValueError("Music must be an MP3 file.")
        # Decode with ffprobe, rather than trusting filename or browser-supplied MIME.
        import subprocess
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".mp3") as handle:
            handle.write(data)
            handle.flush()
            try:
                result = subprocess.run(
                    ["ffprobe", "-v", "error", "-show_entries",
                     "format=duration:stream=codec_name,codec_type",
                     "-of", "json", handle.name],
                    check=True, capture_output=True, text=True, timeout=12,
                )
                metadata = json.loads(result.stdout)
                seconds = float(metadata.get("format", {}).get("duration", 0))
                streams = metadata.get("streams", [])
                if not (0 < seconds <= 600 and any(
                    v.get("codec_type") == "audio" and v.get("codec_name") == "mp3"
                    for v in streams
                )):
                    raise ValueError("Expected MP3 audio, duration at most 10 minutes.")
            except (OSError, subprocess.SubprocessError, TypeError, KeyError) as exc:
                raise ValueError("Audio could not be decoded or ffprobe is unavailable.") from exc
        return "audio/mpeg", ".mp3"
    if asset.type == "lut":
        if extension != ".cube":
            raise ValueError("LUT must be a .cube file.")
        try:
            content = data.decode("utf-8-sig")
        except UnicodeError as exc:
            raise ValueError("LUT must contain UTF-8 text.") from exc
        if "\x00" in content:
            raise ValueError("Invalid LUT binary data.")
        size = None
        rows = 0
        for line in content.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            if parts[0] == "LUT_3D_SIZE" and len(parts) == 2:
                try:
                    size = int(parts[1])
                except ValueError as exc:
                    raise ValueError("Invalid LUT size.") from exc
                if not 2 <= size <= 65:
                    raise ValueError("LUT size must be 2–65.")
            elif parts[0] in {"TITLE", "DOMAIN_MIN", "DOMAIN_MAX"}:
                continue
            elif len(parts) == 3:
                try:
                    values = [float(p) for p in parts]
                except ValueError as exc:
                    raise ValueError("Invalid LUT data row.") from exc
                import math
                if not all(math.isfinite(v) and -2 <= v <= 4 for v in values):
                    raise ValueError("LUT contains invalid colour values.")
                rows += 1
            else:
                raise ValueError("Unrecognized LUT content.")
        if size is None or rows != size ** 3:
            raise ValueError("LUT row count does not match LUT_3D_SIZE.")
        return "text/plain", ".cube"
    if extension not in {".png", ".apng"} or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("Emoji must be a valid PNG or APNG.")
    if len(data) < 33 or data[12:16] != b"IHDR":
        raise ValueError("Invalid PNG header.")
    width, height = struct.unpack(">II", data[16:24])
    if not (1 <= width <= 2048 and 1 <= height <= 2048):
        raise ValueError("Emoji dimensions must be 1–2048px.")
    # PNG APNG chunks are checked in playback later; retain native bytes.
    return "image/png", ".png"


def upload_asset_file(repo: VisualAssetRepository, asset: VisualAsset, filename: str, data: bytes) -> VisualAsset:
    content_type, extension = validate_media(asset, filename, data)
    storage = build_storage_provider()
    if not isinstance(storage, FirebaseStorageProvider):
        raise RuntimeError("Firebase Storage is required for shared visual asset files.")
    signed = storage.upload_bytes(
        f"{asset.slug}{extension}", data,
        content_type=content_type, kind=f"visual-library/{asset.type}",
    )
    updated = asset.model_copy(update={
        "storage_path": signed.storage_path, "content_type": content_type,
        "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data),
        "status": "draft", "redistribution_confirmed": False,
        "updated_at": now(),
    })
    repo.save(updated)
    return updated


def approve_asset(repo: VisualAssetRepository, asset: VisualAsset) -> VisualAsset:
    if asset.type == "music" and "mixkit" in (asset.source + " " + asset.license).lower():
        # Stock music embedded in a third-party asset catalog is distinct from
        # incorporating a track into a completed social video. Their terms
        # prohibit stock/inventory distribution; do not override via checkbox.
        raise ValueError("Mixkit catalog music cannot be published in this SaaS library without separate, documented distribution permission and a licensed replacement source.")
    if not asset.redistribution_confirmed or not asset.evidence_reference.strip():
        raise ValueError("Verify redistribution permission and record license evidence first.")
    if asset.license.lower().strip() in {"", "unverified", "unknown", "proprietary"}:
        raise ValueError("A verified, commercially usable license is required.")
    if not asset.storage_path or not asset.sha256 or not asset.bytes:
        raise ValueError("Upload the actual LUT or emoji file first.")
    if not asset.storage_path.startswith(f"visual-library/{asset.type}/"):
        raise ValueError("Asset has an invalid storage path.")
    storage = build_storage_provider()
    if not isinstance(storage, FirebaseStorageProvider):
        raise RuntimeError("Firebase Storage is required.")
    metadata = storage.inspect_object(asset.storage_path)
    if metadata is None or metadata.size != asset.bytes or metadata.content_type != asset.content_type:
        raise ValueError("Storage object is missing or differs from registered asset.")
    updated = asset.model_copy(update={"status": "published", "updated_at": now()})
    return repo.save(updated)
