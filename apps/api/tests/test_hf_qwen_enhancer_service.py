from __future__ import annotations

from app.core.config import Settings
from app.services.hf_qwen_enhancer_service import HFQwenEnhancerInput, HFQwenEnhancerService


class _FakeHFClient:
    def __init__(self, *args, **kwargs) -> None:
        self.calls: list[dict[str, object]] = []

    def selected_model_name(self) -> str:
        return "Qwen/Test"

    def provider_name(self) -> str:
        return "hf_qwen"

    def chat_completion(self, **kwargs):
        self.calls.append(kwargs)
        return (
            '{"hook_line":"Hydration feels easier now.","showcase_line":"It sinks in fast and feels light.",'
            '"cta_line":"Worth trying if your skin feels dull.","showcase_visual_prompt":"Avatar holding the serum bottle near a bright window, applying two drops on cheek.","voice_tone":"friendly_confident","notes":["Keep bottle visible","Use natural skin texture"]}'
        )


def test_exact_script_mode_preserves_copy_without_hf_call(monkeypatch) -> None:
    fake_client = _FakeHFClient()
    monkeypatch.setattr("app.services.hf_qwen_enhancer_service.HFQwenChatClient", lambda **kwargs: fake_client)
    service = HFQwenEnhancerService(settings=Settings(_env_file=None, hf_token="test-token"))

    result = service.enhance_avatar_product_ad(
        HFQwenEnhancerInput(
            product_name="Protein oats cup",
            script_mode="use_exact_script",
            provided_script="Breakfast got easier. This is ready in seconds. Try it on busy mornings.",
            strict_script_lock=True,
        )
    )

    assert fake_client.calls == []
    assert "Breakfast got easier." in result.hook_line
    assert "ready in seconds" in result.showcase_line
    assert "Try it on busy mornings." in result.cta_line


def test_prompt_builder_includes_category_rules_and_script_mode(monkeypatch) -> None:
    fake_client = _FakeHFClient()
    monkeypatch.setattr("app.services.hf_qwen_enhancer_service.HFQwenChatClient", lambda **kwargs: fake_client)
    service = HFQwenEnhancerService(settings=Settings(_env_file=None, hf_token="test-token"))

    prompt = service._build_v4_prompt(
        HFQwenEnhancerInput(
            product_name="Vitamin C serum",
            product_type="skincare_beauty",
            target_audience="working women",
            main_benefit="glow",
            script_mode="improve_draft",
            provided_script="This serum made my skin look fresher.",
            category_prompt_rules={
                "category_context": "Focus on texture and believable on-camera application.",
                "showcase_focus": "Show product in hand and on-skin texture reveal.",
                "cta_style": "Keep the CTA soft and trust-based.",
                "visual_requirements": ["realistic skin texture", "product bottle visible"],
            },
        )
    )

    assert "script_mode=improve_draft" in prompt
    assert "Focus on texture and believable on-camera application." in prompt
    assert "product bottle visible" in prompt
