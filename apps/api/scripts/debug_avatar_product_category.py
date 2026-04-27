from app.recipes.recipe_registry import get_recipe, validate_recipe_inputs
from app.pipeline.scene_planner import normalize_avatar_product_brief
from app.services.avatar_product_workflow_service import AvatarProductWorkflowService
from app.pipeline.pipeline_engine import (
    _avatar_product_category_hint,
    _build_avatar_product_category_preservation_rules,
    _repair_avatar_product_narration_for_category,
)

payload = {
    "text": (
        "Create a premium UGC ad for Rajasthan Kurti, a women’s blue cotton kurti brand. "
        "Show how soft, breathable, and stylish this kurti looks for daily wear."
    ),
    "image": "https://example.com/kurti.png",

    "avatar_id": "av-charulata",
    "brand_name": "Rajasthan Kurti",
    "product_name": "Rajasthan Kurti Blue Cotton Kurti",
    "product_category": "clothing",
    "product_subcategory": "women kurti",
    "target_audience": "Women looking for comfortable stylish daily wear",
    "main_benefit": "Soft breathable fabric with elegant everyday style",
    "cta_preference": "Check out Rajasthan Kurti",
    "must_show_elements": (
        "blue cotton kurti, white ethnic motifs, round neckline, button placket, "
        "3/4 sleeves, soft breathable daily wear styling"
    ),
    "must_avoid_elements": (
        "earrings, jewellery, jewelry, necklace, pendant, crochet, skincare bottle, "
        "serum bottle, western dress, random logos, changing kurti color"
    ),
    "campaign_objective": "drive_purchases",
    "platform": "Instagram Reels",
    "brand_tone": "premium_creator",
    "voice_style": "friendly, premium, natural",
    "duration_seconds": "10",
    "quality_profile": "standard",
    "video_model_key": "kling_o3_reference",
    "script_mode": "auto_generate",
}

recipe = get_recipe("avatar_product")
normalized_inputs = validate_recipe_inputs(recipe, payload)

workflow_service = AvatarProductWorkflowService()
workflow_result = workflow_service.assess(
    message=str(normalized_inputs.get("text") or ""),
    inputs=normalized_inputs,
    image_urls=[str(normalized_inputs.get("image") or "")],
    avatar_id=str(normalized_inputs.get("avatar_id") or ""),
    advanced_controls=None,
)

workflow_fields = workflow_service.export_fields(workflow_result.fields)

brief = normalize_avatar_product_brief(
    topic=str(normalized_inputs.get("text") or ""),
    explicit={
        **workflow_fields,

        # USER / FRONTEND VALUES MUST WIN OVER WORKFLOW GUESSES
        "product_name": normalized_inputs.get("product_name") or workflow_fields.get("product_name") or "",
        "product_category": normalized_inputs.get("product_category") or workflow_fields.get("product_category") or "",
        "product_subcategory": normalized_inputs.get("product_subcategory") or workflow_fields.get("product_subcategory") or "",
        "target_audience": normalized_inputs.get("target_audience") or workflow_fields.get("target_audience") or "",
        "key_promise": normalized_inputs.get("main_benefit") or workflow_fields.get("main_benefit") or "",
        "cta": normalized_inputs.get("cta_preference") or workflow_fields.get("cta_preference") or "",
    },
)

category_hint = _avatar_product_category_hint(
    normalized_inputs=normalized_inputs,
    avatar_product_brief=brief,
)

rules = _build_avatar_product_category_preservation_rules(
    product_category_hint=category_hint,
)

bad_script = "Try these handmade earrings today. They look premium and stylish."
repaired_script, forbidden_terms_found, script_repaired = _repair_avatar_product_narration_for_category(
    bad_script,
    product_category_hint=category_hint,
    product_name=brief.product_name or "Rajasthan Kurti Blue Cotton Kurti",
)

print("\n=== FRONTEND-LIKE PAYLOAD VALUES ===")
print("product_name:", normalized_inputs.get("product_name"))
print("product_category:", normalized_inputs.get("product_category"))
print("product_subcategory:", normalized_inputs.get("product_subcategory"))
print("must_show_elements:", normalized_inputs.get("must_show_elements"))
print("must_avoid_elements:", normalized_inputs.get("must_avoid_elements"))

print("\n=== WORKFLOW FIELDS ===")
print("workflow product_name:", workflow_fields.get("product_name"))
print("workflow product_category:", workflow_fields.get("product_category"))
print("workflow product_subcategory:", workflow_fields.get("product_subcategory"))

print("\n=== NORMALIZED BRIEF ===")
print("brief product_name:", brief.product_name)
print("brief product_category:", brief.product_category)
print("brief product_subcategory:", brief.product_subcategory)

print("\n=== CATEGORY LOCK RESULT ===")
print("category_hint:", category_hint)
print("rules:", rules)

print("\n=== SCRIPT REPAIR TEST ===")
print("input_script:", bad_script)
print("forbidden_terms_found:", forbidden_terms_found)
print("script_repaired:", script_repaired)
print("repaired_script:", repaired_script)