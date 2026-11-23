from app.services.harshverse.jack_editorial_review import review_storyboard


def test_flags_absolute_claims_and_generic_visuals():
    result = review_storyboard({"scenes": [{
        "id": "s1", "beat": "value", "narration": "Sync instantly with no delays.",
        "visual_intent": "screen_capture",
    }]})
    codes = [issue["code"] for issue in result["issues"]]
    assert codes.count("absolute_claim_requires_review") == 2
    assert "visual_direction_too_generic" in codes
    assert "timing_requires_audio_alignment" in codes
    assert result["render_ready"] is False
    assert result["scene_directions"][0]["assets_verified"] is False


def test_no_false_claim_of_verification():
    result = review_storyboard({"scenes": [{
        "id": "s2", "beat": "cta", "narration": "Read the documentation.",
        "visual_intent": "end_card",
    }]})
    assert result["claims_verified"] is False
    assert result["status"] == "requires_editorial_review"
