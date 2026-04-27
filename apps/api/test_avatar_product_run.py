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
        "text": "Create an avatar product ad for a handcrafted crochet evil eye. Highlight that it is handmade, aesthetic, meaningful, and perfect for home decor or gifting.",
        "image": "https://firebasestorage.googleapis.com/v0/b/rangmanch-ai-backend.firebasestorage.app/o/test%2Fevil_eye.jpeg?alt=media&token=9179ec9c-2027-4c2b-9a26-8b3e01f52dbf",
        "avatar_id": "av-chitrakala",
        "quality_profile": "standard",
        "duration_seconds": "10",
        "product_name": "Handcrafted Crochet Evil Eye",
        "product_category": "generic_ecommerce",
        "target_audience": "people who love handmade decor and unique gifting items",
        "main_benefit": "adds a handmade aesthetic touch and makes a thoughtful gift",
        "key_problem_solved": "finding unique handcrafted decor or gifting options",
        "campaign_objective": "drive_purchases",
        "platform": "Instagram Reels",
        "brand_tone": "creator_casual",
        "cta_preference": "Try it if you want something handmade and meaningful"
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
