from __future__ import annotations

from app.services.avatar_product_workflow_service import AvatarProductWorkflowService


def test_extracts_universal_fields_from_messy_brief() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Create an avatar product ad for our new summer Pepsi can for Instagram for college students who want chilled refreshment.",
        image_urls=["https://example.com/pepsi.png"],
        avatar_id="aarohi_01",
    )

    assert result.fields.recipe_id == "avatar_product"
    assert result.fields.product_category == "beverage"
    assert result.fields.product_subcategory == "soft_drink"
    assert result.fields.platform == "Instagram Reels"
    assert result.fields.target_audience
    assert result.fields.main_benefit == "refreshment"
    assert result.can_generate is True


def test_field_priority_asks_next_tier1_question_only() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Make an ad for this Vitamin C serum for working women on Instagram.",
        image_urls=["https://example.com/serum.png"],
        inputs={
            "product_name": "Vitamin C serum",
            "product_category": "skincare_beauty",
            "target_audience": "working women",
            "campaign_objective": "drive_purchases",
            "platform": "Instagram Reels",
            "main_benefit": "glow",
        },
        avatar_id=None,
    )

    assert result.can_generate is False
    assert result.missing_tier_1[0] == "avatar_id"
    assert result.next_question and "avatar" in result.next_question.lower()


def test_unknown_category_falls_back_to_generic_ecommerce() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Create an avatar product ad for our new desk thing for creators.",
        image_urls=["https://example.com/product.png"],
        avatar_id="riya_01",
    )

    assert result.fields.product_category == "generic_ecommerce"
    assert result.fields.category_confidence == "low"
    assert result.next_question and "what kind of product is this" in result.next_question.lower()


def test_category_specific_follow_up_is_used_after_tier1_is_complete() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Make an ad for this Vitamin C serum for working women.",
        image_urls=["https://example.com/serum.png"],
        avatar_id="riya_01",
        inputs={
            "product_name": "Vitamin C serum",
            "product_category": "skincare_beauty",
            "target_audience": "working women",
            "campaign_objective": "drive_purchases",
            "platform": "Instagram Reels",
            "main_benefit": "glow",
        },
    )

    assert result.can_generate is True
    assert result.next_question and (
        "highlight most" in result.next_question.lower()
        or "apply the product on camera" in result.next_question.lower()
    )


def test_home_decor_prompt_extracts_better_category_audience_and_benefit() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Create an avatar product ad for a lightweight wooden wall clock using WhatsApp image.",
        image_urls=["https://example.com/clock.png"],
        avatar_id="riya_01",
    )

    assert result.fields.product_category == "home_kitchen"
    assert "home decor" in result.fields.target_audience.lower()
    assert "easy to hang" in result.fields.main_benefit.lower()


def test_frontend_home_decor_category_alias_maps_to_backend_taxonomy() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Create an avatar product ad for a lightweight wooden wall clock.",
        image_urls=["https://example.com/clock.png"],
        avatar_id="riya_01",
        advanced_controls={
            "product_category": "home_decor",
        },
    )

    assert result.fields.product_category == "home_kitchen"


def test_script_mode_fields_support_exact_script_lock() -> None:
    service = AvatarProductWorkflowService()

    result = service.assess(
        message="Create an ad for this protein oats cup.",
        image_urls=["https://example.com/oats.png"],
        avatar_id="riya_01",
        advanced_controls={
            "script_mode": "use_exact_script",
            "provided_script": "Breakfast got easier. This is ready in seconds. Try it on busy mornings.",
            "strict_script_lock": True,
        },
    )

    assert result.fields.script_mode == "use_exact_script"
    assert result.fields.provided_script.startswith("Breakfast got easier")
    assert result.fields.strict_script_lock is True


def test_prompt_config_loading_exposes_category_rules() -> None:
    service = AvatarProductWorkflowService()

    rules = service.category_rules("fashion_footwear")

    assert rules["enhancer_prompt_rules"]["showcase_focus"]
    assert rules["follow_up_questions"]
