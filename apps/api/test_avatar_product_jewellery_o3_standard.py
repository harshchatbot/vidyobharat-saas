import logging
from uuid import uuid4

logging.basicConfig(level=logging.INFO)

from app.pipeline.pipeline_engine import run_recipe_pipeline

# Unique ID for the test
video_id = f"qa-jewellery-o3-standard-{uuid4().hex[:8]}"
user_id = "3639081c-81e6-4435-bc39-32cadc4b8276"

result = run_recipe_pipeline(
    "avatar_product",
    {
        "text": (
            "Create a premium UGC ad for a gold chain necklace with a blue teardrop pendant. "
            "Chitrakala must present the full necklace using BOTH HANDS to keep the chain under light tension. "
            "Hold the chain endpoints to create a clean 'U' shape with the blue pendant perfectly centered. "
            "The necklace must be presented close to the camera like high-end jewellery. "
            "Focus on the shine and the connected structure of the piece."
        ),

        "image": "https://firebasestorage.googleapis.com/v0/b/rangmanch-ai-backend.firebasestorage.app/o/test%2FGemini_Generated_Image_cihneacihneacihn.png?alt=media&token=0a8a91ab-6291-49b3-bfcb-4ddc920507ca",

        "avatar_id": "av-chitrakala",

        "quality_profile": "standard",
        "video_model_key": "kling_o3_standard_reference",
        
        # INCREASED TO 6S: Gives the viewer time to see the detail and prevents abrupt ending.
        "duration_seconds": "6",

        "product_name": "Blue Teardrop Pendant Necklace",
        "product_category": "jewellery",
        "product_subcategory": "pendant necklace",

        "target_audience": "women who love elegant jewellery and premium gifting pieces",
        "main_benefit": "adds a premium elegant touch to any look",
        "key_problem_solved": "finding a beautiful necklace for styling or gifting",
        "campaign_objective": "drive_purchases",
        "platform": "Instagram Reels",
        "brand_tone": "premium_creator",
        
        # SHORTENED CTA: Ensures it fits within the 6s window without cutting off.
        "cta_preference": "Check it out now.",

        "must_show_elements": [
            "full gold chain necklace",
            "blue teardrop pendant centered",
            "gold border with small white stones",
            "premium jewellery shine",
            "necklace held with both hands in a U-shape",
            "chain visible and connected to pendant"
        ],
        "must_avoid_elements": [
            "necklace worn on neck",
            "dangling from one hand",
            "serum bottle pose",
            "missing chain",
            "loose gemstone",
            "earrings",
            "ring",
            "bracelet",
            "distorted fingers"
        ],
    },
    video_id=video_id,
    user_id=user_id,
    voice_override="Kore",
    language_override="English",
    aspect_ratio_override="9:16",
    captions_override=False,
    narration_override=True,
)

print("DONE")
print("VIDEO_ID:", video_id)
print("PROVIDER:", result.provider)
print("MODEL:", result.model_key)
print("VIDEO_URL:", result.video_url)
print("METADATA:", result.metadata)