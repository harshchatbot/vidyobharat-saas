import logging
from uuid import uuid4

logging.basicConfig(level=logging.INFO)

from app.pipeline.pipeline_engine import run_recipe_pipeline

video_id = f"local-avatar-product-{uuid4().hex[:8]}"
user_id = "3639081c-81e6-4435-bc39-32cadc4b8276"

print("Starting avatar product pipeline test...")
print("VIDEO_ID:", video_id)

result = run_recipe_pipeline(
    "avatar_product",
    {
        "text": "Create an avatar product ad for a lightweight glow serum for busy working women. Highlight lightweight feel, fast absorption, and simple daily glow.",
        "image": "https://www.reneecosmetics.in/cdn/shop/files/PinkTherapy_PDRN-min.jpg?v=1767174524&width=823",
        "avatar_id": "ec69762ca681409096feda92314928db",
        "quality_profile": "standard",
        "duration_seconds": "5",
        "product_name": "Lightweight Glow Serum",
        "product_category": "skincare_beauty",
        "target_audience": "busy working women",
        "main_benefit": "lightweight daily glow",
        "key_problem_solved": "dull tired-looking skin",
        "campaign_objective": "drive_purchases",
        "platform": "Instagram Reels",
        "brand_tone": "creator_casual",
        "cta_preference": "Try it if you want a simple glow"
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
print("PROVIDER:", result.provider)
print("MODEL:", result.model_key)
print("VIDEO_URL:", result.video_url)
print("METADATA:", result.metadata)
