"""Visual asset registry: draft seeds, validation, and publication rights gate."""
from io import BytesIO
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

import pytest

from app.services.visual_asset_library import (
    SEEDS, VisualAssetCreate, VisualAssetRepository, approve_asset,
    make_asset, seed_catalog, validate_media,
)


class FakeSnapshot:
    def __init__(self, id, content):
        self.id = id
        self._content = content
        self.exists = content is not None

    def to_dict(self):
        return self._content


class FakeDoc:
    def __init__(self, documents, id):
        self.documents = documents
        self.id = id

    def get(self):
        return FakeSnapshot(self.id, self.documents.get(self.id))

    def create(self, content):
        if self.id in self.documents:
            raise ValueError("Already exists")
        self.documents[self.id] = dict(content)

    def set(self, content):
        self.documents[self.id] = dict(content)


class FakeCollection:
    def __init__(self):
        self.documents = {}

    def document(self, id):
        return FakeDoc(self.documents, id)

    def where(self, key, comparator, value):
        assert (key, comparator) == ("status", "==")
        results = FakeCollection()
        results.documents = {
            id: d for id, d in self.documents.items() if d.get(key) == value
        }
        return results

    def stream(self):
        return [FakeSnapshot(k, v) for k, v in self.documents.items()]


class FakeDb:
    def __init__(self):
        self.collection_instance = FakeCollection()

    def collection(self, key):
        assert key == "editor_visual_assets"
        return self.collection_instance


def test_user_manifests_import_as_draft_only_and_are_idempotent():
    store = VisualAssetRepository(FakeDb())
    stats = seed_catalog(store)
    assert stats == {"created": 93, "already_present": 0, "total": 93}
    assert len(store.list()) == 93
    assert len(store.list(public=True)) == 0
    assert len(store.list(kind="lut")) == 6
    assert len(store.list(kind="emoji")) == 64
    assert len(store.list(kind="music")) == 23
    assert store.get("lut:portra400").details["params"]["input_colorspace"] == "ITU-R BT.709"
    assert store.get("emoji:robot").details["kind"] == "animated"
    assert store.get("music:cyberpunk-city").details["lufs_i"] == -10.8
    existing = store.get("emoji:robot").model_copy(update={"title": "Customized label"})
    store.save(existing)
    assert seed_catalog(store) == {"created": 0, "already_present": 93, "total": 93}
    assert store.get("emoji:robot").title == "Customized label"


def test_lut_checks_row_count():
    asset = make_asset(VisualAssetCreate(
        type="lut", slug="custom-film", title="Custom", source="Own generator"
    ))
    rows = "\n".join(f"{v} {v} {v}" for v in (0, 1) for _ in range(4))
    content = ("TITLE \"Test\"\nLUT_3D_SIZE 2\n" + rows + "\n").encode()
    assert validate_media(asset, "custom.cube", content) == ("text/plain", ".cube")
    with pytest.raises(ValueError, match="row count"):
        validate_media(asset, "custom.cube", b"LUT_3D_SIZE 2\n0 0 0\n")


def test_incorrect_emoji_upload_rejected():
    asset = make_asset(VisualAssetCreate(type="emoji", slug="smile", title="Smile"))
    with pytest.raises(ValueError, match="PNG"):
        validate_media(asset, "fake.png", b"not an image")


def test_mixkit_music_cannot_be_published_as_stock_library_asset():
    store = VisualAssetRepository(FakeDb())
    seed_catalog(store)
    item = store.get("music:cyberpunk-city")
    verified = item.model_copy(update={
        "redistribution_confirmed": True,
        "license": "Mixkit Free Music",
        "evidence_reference": "license-page",
        "storage_path": "visual-library/music/abc.mp3",
        "sha256": "abcd", "bytes": 4000,
    })
    with pytest.raises(ValueError, match="Mixkit catalog music"):
        approve_asset(store, verified)


def test_non_uploaded_asset_cannot_be_published():
    store = VisualAssetRepository(FakeDb())
    item = make_asset(VisualAssetCreate(
        type="emoji", slug="spark", title="Spark",
        license="MIT", source="Original repo",
        evidence_reference="https://example.org/license",
        redistribution_confirmed=True,
    ))
    with pytest.raises(ValueError, match="Upload the actual"):
        approve_asset(store, item)


def test_empty_speech_flags_do_not_affect_registry():
    assert SEEDS.joinpath("luts.seed.json").exists()
    assert SEEDS.joinpath("emojis.seed.json").exists()
    assert SEEDS.joinpath("music.seed.json").exists()
