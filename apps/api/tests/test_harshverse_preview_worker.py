"""HarshVerse tokenless worker tests with fake storage, repository and FFmpeg."""
from __future__ import annotations

import hashlib

from app.services.harshverse import guest_preview_worker as module
from app.services.harshverse.guest_preview_worker import GuestHarshVerseWorker


GUEST = "guest-worker-test"
JOB_ID = "c" * 32
SOURCE = "a" * 32
ANIMATION = "b" * 32


def record(media_id, data):
    return {
        "guest_id": GUEST, "media_id": media_id,
        "status": "active", "media_type": "video",
        "duration_seconds": 6.0, "file_size": len(data),
        "content_sha256": hashlib.sha256(data).hexdigest(),
        "storage_object_path": f"guest-editor/{GUEST}/sources/{media_id}/original",
    }


class Sessions:
    def __init__(self):
        self.limits = type("Limits", (), {"concurrent_processing": 1, "storage_bytes": 100000})()
        self.network = []

    def finish_network_quota(self, **kwargs):
        self.network.append((kwargs["reservation_id"], kwargs["commit"]))


class MediaRepo:
    def __init__(self, rows):
        self.rows = rows

    def get_for_guest(self, guest_id, media_id):
        record = self.rows.get(media_id)
        return record if record and record["guest_id"] == guest_id else None


class Storage:
    def __init__(self, rows):
        self.objects = {
            rows[SOURCE]["storage_object_path"]: b"presenter",
            rows[ANIMATION]["storage_object_path"]: b"animation",
        }
        self.deleted = []
        self.uploaded = []
        self.fail_upload = False

    def download_to_path(self, key, dest, *, expected_size):
        payload = self.objects[key]
        assert len(payload) == expected_size
        dest.write_bytes(payload)

    def delete(self, key):
        self.deleted.append(key)
        self.objects.pop(key, None)

    def delete_generation(self, key, generation):
        self.delete(key)

    def upload_file_if_absent(self, key, path, *, content_type, timeout_seconds):
        if self.fail_upload:
            raise RuntimeError("storage unavailable")
        if key in self.objects:
            raise RuntimeError("object exists")
        assert content_type == "video/mp4"
        self.objects[key] = path.read_bytes()
        self.uploaded.append(key)
        return "generation-1"


class JobRepo:
    def __init__(self, attempt=1):
        self.attempt = attempt
        self.completed = None
        self.failed = None
        self.reserved = None
        self.renewed = []

    def claim(self, **kwargs):
        return {
            "guest_id": GUEST, "job_id": JOB_ID,
            "attempt_count": self.attempt,
            "reservation_id": f"hv-{JOB_ID}",
            "network_subject": "network-subject",
            "payload": {
                "version": 1,
                "presenter_media_id": SOURCE,
                "animation_media_id": ANIMATION,
                "media_hashes": {
                    SOURCE: hashlib.sha256(b"presenter").hexdigest(),
                    ANIMATION: hashlib.sha256(b"animation").hexdigest(),
                },
                "deferred_beat_ids": ["type-1"],
                "scene_plan": {
                    "duration": 6, "fps": 30, "width": 720, "height": 1280,
                    "scenes": [
                        {"recipe": "presenter_hook", "start": 0, "end": 2},
                        {"recipe": "presenter_split", "start": 2, "end": 4, "asset_offset": 0},
                        {"recipe": "presenter_outro", "start": 4, "end": 6},
                    ],
                },
            },
        }

    def renew(self, **kwargs):
        self.renewed.append(kwargs["stage"])

    def reserve_storage(self, **kwargs):
        self.reserved = kwargs["bytes_needed"]

    def complete(self, **kwargs):
        assert kwargs["now"].tzinfo is not None
        self.completed = kwargs
        return {"network_subject": "network-subject", "reservation_id": f"hv-{JOB_ID}"}

    def fail(self, **kwargs):
        self.failed = kwargs
        return "queued" if kwargs["transient"] else "failed"


class Media:
    max_file_bytes = 100000

    def __init__(self):
        self.sessions = Sessions()
        self.rows = {SOURCE: record(SOURCE, b"presenter"), ANIMATION: record(ANIMATION, b"animation")}
        self.repository = MediaRepo(self.rows)
        self.storage = Storage(self.rows)


class Settings:
    editor_export_worker_lease_seconds = 120
    editor_export_worker_max_attempts = 3
    editor_export_worker_retry_max_seconds = 300
    editor_export_worker_retry_base_seconds = 5
    editor_guest_upload_timeout_seconds = 30


def mock_probe(path):
    return {
        "format": {"duration": "6.0"},
        "streams": [{"codec_type": "video"}, {"codec_type": "audio"}],
    }


def render_ok(plan, presenter, animation, output):
    assert presenter.read_bytes() == b"presenter"
    assert animation.read_bytes() == b"animation"
    output.write_bytes(b"valid-preview")


def make(monkeypatch, *, attempt=1, renderer=render_ok):
    monkeypatch.setattr(module, "_probe", mock_probe)
    media = Media()
    jobs = JobRepo(attempt=attempt)
    worker = GuestHarshVerseWorker(
        media=media, repository=jobs, settings=Settings(), renderer=renderer,
    )
    return worker, media, jobs


def test_worker_claims_renders_reserves_and_completes(monkeypatch):
    worker, media, jobs = make(monkeypatch)
    assert worker.run_job(GUEST, JOB_ID) is True
    assert jobs.completed is not None and jobs.failed is None
    assert jobs.reserved == len(b"valid-preview")
    assert media.sessions.network == [(f"hv-{JOB_ID}", True)]
    assert "uploading" in jobs.renewed


def test_fenced_retry_removes_orphaned_object_first(monkeypatch):
    worker, media, jobs = make(monkeypatch, attempt=2)
    output = f"guest-editor/{GUEST}/harshverse-previews/{JOB_ID}/preview.mp4"
    media.storage.objects[output] = b"orphan"
    assert worker.run_job(GUEST, JOB_ID)
    assert output in media.storage.deleted
    assert jobs.completed is not None
    assert media.storage.objects[output] == b"valid-preview"


def test_render_failure_requeues_and_does_not_upload(monkeypatch):
    def broken(*args):
        raise RuntimeError("FFmpeg temporarily unavailable")
    worker, media, jobs = make(monkeypatch, renderer=broken)
    assert worker.run_job(GUEST, JOB_ID)
    assert jobs.failed is not None and jobs.failed["transient"]
    assert jobs.completed is None
    assert not media.storage.uploaded
    assert not media.sessions.network


def test_bad_source_hash_fails_closed(monkeypatch):
    worker, media, jobs = make(monkeypatch)
    media.rows[SOURCE]["content_sha256"] = "0" * 64
    assert worker.run_job(GUEST, JOB_ID)
    assert jobs.failed is not None
    assert jobs.failed["transient"] is False
    assert not media.storage.uploaded


def test_upload_failure_requeues(monkeypatch):
    worker, media, jobs = make(monkeypatch)
    media.storage.fail_upload = True
    assert worker.run_job(GUEST, JOB_ID)
    assert jobs.failed is not None and jobs.failed["transient"]
    assert jobs.reserved == len(b"valid-preview")
    assert jobs.completed is None
