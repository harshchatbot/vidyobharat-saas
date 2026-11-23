from app.services.harshverse.rangmanch_production_kit import production_kit, validate_shot_plan

def test_kit_is_immutable_to_callers():
    kit = production_kit()
    kit["palette"]["orange"] = "changed"
    assert production_kit()["palette"]["orange"] == "#FF6B35"

def test_missing_assets_and_voice_block_render():
    plan = {"duration_frames":90,"shots":[{"start_frame":0,"end_frame":90,
            "camera_preset":"dolly_in","hyperframe":"event_pipeline",
            "typography_preset":"kinetic_emphasis","mascot_pose":"point",
            "asset_ids":["mascot_master"]}],"narration_timing_verified":False}
    result=validate_shot_plan(plan)
    assert result["render_ready"] is False
    assert any("unverified asset" in x for x in result["problems"])

def test_unknown_camera_is_rejected():
    plan={"duration_frames":90,"shots":[{"start_frame":0,"end_frame":90,
          "camera_preset":"invented","hyperframe":"event_pipeline",
          "typography_preset":"word_reveal","mascot_pose":"neutral"}]}
    assert any("unsupported camera_preset" in x for x in validate_shot_plan(plan)["problems"])
