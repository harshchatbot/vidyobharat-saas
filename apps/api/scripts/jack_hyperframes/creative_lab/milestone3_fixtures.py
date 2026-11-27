"""Deterministic Milestone 3 repair and safety fixtures."""
from __future__ import annotations

import copy

from milestone2_fixtures import fixtures as milestone2_fixtures


def rendered_repair_fixtures():
    baseline = milestone2_fixtures()
    cases = {}
    camera = copy.deepcopy(baseline["camera_continuity"])
    camera["render_options"] = {"camera_jump_x": 6, "camera_jump_scene": 1}
    cases["camera_discontinuity"] = {"plan": camera, "expected": "camera_discontinuity"}
    caption = copy.deepcopy(baseline["editorial_visual"])
    caption["render_options"] = {"caption_left": 360, "caption_width": 960}
    cases["caption_safe_area"] = {"plan": caption, "expected": "text_safe_area"}
    subject = copy.deepcopy(baseline["camera_continuity"])
    subject["render_options"] = {"subject_offset_x": 3}
    cases["subject_framing"] = {"plan": subject, "expected": "geometry_bounds"}
    exposure = copy.deepcopy(baseline["exploded_product"])
    exposure["render_options"] = {"exposure": .25}
    cases["lighting_exposure"] = {"plan": exposure, "expected": "exposure"}
    transition = copy.deepcopy(baseline["particle_transition"])
    transition["render_options"] = {"transition_flash": True}
    cases["transition_flash"] = {"plan": transition, "expected": "transition_flash"}
    return cases


def safety_fixture_manifest():
    return {
        "locked_scene_protection": "repair must be blocked before plan mutation",
        "invalid_repair_rejection": "operation schema must reject unsupported transformation",
        "failed_repair_rollback": "severe regression must retain the previous best candidate",
        "retry_exhaustion": "transient retries must terminate independently of revision attempts",
        "audio_mastering": "encoded loudness failure must be remastered and remeasured",
    }
