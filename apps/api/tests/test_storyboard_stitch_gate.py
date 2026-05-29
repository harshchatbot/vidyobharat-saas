from app.workers.storyboard_tasks import _should_queue_stitch_for_mode


def test_cinematic_stitch_gate_ready_with_narration() -> None:
    ready, reason = _should_queue_stitch_for_mode(
        cinematic_mode=True,
        all_scene_videos_completed=True,
        narration_ready=True,
        all_required_lipsync_completed=False,
    )
    assert ready is True
    assert reason == "cinematic_ready"


def test_cinematic_stitch_gate_waits_for_narration() -> None:
    ready, reason = _should_queue_stitch_for_mode(
        cinematic_mode=True,
        all_scene_videos_completed=True,
        narration_ready=False,
        all_required_lipsync_completed=True,
    )
    assert ready is False
    assert reason == "waiting_for_narration"


def test_speaking_mode_stitch_gate_waits_for_lipsync() -> None:
    ready, reason = _should_queue_stitch_for_mode(
        cinematic_mode=False,
        all_scene_videos_completed=True,
        narration_ready=False,
        all_required_lipsync_completed=False,
    )
    assert ready is False
    assert reason == "waiting_for_lipsync"
