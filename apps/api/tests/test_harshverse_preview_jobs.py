"""Unit tests for authenticated preview queue submission.

These tests use fake repository/quota services; run the Firestore emulator
integration suite separately before enabling the public preview endpoint.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib

import pytest

from app.services.harshverse.composition_adapter import AnimationPlate, HarshVerseDraft
from app.services.harshverse.guest_preview_job_service import GuestHarshVerseJobService
from app.services.harshverse.scene_plan import Scene, ScenePlan


GUEST = "guest-preview-test"
SOURCE = "a" * 32
ANIMATION = "b" * 32


def media_record(media_id: str, data: bytes, *, guest_id=GUEST):
    return {
        "guest_id": guest_id, "media_id": media_id,
        "status": "active", "media_type": "video",
        "duration_seconds": 6, "file_size": len(data),
        "content_sha256": hashlib.sha256(data).hexdigest(),
        "storage_object_path": f"guest-editor/{guest_id}/sources/{media_id}/original",
    }


class FakeSessions:
    def __init__(self):
        self.events = []
        self.limits = type("Quota", (), {"processing_seconds": 120, "concurrent_processing": 1})()

    def validate_mutating_request(self, request):
        if request != "valid-request":
            raise PermissionError("CSRF")

    def get_session(self, token):
        if token != "valid-token":
            raise PermissionError("token")
        return {"guest_id": GUEST}

    def reserve_network_quota(self, **kwargs):
        self.events.append(("reserve", kwargs["reservation_id"]))
        return "network-hash"

    def finish_network_quota(self, **kwargs):
        self.events.append(("finish", kwargs["commit"]))


class FakeMedia:
    max_file_bytes = 10000

    def __init__(self):
        self.sessions = FakeSessions()
        self.records = {
            SOURCE: media_record(SOURCE, b"presenter"),
            ANIMATION: media_record(ANIMATION, b"animation"),
        }

    def get_media(self, token, media_id):
        self.sessions.get_session(token)
        record = self.records.get(media_id)
        if record is None or record["guest_id"] != GUEST:
            raise PermissionError("owner")
        return record


class FakeRepository:
    def __init__(self):
        self.jobs = {}
        self.creates = 0
        self.fail = False

    def get(self, guest_id, job_id):
        return self.jobs.get((guest_id, job_id))

    def create_or_get(self, **kwargs):
        if self.fail:
            raise RuntimeError("transaction failed")
        k = (kwargs["guest_id"], kwargs["job_id"])
        if k in self.jobs:
            return self.jobs[k], False
        self.creates += 1
        job = {
            "job_id": kwargs["job_id"],
            "guest_id": kwargs["guest_id"],
            "digest": kwargs["digest"],
            "status": "queued",
            "payload": kwargs["payload"],
            "network_subject": kwargs["network_subject"],
        }
        self.jobs[k] = job
        return job, True


@dataclass
class FakeSettings:
    editor_export_celery_enabled: bool = False
    editor_export_celery_queue: str = "editor-exports"


def build():
    media = FakeMedia()
    repository = FakeRepository()
    service = GuestHarshVerseJobService(
        media=media, repository=repository, settings=FakeSettings(),
    )
    plan = ScenePlan(duration=6, scenes=(
        Scene("presenter_hook", 0, 2),
        Scene("presenter_split", 2, 4),
        Scene("presenter_outro", 4, 6),
    ))
    draft = HarshVerseDraft(plan, ANIMATION, ("type-001",))
    plate = AnimationPlate(ANIMATION, 6, media.records[ANIMATION]["content_sha256"])
    return service, media, repository, draft, plate


def submit(service, draft, plate, **changes):
    kwargs = dict(
        presenter_media_id=SOURCE, draft=draft,
        plate=plate, idempotency_key="preview-key-123",
    )
    kwargs.update(changes)
    return service.submit("valid-request", "valid-token", **kwargs)


def test_creates_durable_job_and_network_processing_reservation():
    service, media, repository, draft, plate = build()
    job, created = submit(service, draft, plate)
    assert created and repository.creates == 1
    assert media.sessions.events == [("reserve", f"hv-{job['job_id']}")]
    assert job["payload"]["media_hashes"][SOURCE] == media.records[SOURCE]["content_sha256"]
    assert job["payload"]["media_hashes"][ANIMATION] == media.records[ANIMATION]["content_sha256"]
    assert job["payload"]["scene_plan"]["duration"] == 6


def test_repeated_idempotent_submission_creates_no_extra_reservation():
    service, media, repository, draft, plate = build()
    a, _ = submit(service, draft, plate)
    b, created = submit(service, draft, plate)
    assert not created and a == b
    assert repository.creates == 1
    assert media.sessions.events == [("reserve", f"hv-{a['job_id']}")]


def test_same_key_different_scene_is_rejected():
    service, media, repository, draft, plate = build()
    submit(service, draft, plate)
    altered = HarshVerseDraft(ScenePlan(6, (
        Scene("presenter_hook", 0, 1),
        Scene("presenter_split", 1, 4),
        Scene("presenter_outro", 4, 6),
    )), ANIMATION, ())
    with pytest.raises(Exception, match="another preview"):
        submit(service, altered, plate)
    assert repository.creates == 1


def test_cross_guest_source_rejected_before_network_reservation():
    service, media, repository, draft, plate = build()
    media.records[SOURCE]["guest_id"] = "another-guest"
    with pytest.raises(PermissionError):
        submit(service, draft, plate)
    assert not media.sessions.events


def test_modified_plate_rejected_before_reservation():
    service, media, repository, draft, plate = build()
    bad = AnimationPlate(ANIMATION, 6, "c" * 64)
    with pytest.raises(ValueError, match="plate"):
        submit(service, draft, bad)
    assert not media.sessions.events


def test_quota_transaction_failure_releases_network_reservation():
    service, media, repository, draft, plate = build()
    repository.fail = True
    with pytest.raises(RuntimeError, match="transaction failed"):
        submit(service, draft, plate)
    assert media.sessions.events[-1] == ("finish", False)


def test_non_reviewable_job_not_accepted():
    service, media, repository, draft, plate = build()
    altered = HarshVerseDraft(draft.scene_plan, ANIMATION, (), False, True)
    with pytest.raises(ValueError, match="require review"):
        submit(service, altered, plate)
    assert not media.sessions.events


def test_invalid_csrf_rejected_before_queue():
    service, media, repository, draft, plate = build()
    with pytest.raises(PermissionError, match="CSRF"):
        service.submit("bad-request", "valid-token",
                       presenter_media_id=SOURCE, draft=draft, plate=plate,
                       idempotency_key="preview-key-123")
    assert repository.creates == 0


def test_private_status_lookup():
    service, media, repository, draft, plate = build()
    job, _ = submit(service, draft, plate)
    assert service.get_job("valid-token", job["job_id"]) == job
    with pytest.raises(PermissionError, match="token"):
        service.get_job("wrong-token", job["job_id"])
