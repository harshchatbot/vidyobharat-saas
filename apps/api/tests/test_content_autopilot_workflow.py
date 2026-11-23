"""Regression tests for the isolated Content Autopilot state machine."""
import pytest
from app.services.content_autopilot.workflow import (
    Job, Stage, PublishManifest, InvalidTransition, advance, authorized_generation,
)


def ready_job():
    job = Job(id="reel-1")
    for stage in (Stage.WRITING, Stage.GENERATING, Stage.QUALITY_CHECK, Stage.AWAITING_APPROVAL):
        job = advance(job, stage)
    return job


def manifest():
    return PublishManifest(video_sha256="abc123", caption="Example", account_id="ig-1",
                           scheduled_at="2026-12-01T10:00:00+05:30")


def test_autonomous_stages_do_not_require_intermediate_approval():
    assert ready_job().stage == Stage.AWAITING_APPROVAL


def test_schedule_requires_explicit_matching_approval():
    m = manifest()
    with pytest.raises(InvalidTransition):
        advance(ready_job(), Stage.SCHEDULED, manifest=m)
    with pytest.raises(InvalidTransition):
        advance(ready_job(), Stage.SCHEDULED, manifest=m, approval_fingerprint="wrong")
    scheduled = advance(ready_job(), Stage.SCHEDULED, manifest=m,
                        approval_fingerprint=m.fingerprint())
    assert scheduled.publishing_key
    assert scheduled.approved_fingerprint == m.fingerprint()


def test_publish_rejects_manifest_mutation():
    m = manifest()
    scheduled = advance(ready_job(), Stage.SCHEDULED, manifest=m,
                        approval_fingerprint=m.fingerprint())
    assert advance(scheduled, Stage.PUBLISHING, manifest=m).stage == Stage.PUBLISHING
    changed = PublishManifest(m.video_sha256, "Different caption", m.account_id, m.scheduled_at)
    with pytest.raises(InvalidTransition):
        advance(scheduled, Stage.PUBLISHING, manifest=changed)


def test_revision_revokes_approval():
    job = advance(ready_job(), Stage.GENERATING)
    assert job.approved_fingerprint is None
    assert job.publishing_key is None


def test_scheduled_job_cannot_be_rescheduled_without_new_workflow():
    m = manifest()
    scheduled = advance(ready_job(), Stage.SCHEDULED, manifest=m,
                        approval_fingerprint=m.fingerprint())
    with pytest.raises(InvalidTransition):
        advance(scheduled, Stage.SCHEDULED, manifest=m,
                approval_fingerprint=m.fingerprint())


def test_paid_generation_requires_preapproved_budget():
    assert not authorized_generation(estimated_credits=10, remaining_budget=100,
                                     prepaid_budget_enabled=False)
    assert not authorized_generation(estimated_credits=101, remaining_budget=100,
                                     prepaid_budget_enabled=True)
    assert authorized_generation(estimated_credits=10, remaining_budget=100,
                                 prepaid_budget_enabled=True)
